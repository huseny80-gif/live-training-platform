// Pure Node.js PDF inspection — no external API calls
// Classifies a PDF as TEXT_BASED / IMAGE_BASED / MIXED / UNKNOWN
// by examining PDF binary content structure.

import type { PdfInspectionResult, PdfContentType } from "./types";

export function inspectPdf(buffer: Buffer): PdfInspectionResult {
  const data = buffer.toString("binary");

  // Page count via /Type /Page objects
  const pageMatches = data.match(/\/Type\s*\/Page[^s]/g) ?? [];
  let pageCount = pageMatches.length;
  // Fallback: /Count in page tree
  if (pageCount === 0) {
    const countMatch = data.match(/\/Count\s+(\d+)/);
    pageCount = countMatch ? parseInt(countMatch[1]) : 0;
  }

  // Image XObjects
  const imageObjectCount = (data.match(/\/Subtype\s*\/Image/g) ?? []).length;

  // Text show operators (Tj, TJ)
  const textOperatorCount = (data.match(/\)Tj\b|\)TJ\b|\]\s*TJ\b/g) ?? []).length;

  // Embedded fonts
  const hasEmbeddedFonts = /\/Type\s*\/Font\b/.test(data);

  // Classification thresholds
  let contentType: PdfContentType;
  if (imageObjectCount > 50 && textOperatorCount < 20) {
    contentType = "IMAGE_BASED";
  } else if (textOperatorCount > 200 && imageObjectCount < 20) {
    contentType = "TEXT_BASED";
  } else if (textOperatorCount > 20 && imageObjectCount > 20) {
    contentType = "MIXED";
  } else {
    contentType = "UNKNOWN";
  }

  const requiresOcr = contentType === "IMAGE_BASED" || contentType === "MIXED";

  return {
    pageCount,
    fileSizeBytes: buffer.length,
    contentType,
    imageObjectCount,
    textOperatorCount,
    hasEmbeddedFonts,
    requiresOcr,
  };
}
