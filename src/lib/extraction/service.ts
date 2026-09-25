// DocumentExtractionService — orchestrates PDF inspection → adapter selection
// → page extraction → quality validation → DocumentPage persistence.
//
// The service is adapter-agnostic: swap LlamaParseAdapter for VisionLLMAdapter
// or any future adapter without changing callers.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { storage } from "@/lib/storage/local";
import { inspectPdf } from "./pdf-inspector";
import type { ExtractionAdapter, PdfInspectionResult, ExtractedPage } from "./types";
import { LlamaParseAdapter } from "./adapters/llamaparse";
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

// Adapter registry — ordered by preference
function getAdapters(): ExtractionAdapter[] {
  const adapters: ExtractionAdapter[] = [];
  if (process.env.LLAMA_CLOUD_API_KEY) {
    adapters.push(new LlamaParseAdapter());
  }
  // MockAdapter as final fallback — always available, used in test/dev
  adapters.push(new MockExtractionAdapter());
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

      // Select adapter
      const adapters = getAdapters();
      const adapter = adapters.find((a) => a.supports(inspection.contentType));
      if (!adapter) throw new Error("NO_ADAPTER_AVAILABLE");

      // Extract pages
      const result = await adapter.extract({
        fileBuffer: buffer,
        fileName: doc.fileName,
        mimeType: "application/pdf",
        pageNumbers,
      });

      // Persist each extracted page
      for (const page of result.pages) {
        await this.persistPage(documentId, page);
      }

      const finalStatus: DocumentProcessingStatus =
        result.failureCount === 0
          ? "COMPLETED"
          : result.successCount === 0
          ? "FAILED"
          : "PROCESSING";

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
    const adapters = getAdapters();
    const adapter = adapters.find((a) => a.supports(inspection.contentType));
    if (!adapter) return null;

    const result = await adapter.extract({
      fileBuffer: buffer,
      fileName: doc.fileName,
      mimeType: "application/pdf",
      pageNumbers: [pageNumber],
    });

    if (result.pages.length > 0) {
      await this.persistPage(documentId, result.pages[0]);
      return result.pages[0];
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
