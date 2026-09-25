// ─────────────────────────────────────────────────────────────────────────────
// Extraction layer types
// ─────────────────────────────────────────────────────────────────────────────

export type PdfContentType = "TEXT_BASED" | "IMAGE_BASED" | "MIXED" | "UNKNOWN";

export type ExtractionMethod = "NATIVE_TEXT" | "LLAMAPARSE" | "VISION_LLM" | "MOCK";

export type PageExtractionStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "OCR_REQUIRED";

export interface PdfInspectionResult {
  pageCount: number;
  fileSizeBytes: number;
  contentType: PdfContentType;
  imageObjectCount: number;
  textOperatorCount: number;
  hasEmbeddedFonts: boolean;
  requiresOcr: boolean;
}

export interface ExtractedPage {
  pageNumber: number;           // 1-indexed
  extractedText: string;        // Markdown or plain text from extraction
  extractedJson?: unknown;      // Structured data if adapter supports it
  title?: string;               // Detected slide/page title
  extractionMethod: ExtractionMethod;
  extractionStatus: PageExtractionStatus;
  confidenceScore?: number;     // 0.0–1.0 if adapter provides
  errorMessage?: string;
  processingMs?: number;
}

export interface ExtractionRequest {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  pageNumbers?: number[];       // undefined = all pages
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  method: ExtractionMethod;
  totalPages: number;
  successCount: number;
  failureCount: number;
  processingMs: number;
}

export interface ExtractionAdapter {
  name: ExtractionMethod;
  /** Whether this adapter can handle the given content type */
  supports(contentType: PdfContentType): boolean;
  /** Extract text/content from pages */
  extract(req: ExtractionRequest): Promise<ExtractionResult>;
}
