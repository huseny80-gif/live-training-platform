import type { ExtractionAdapter, ExtractionRequest, ExtractionResult, ExtractedPage } from "../types";

/** Read embedded PDF text locally; image-only pages require a real OCR provider. */
export class NativeTextAdapter implements ExtractionAdapter {
  readonly name = "NATIVE_TEXT" as const;

  supports(): boolean { return true; }

  async extract(req: ExtractionRequest): Promise<ExtractionResult> {
    const start = Date.now();
    const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(req.fileBuffer),
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0,
    });
    try {
      const pdf = await task.promise;
      const targets = req.pageNumbers ?? Array.from({ length: pdf.numPages }, (_, i) => i + 1);
      const pages: ExtractedPage[] = [];
      for (const pageNumber of targets) {
        if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) {
          throw new Error("INVALID_PAGE_NUMBER");
        }
        const page = await pdf.getPage(pageNumber);
        try {
          const content = await page.getTextContent();
          const text = content.items.map(item => "str" in item
            ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim();
          const imageOps = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject]);
          const scanned = !text && (await page.getOperatorList()).fnArray.some(op => imageOps.has(op));
          pages.push({
            pageNumber, extractedText: text, extractionMethod: this.name,
            extractionStatus: scanned ? "OCR_REQUIRED" : "COMPLETED",
            errorMessage: scanned ? "OCR_REQUIRED" : undefined,
          });
        } finally { page.cleanup(); }
      }
      return {
        pages, method: this.name, totalPages: pdf.numPages,
        successCount: pages.filter(p => p.extractionStatus === "COMPLETED" && p.extractedText.trim()).length,
        failureCount: pages.filter(p => p.extractionStatus !== "COMPLETED").length,
        processingMs: Date.now() - start,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "PasswordException") throw new Error("PDF_PASSWORD_REQUIRED");
      if (error instanceof Error && error.name === "InvalidPDFException") throw new Error("INVALID_PDF");
      throw error;
    } finally { await task.destroy(); }
  }
}
