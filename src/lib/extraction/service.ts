// DocumentExtractionService — orchestrates PDF inspection → adapter selection
// → page extraction → quality validation → DocumentPage persistence.
//
// The service is adapter-agnostic: swap LlamaParseAdapter for VisionLLMAdapter
// or any future adapter without changing callers.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { storage } from "@/lib/storage";
import { inspectPdf } from "./pdf-inspector";
import type { ExtractionAdapter, PdfInspectionResult, ExtractedPage, ExtractionRequest, ExtractionResult } from "./types";
import { LlamaParseAdapter } from "./adapters/llamaparse";
import { NativeTextAdapter } from "./adapters/native-text";
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
  const adapters: ExtractionAdapter[] = [new NativeTextAdapter()];
  if (process.env.LLAMA_CLOUD_API_KEY) {
    adapters.push(new LlamaParseAdapter());
  }
  // Synthetic source content must never be persisted in production.
  if (process.env.NODE_ENV !== "production") {
    adapters.push(new MockExtractionAdapter());
  }
  return adapters;
}

export class DocumentExtractionService {
  /** Full pipeline: inspect → classify → extract → persist per-page */
  async processDocument(
    documentId: string,
    instructorId: string,
    pageNumbers?: number[],
    options: { keepProcessing?: boolean } = {}
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

      const result = await this.extract(inspection, {
        fileBuffer: buffer, fileName: doc.fileName, mimeType: "application/pdf", pageNumbers,
      });
      await prisma.trainingDocument.update({
        where: { id: documentId }, data: { pageCount: result.totalPages },
      });

      // Persist each extracted page
      for (const page of result.pages) {
        await this.persistPage(documentId, page);
      }

      const finalStatus: DocumentProcessingStatus = result.failureCount > 0
        ? (result.pages.some(p => p.extractionStatus === "OCR_REQUIRED") ? "OCR_REQUIRED" : "FAILED")
        : result.successCount > 0 ? "COMPLETED" : "OCR_REQUIRED";

      await this.updateDocumentStatus(documentId, options.keepProcessing ? "PROCESSING" : finalStatus);

      return {
        documentId,
        status: finalStatus,
        totalPages: result.totalPages,
        completedPages: result.successCount,
        failedPages: result.failureCount,
        inspection,
        errorMessage: finalStatus === "COMPLETED" ? undefined : finalStatus === "OCR_REQUIRED" ? "OCR_REQUIRED" : "EXTRACTION_INCOMPLETE",
      };
    } catch (err) {
      await this.updateDocumentStatus(documentId, options.keepProcessing ? "PROCESSING" : "FAILED");
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
    const result = await this.extract(inspection, {
      fileBuffer: buffer, fileName: doc.fileName, mimeType: "application/pdf", pageNumbers: [pageNumber],
    });

    if (result.pages.length > 0) {
      await this.persistPage(documentId, result.pages[0]);
      return result.pages[0];
    }
    return null;
  }

  private async extract(inspection: PdfInspectionResult, request: ExtractionRequest): Promise<ExtractionResult> {
    let result: ExtractionResult | undefined;
    let lastError: unknown;
    for (const adapter of getAdapters()) {
      if (!adapter.supports(inspection.contentType)) continue;
      try {
        result = await adapter.extract(request);
        if (result.successCount > 0 && result.failureCount === 0) return result;
      } catch (error) { lastError = error; }
    }
    // Preserve real partial extraction and report OCR requirements. Never fabricate production text.
    if (result) return result;
    throw lastError ?? new Error("NO_ADAPTER_AVAILABLE");
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
