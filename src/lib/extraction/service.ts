// DocumentExtractionService — orchestrates PDF inspection → adapter selection
// → page extraction → quality validation → DocumentPage persistence.
//
// The service is adapter-agnostic: swap LlamaParseAdapter for VisionLLMAdapter
// or any future adapter without changing callers.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { storage } from "@/lib/storage";
import { inspectPdf } from "./pdf-inspector";
import type { ExtractionAdapter, PdfInspectionResult, ExtractedPage, ExtractionResult } from "./types";
import { LlamaParseAdapter } from "./adapters/llamaparse";
import { OpenAIPdfExtractionAdapter } from "./adapters/openai-pdf";
import { MockExtractionAdapter } from "./adapters/mock";

export type DocumentProcessingStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "OCR_REQUIRED"
  | "FAILED";

export interface ProcessingProgress {
  documentId: string;
  status: DocumentProcessingStatus;
  totalPages: number;
  completedPages: number;
  failedPages: number;
  inspection?: PdfInspectionResult;
  errorMessage?: string;
}

// Adapter registry — ordered by production preference.
// IMPORTANT: Mock extraction is never a production fallback. It is available
// only in tests/dev when explicitly enabled.
const OPENAI_PDF_BATCH_SIZE = 15;
const OPENAI_PDF_CONCURRENCY = 2;
const MIN_REAL_SOURCE_COVERAGE = 0.7;

function requiredReadablePages(totalPages: number): number {
  if (totalPages <= 0) return 1;
  return Math.max(1, Math.ceil(totalPages * MIN_REAL_SOURCE_COVERAGE));
}

function chunkPageNumbers(values: number[], size: number): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

async function extractWithAdapter(
  adapter: ExtractionAdapter,
  params: {
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
    targetPages: number[];
  }
): Promise<ExtractionResult> {
  const { fileBuffer, fileName, mimeType, targetPages } = params;

  if (adapter.name !== "OPENAI_PDF" || targetPages.length <= OPENAI_PDF_BATCH_SIZE) {
    return adapter.extract({
      fileBuffer,
      fileName,
      mimeType,
      pageNumbers: targetPages.length > 0 ? targetPages : undefined,
    });
  }

  const batches = chunkPageNumbers(targetPages, OPENAI_PDF_BATCH_SIZE);
  const byPage = new Map<number, ExtractedPage>();
  const batchErrors: string[] = [];
  let processingMs = 0;

  for (let i = 0; i < batches.length; i += OPENAI_PDF_CONCURRENCY) {
    const group = batches.slice(i, i + OPENAI_PDF_CONCURRENCY);
    const groupResults = await Promise.all(
      group.map(async (pageBatch) => {
        try {
          return await adapter.extract({
            fileBuffer,
            fileName,
            mimeType,
            pageNumbers: pageBatch,
          });
        } catch (error) {
          batchErrors.push(
            `pages ${pageBatch[0]}-${pageBatch[pageBatch.length - 1]}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return null;
        }
      })
    );

    for (const result of groupResults) {
      if (!result) continue;
      processingMs += result.processingMs;
      for (const page of result.pages) {
        byPage.set(page.pageNumber, page);
      }
    }
  }

  const pages = [...byPage.values()].sort((a, b) => a.pageNumber - b.pageNumber);
  const successCount = pages.filter(
    (page) => page.extractionStatus === "COMPLETED"
  ).length;

  if (successCount === 0) {
    throw new Error(
      `OPENAI_PDF_BATCH_EXTRACTION_FAILED — ${batchErrors.join(" | ")}`
    );
  }

  return {
    pages,
    method: "OPENAI_PDF",
    totalPages: targetPages.length,
    successCount,
    failureCount: Math.max(0, targetPages.length - successCount),
    processingMs,
  };
}

function getAdapters(): ExtractionAdapter[] {
  const adapters: ExtractionAdapter[] = [];

  // Reuse the platform's existing OpenAI key for real PDF/OCR extraction.
  if (process.env.OPENAI_API_KEY) {
    adapters.push(new OpenAIPdfExtractionAdapter());
  }

  // Optional secondary provider.
  if (process.env.LLAMA_CLOUD_API_KEY) {
    adapters.push(new LlamaParseAdapter());
  }

  const allowMock =
    process.env.ALLOW_MOCK_EXTRACTION === "true" ||
    process.env.NODE_ENV === "test";

  if (allowMock) {
    adapters.push(new MockExtractionAdapter());
  }

  return adapters;
}

export class DocumentExtractionService {
  /** Full pipeline: inspect → classify → extract → persist per-page */
  async processDocument(
    documentId: string,
    instructorId: string,
    pageNumbers?: number[]
  ): Promise<ProcessingProgress> {
    // Load document and verify ownership
    const doc = await prisma.trainingDocument.findFirst({
      where: {
        id: documentId,
        program: { instructorId },
      },
    });
    if (!doc) throw new Error("NOT_FOUND");

    await this.updateDocumentStatus(documentId, "PROCESSING");

    try {
      // Read file from storage
      const buffer = await storage.read(doc.storagePath);

      // Inspect PDF
      const inspection = inspectPdf(buffer);

      // Update page count if not already set
      if (!doc.pageCount) {
        await prisma.trainingDocument.update({
          where: { id: documentId },
          data: { pageCount: inspection.pageCount },
        });
      }

      // Update contentType in DB (DocumentContentType enum)
      const contentTypeMap: Record<string, string> = {
        TEXT_BASED: "TEXT_BASED",
        IMAGE_BASED: "IMAGE_BASED",
        MIXED: "MIXED",
        UNKNOWN: "UNKNOWN",
      };
      await prisma.trainingDocument.update({
        where: { id: documentId },
        data: { contentType: contentTypeMap[inspection.contentType] as "TEXT_BASED" | "IMAGE_BASED" | "MIXED" | "UNKNOWN" },
      });

      // Select a real adapter and fall back only between real providers.
      const adapters = getAdapters().filter((adapter) =>
        adapter.supports(inspection.contentType)
      );
      if (adapters.length === 0) {
        throw new Error(
          "NO_REAL_EXTRACTION_ADAPTER — configure OPENAI_API_KEY or LLAMA_CLOUD_API_KEY"
        );
      }

      const targetPages =
        pageNumbers && pageNumbers.length > 0
          ? [...new Set(pageNumbers)].sort((a, b) => a - b)
          : inspection.pageCount > 0
          ? Array.from({ length: inspection.pageCount }, (_, index) => index + 1)
          : [];

      let result: ExtractionResult | null = null;
      const adapterErrors: string[] = [];

      for (const adapter of adapters) {
        try {
          const candidate = await extractWithAdapter(adapter, {
            fileBuffer: buffer,
            fileName: doc.fileName,
            mimeType: "application/pdf",
            targetPages,
          });

          if (candidate.successCount > 0 && candidate.method !== "MOCK") {
            result = candidate;
            break;
          }

          adapterErrors.push(
            `${adapter.name}: no real extracted pages were returned`
          );
        } catch (error) {
          adapterErrors.push(
            `${adapter.name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (!result) {
        throw new Error(
          `REAL_EXTRACTION_FAILED — ${adapterErrors.join(" | ")}`
        );
      }

      // Persist each extracted page
      for (const page of result.pages) {
        await this.persistPage(documentId, page);
      }

      // Once a real provider succeeds, remove any stale MOCK-only rows that
      // were not replaced by page-number upserts. Questions linked to them
      // use onDelete:SetNull, so historical content is not corrupted.
      if (result.method !== "MOCK") {
        await prisma.documentPage.deleteMany({
          where: { documentId, extractionMethod: "MOCK" },
        });
      }

      // A large training document must have enough real coverage before it is
      // considered safe for 10-day / 50-question generation.
      const intendedPageCount =
        targetPages.length > 0
          ? targetPages.length
          : Math.max(result.totalPages, inspection.pageCount);
      const requiredPages = requiredReadablePages(intendedPageCount);
      const finalStatus: DocumentProcessingStatus =
        result.successCount >= requiredPages
          ? "COMPLETED"
          : result.successCount > 0
          ? "OCR_REQUIRED"
          : "FAILED";

      await this.updateDocumentStatus(documentId, finalStatus);

      return {
        documentId,
        status: finalStatus,
        totalPages: intendedPageCount,
        completedPages: result.successCount,
        failedPages: Math.max(0, intendedPageCount - result.successCount),
        inspection,
        errorMessage:
          finalStatus === "COMPLETED"
            ? undefined
            : `INSUFFICIENT_REAL_EXTRACTION_COVERAGE — extracted ${result.successCount}/${intendedPageCount}; require at least ${requiredPages}`,
      };
    } catch (err) {
      await this.updateDocumentStatus(documentId, "FAILED");
      const msg = err instanceof Error ? err.message : "Unknown error";
      return {
        documentId,
        status: "FAILED",
        totalPages: 0,
        completedPages: 0,
        failedPages: 0,
        errorMessage: msg,
      };
    }
  }

  /**
   * Ensure the document has real, non-MOCK extracted source pages.
   * Existing MOCK pages are replaced in-place via persistPage upserts.
   */
  async ensureRealExtraction(
    documentId: string,
    instructorId: string
  ): Promise<ProcessingProgress | null> {
    const document = await prisma.trainingDocument.findFirst({
      where: { id: documentId, program: { instructorId } },
      select: {
        pageCount: true,
        pages: {
          select: {
            extractionMethod: true,
            extractionStatus: true,
            extractedText: true,
          },
        },
      },
    });
    if (!document) throw new Error("NOT_FOUND");

    const realReadableCount = document.pages.filter(
      (page) =>
        page.extractionMethod !== null &&
        page.extractionMethod !== "MOCK" &&
        page.extractionStatus === "COMPLETED" &&
        (page.extractedText?.trim().length ?? 0) > 50
    ).length;

    const expectedPages = document.pageCount ?? document.pages.length;
    const requiredPages = requiredReadablePages(expectedPages);

    if (realReadableCount >= requiredPages) {
      return null;
    }

    return this.processDocument(documentId, instructorId);
  }

  /**
   * Select the best real source document for a program.
   *
   * Selection rules:
   * 1) Prefer documents that already contain real, readable extracted pages.
   * 2) Rank by real readable page count, then extracted character count,
   *    then recency.
   * 3) If none is ready, attempt real extraction document-by-document
   *    (newest first) until a usable source is found.
   *
   * This prevents duplicate uploads / stale MOCK rows / a newer pending file
   * from hiding an older, fully extracted real source.
   */
  async selectBestRealSourceDocument(
    programId: string,
    instructorId: string
  ): Promise<
    | {
        ok: true;
        documentId: string;
        fileName: string;
        realPageCount: number;
        realCharacterCount: number;
      }
    | {
        ok: false;
        errorMessage: string;
      }
  > {
    const program = await prisma.trainingProgram.findFirst({
      where: { id: programId, instructorId },
      select: { id: true },
    });
    if (!program) {
      return { ok: false, errorMessage: "PROGRAM_NOT_FOUND" };
    }

    const documents = await prisma.trainingDocument.findMany({
      where: { programId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        pageCount: true,
        createdAt: true,
        pages: {
          where: { extractionStatus: "COMPLETED" },
          select: {
            extractionMethod: true,
            extractedText: true,
          },
        },
      },
    });

    if (documents.length === 0) {
      return { ok: false, errorMessage: "NO_TRAINING_DOCUMENT" };
    }

    const scoreDocument = (doc: (typeof documents)[number]) => {
      const realPages = doc.pages.filter(
        (page) =>
          page.extractionMethod !== null &&
          page.extractionMethod !== "MOCK" &&
          (page.extractedText?.trim().length ?? 0) > 20
      );
      return {
        doc,
        realPageCount: realPages.length,
        realCharacterCount: realPages.reduce(
          (sum, page) => sum + (page.extractedText?.trim().length ?? 0),
          0
        ),
      };
    };

    const ready = documents
      .map(scoreDocument)
      .filter((entry) =>
        entry.realPageCount >= requiredReadablePages(entry.doc.pageCount ?? entry.doc.pages.length)
      )
      .sort((a, b) => {
        if (b.realPageCount !== a.realPageCount) {
          return b.realPageCount - a.realPageCount;
        }
        if (b.realCharacterCount !== a.realCharacterCount) {
          return b.realCharacterCount - a.realCharacterCount;
        }
        return b.doc.createdAt.getTime() - a.doc.createdAt.getTime();
      })[0];

    if (ready) {
      return {
        ok: true,
        documentId: ready.doc.id,
        fileName: ready.doc.fileName,
        realPageCount: ready.realPageCount,
        realCharacterCount: ready.realCharacterCount,
      };
    }

    let lastError = "REAL_SOURCE_REQUIRED";

    for (const doc of documents) {
      const extraction = await this.ensureRealExtraction(doc.id, instructorId);
      if (extraction && extraction.status !== "COMPLETED") {
        lastError = extraction.errorMessage ?? "REAL_EXTRACTION_FAILED";
        continue;
      }

      const realPages = await prisma.documentPage.findMany({
        where: {
          documentId: doc.id,
          extractionStatus: "COMPLETED",
          NOT: { extractionMethod: "MOCK" },
        },
        select: {
          extractionMethod: true,
          extractedText: true,
        },
      });

      const readable = realPages.filter(
        (page) =>
          page.extractionMethod !== null &&
          page.extractionMethod !== "MOCK" &&
          (page.extractedText?.trim().length ?? 0) > 20
      );

      const requiredPages = requiredReadablePages(
        doc.pageCount ?? readable.length
      );

      if (readable.length >= requiredPages) {
        return {
          ok: true,
          documentId: doc.id,
          fileName: doc.fileName,
          realPageCount: readable.length,
          realCharacterCount: readable.reduce(
            (sum, page) => sum + (page.extractedText?.trim().length ?? 0),
            0
          ),
        };
      }

      lastError =
        `INSUFFICIENT_REAL_EXTRACTION_COVERAGE — extracted ${readable.length}/${doc.pageCount ?? "unknown"}; require at least ${requiredPages}`;
    }

    return { ok: false, errorMessage: lastError };
  }

  /** Retry a single failed page without reprocessing the whole document */
  async retryPage(
    documentId: string,
    pageNumber: number,
    instructorId: string
  ): Promise<ExtractedPage | null> {
    const doc = await prisma.trainingDocument.findFirst({
      where: { id: documentId, program: { instructorId } },
    });
    if (!doc) throw new Error("NOT_FOUND");

    const buffer = await storage.read(doc.storagePath);
    const inspection = inspectPdf(buffer);
    const adapters = getAdapters().filter((adapter) =>
      adapter.supports(inspection.contentType)
    );

    for (const adapter of adapters) {
      if (adapter.name === "MOCK") continue;
      try {
        const result = await adapter.extract({
          fileBuffer: buffer,
          fileName: doc.fileName,
          mimeType: "application/pdf",
          pageNumbers: [pageNumber],
        });

        const page = result.pages.find(
          (candidate) => candidate.pageNumber === pageNumber
        );
        if (page && page.extractionStatus === "COMPLETED") {
          await this.persistPage(documentId, page);
          return page;
        }
      } catch {
        // Try the next real provider.
      }
    }

    return null;
  }

  private async persistPage(documentId: string, page: ExtractedPage): Promise<void> {
    type PageStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "OCR_REQUIRED";
    const status = page.extractionStatus as PageStatus;
    const jsonValue: Prisma.InputJsonValue | typeof Prisma.JsonNull = page.extractedJson
      ? (page.extractedJson as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    await prisma.documentPage.upsert({
      where: { documentId_pageNumber: { documentId, pageNumber: page.pageNumber } },
      create: {
        documentId,
        pageNumber: page.pageNumber,
        title: page.title,
        extractedText: page.extractedText,
        extractedJson: jsonValue,
        extractionMethod: page.extractionMethod,
        extractionStatus: status,
        errorMessage: page.errorMessage,
      },
      update: {
        title: page.title,
        extractedText: page.extractedText,
        extractedJson: jsonValue,
        extractionMethod: page.extractionMethod,
        extractionStatus: status,
        errorMessage: page.errorMessage,
      },
    });
  }

  private async updateDocumentStatus(
    documentId: string,
    status: DocumentProcessingStatus
  ): Promise<void> {
    const statusMap: Record<DocumentProcessingStatus, string> = {
      PENDING: "PENDING",
      PROCESSING: "PROCESSING",
      COMPLETED: "COMPLETED",
      OCR_REQUIRED: "OCR_REQUIRED",
      FAILED: "FAILED",
    };
    await prisma.trainingDocument.update({
      where: { id: documentId },
      data: { extractionStatus: statusMap[status] as "PENDING" | "PROCESSING" | "COMPLETED" | "OCR_REQUIRED" | "FAILED" },
    });
  }
}

export const extractionService = new DocumentExtractionService();
