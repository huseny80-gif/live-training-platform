// DocumentExtractionService — orchestrates PDF inspection → adapter selection
// → page extraction → quality validation → DocumentPage persistence.
//
// The service is adapter-agnostic: swap LlamaParseAdapter for VisionLLMAdapter
// or any future adapter without changing callers.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { storage } from "@/lib/storage";
import { inspectPdf } from "./pdf-inspector";
import type { ExtractionAdapter, PdfInspectionResult, ExtractedPage } from "./types";
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

      let result: Awaited<ReturnType<ExtractionAdapter["extract"]>> | null = null;
      const adapterErrors: string[] = [];

      for (const adapter of adapters) {
        try {
          const candidate = await adapter.extract({
            fileBuffer: buffer,
            fileName: doc.fileName,
            mimeType: "application/pdf",
            pageNumbers,
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

      // Partial success is still usable — treat as COMPLETED so content
      // generation can proceed with the pages that did extract.
      const finalStatus: DocumentProcessingStatus =
        result.successCount > 0 ? "COMPLETED" : "FAILED";

      await this.updateDocumentStatus(documentId, finalStatus);

      return {
        documentId,
        status: finalStatus,
        totalPages: result.totalPages,
        completedPages: result.successCount,
        failedPages: result.failureCount,
        inspection,
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
    const pages = await prisma.documentPage.findMany({
      where: { documentId },
      select: {
        extractionMethod: true,
        extractionStatus: true,
        extractedText: true,
      },
    });

    const hasMockPages = pages.some(
      (page) => page.extractionMethod === "MOCK"
    );
    const hasRealReadablePages = pages.some(
      (page) =>
        page.extractionMethod !== "MOCK" &&
        page.extractionStatus === "COMPLETED" &&
        (page.extractedText?.trim().length ?? 0) > 50
    );

    if (hasRealReadablePages && !hasMockPages) {
      return null;
    }

    return this.processDocument(documentId, instructorId);
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
