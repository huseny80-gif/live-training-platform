import assert from "node:assert/strict";
import { NativeTextExtractionAdapter } from "../src/lib/extraction/adapters/native-text";

function buildTwoPagePdf(): Buffer {
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>\nendobj\n",
    "5 0 obj\n<< /Length 58 >>\nstream\nBT /F1 12 Tf 72 720 Td (Introduction to GIS fundamentals) Tj ET\nendstream\nendobj\n",
    "6 0 obj\n<< /Length 62 >>\nstream\nBT /F1 12 Tf 72 720 Td (Spatial data types and coordinate systems) Tj ET\nendstream\nendobj\n",
    "7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  return Buffer.from("%PDF-1.4\n" + objects.join("") + "%%EOF\n", "latin1");
}

const adapter = new NativeTextExtractionAdapter();
assert.equal(adapter.supports("TEXT_BASED"), true);
assert.equal(adapter.supports("UNKNOWN"), true);
assert.equal(adapter.supports("IMAGE_BASED"), false);

const result = await adapter.extract({
  fileBuffer: buildTwoPagePdf(),
  fileName: "sample.pdf",
  mimeType: "application/pdf",
});

assert.equal(result.method, "NATIVE_TEXT");
assert.equal(result.successCount, 2);
assert.equal(result.pages.length, 2);
assert.match(result.pages[0].extractedText, /Introduction to GIS fundamentals/);
assert.match(result.pages[1].extractedText, /Spatial data types and coordinate systems/);
assert.equal(result.pages[0].pageNumber, 1);
assert.equal(result.pages[1].pageNumber, 2);

console.log("✓ native PDF text extraction tests passed");
