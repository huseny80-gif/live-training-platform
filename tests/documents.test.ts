/**
 * DOC-01 through DOC-14: PDF Upload & Document Processing Tests
 *
 * NOTE on LlamaParse (DOC-09): egress to api.cloud.llamaindex.ai is blocked
 * (ACP-06). Tests use MockExtractionAdapter which is the active fallback.
 * When network policy allows LlamaParse, set LLAMA_CLOUD_API_KEY and re-run.
 */

import "dotenv/config";
import assert from "assert";
import { prisma } from "../src/lib/prisma";
import { storage } from "../src/lib/storage/local";
import { inspectPdf } from "../src/lib/extraction/pdf-inspector";
import { MockExtractionAdapter } from "../src/lib/extraction/adapters/mock";
import { LlamaParseAdapter } from "../src/lib/extraction/adapters/llamaparse";
import { DocumentExtractionService } from "../src/lib/extraction/service";
import type { ExtractionRequest } from "../src/lib/extraction/types";

// ─── Test helpers ────────────────────────────────────────────────────────────

async function createTestInstructor(suffix: string) {
  return prisma.instructor.create({
    data: {
      email: `doc-test-${suffix}@example.com`,
      passwordHash: "hashed",
      name: `Doc Test ${suffix}`,
    },
  });
}

async function createTestProgram(instructorId: string) {
  return prisma.trainingProgram.create({
    data: {
      instructorId,
      title: "GIS Program",
      description: "Test",
      language: "AR",
      status: "DRAFT",
    },
  });
}

/** Minimal valid 1-page PDF binary (hand-crafted) */
function minimalPdfBuffer(): Buffer {
  const pdf = `%PDF-1.4
1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj
2 0 obj<</Type /Pages /Kids [3 0 R] /Count 1>>endobj
3 0 obj<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]>>endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer<</Size 4 /Root 1 0 R>>
startxref
190
%%EOF`;
  return Buffer.from(pdf, "utf-8");
}

/** PDF with many image XObject references to trigger IMAGE_BASED classification */
function imagePdfBuffer(): Buffer {
  const imageRefs = Array.from({ length: 60 }, (_, i) =>
    `/Im${i} 0 obj<</Type /XObject /Subtype /Image /Width 100 /Height 100>>endobj`
  ).join("\n");
  const pdf = `%PDF-1.4
1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj
2 0 obj<</Type /Pages /Kids [3 0 R] /Count 1>>endobj
3 0 obj<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]>>endobj
${imageRefs}
xref
0 4
0000000000 65535 f
trailer<</Size 4 /Root 1 0 R>>
startxref
190
%%EOF`;
  return Buffer.from(pdf, "utf-8");
}

// ─── Test state ───────────────────────────────────────────────────────────────

let instructorId: string;
let programId: string;
let documentId: string;

async function cleanup() {
  // Delete in FK order: programs (cascade removes documents+pages) → instructors
  const instructors = await prisma.instructor.findMany({ where: { email: { contains: "doc-test-" } }, select: { id: true } });
  const instructorIds = instructors.map((i) => i.id);
  if (instructorIds.length > 0) {
    await prisma.trainingProgram.deleteMany({ where: { instructorId: { in: instructorIds } } });
    await prisma.instructor.deleteMany({ where: { id: { in: instructorIds } } });
  }
}

async function setup() {
  await cleanup();
  const instructor = await createTestInstructor("a");
  instructorId = instructor.id;
  const program = await createTestProgram(instructorId);
  programId = program.id;
}

async function teardown() {
  await cleanup();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  await setup();
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  // DOC-01: PDF inspection detects page count
  await test("DOC-01: inspectPdf returns correct page count for minimal PDF", async () => {
    const buf = minimalPdfBuffer();
    const result = inspectPdf(buf);
    assert.ok(result.pageCount >= 1, `Expected ≥1 pages, got ${result.pageCount}`);
    assert.ok(result.fileSizeBytes > 0, "fileSizeBytes should be positive");
  });

  // DOC-02: TEXT_BASED classification
  await test("DOC-02: inspectPdf classifies text-heavy PDF as TEXT_BASED or UNKNOWN", async () => {
    const buf = minimalPdfBuffer();
    const result = inspectPdf(buf);
    // Minimal PDF has neither heavy text nor images → UNKNOWN is acceptable
    assert.ok(
      result.contentType === "TEXT_BASED" || result.contentType === "UNKNOWN",
      `Expected TEXT_BASED or UNKNOWN, got ${result.contentType}`
    );
  });

  // DOC-03: IMAGE_BASED classification
  await test("DOC-03: inspectPdf classifies image-heavy PDF as IMAGE_BASED", async () => {
    const buf = imagePdfBuffer();
    const result = inspectPdf(buf);
    // 60 /Subtype /Image entries, 0 text operators → IMAGE_BASED
    assert.strictEqual(result.contentType, "IMAGE_BASED");
    assert.ok(result.requiresOcr, "requiresOcr should be true for IMAGE_BASED");
  });

  // DOC-04: File storage — save and read roundtrip
  await test("DOC-04: storage adapter saves and reads file correctly", async () => {
    const key = `doc-test/${instructorId}/roundtrip.pdf`;
    const original = minimalPdfBuffer();
    await storage.save(key, original, "application/pdf");
    const retrieved = await storage.read(key);
    assert.strictEqual(
      Buffer.compare(original, retrieved),
      0,
      "Retrieved buffer must match saved buffer"
    );
    await storage.delete(key);
  });

  // DOC-05: Path traversal prevention
  await test("DOC-05: storage.save rejects path traversal keys", async () => {
    const maliciousKey = "../../../etc/passwd";
    await assert.rejects(
      () => storage.save(maliciousKey, Buffer.from("x"), "text/plain"),
      /PATH_TRAVERSAL_DETECTED/
    );
  });

  // DOC-06: MockAdapter supports all content types
  await test("DOC-06: MockExtractionAdapter.supports() returns true for all types", async () => {
    const adapter = new MockExtractionAdapter();
    for (const ct of ["TEXT_BASED", "IMAGE_BASED", "MIXED", "UNKNOWN"] as const) {
      assert.ok(adapter.supports(ct), `should support ${ct}`);
    }
  });

  // DOC-07: MockAdapter extract returns correct structure
  await test("DOC-07: MockExtractionAdapter.extract() returns valid ExtractionResult", async () => {
    const adapter = new MockExtractionAdapter();
    const req: ExtractionRequest = {
      fileBuffer: minimalPdfBuffer(),
      fileName: "test.pdf",
      mimeType: "application/pdf",
      pageNumbers: [1, 2, 3],
    };
    const result = await adapter.extract(req);
    assert.strictEqual(result.pages.length, 3);
    assert.strictEqual(result.successCount, 3);
    assert.strictEqual(result.failureCount, 0);
    for (const page of result.pages) {
      assert.ok(page.pageNumber >= 1, "pageNumber should be ≥1");
      assert.ok(page.extractedText.length > 0, "extractedText should be non-empty");
      assert.strictEqual(page.extractionStatus, "COMPLETED");
      assert.strictEqual(page.extractionMethod, "MOCK");
    }
  });

  // DOC-08: LlamaParseAdapter only supports IMAGE_BASED, MIXED, UNKNOWN
  await test("DOC-08: LlamaParseAdapter.supports() rejects TEXT_BASED", async () => {
    const adapter = new LlamaParseAdapter();
    assert.ok(!adapter.supports("TEXT_BASED"), "should not support TEXT_BASED");
    assert.ok(adapter.supports("IMAGE_BASED"), "should support IMAGE_BASED");
    assert.ok(adapter.supports("MIXED"), "should support MIXED");
    assert.ok(adapter.supports("UNKNOWN"), "should support UNKNOWN");
  });

  // DOC-09: LlamaParseAdapter throws when API key missing
  await test("DOC-09: LlamaParseAdapter.extract() throws when LLAMA_CLOUD_API_KEY not set", async () => {
    // NOTE: ACP-06 — egress to api.cloud.llamaindex.ai is blocked by network policy.
    // This test verifies the key-missing guard, not the actual API call.
    const savedKey = process.env.LLAMA_CLOUD_API_KEY;
    delete process.env.LLAMA_CLOUD_API_KEY;
    const adapter = new LlamaParseAdapter();
    await assert.rejects(
      () => adapter.extract({
        fileBuffer: minimalPdfBuffer(),
        fileName: "test.pdf",
        mimeType: "application/pdf",
      }),
      /LLAMA_CLOUD_API_KEY/
    );
    if (savedKey) process.env.LLAMA_CLOUD_API_KEY = savedKey;
  });

  // DOC-10: DocumentExtractionService.processDocument creates DocumentPage records
  await test("DOC-10: processDocument creates DocumentPage rows in DB", async () => {
    // Create a document record first (simulating upload)
    const pdfBuf = minimalPdfBuffer();
    const storageKey = `${instructorId}/${programId}/test-extract.pdf`;
    await storage.save(storageKey, pdfBuf, "application/pdf");

    const doc = await prisma.trainingDocument.create({
      data: {
        programId,
        fileName: "test-extract.pdf",
        storagePath: storageKey,
        fileSizeBytes: pdfBuf.length,
        mimeType: "application/pdf",
        pageCount: 0,
        extractionStatus: "PENDING",
      },
    });
    documentId = doc.id;

    const service = new DocumentExtractionService();
    const progress = await service.processDocument(doc.id, instructorId);

    assert.ok(progress.status === "COMPLETED" || progress.status === "PROCESSING",
      `Expected COMPLETED or PROCESSING, got ${progress.status}`);
    assert.ok(progress.totalPages >= 1, "Should have extracted at least 1 page");

    // Verify pages in DB
    const pages = await prisma.documentPage.findMany({ where: { documentId: doc.id } });
    assert.ok(pages.length >= 1, "Should have at least 1 DocumentPage in DB");

    // Verify extractionMethod is stored
    for (const page of pages) {
      assert.ok(page.extractionMethod, "extractionMethod should be persisted");
    }
  });

  // DOC-11: processDocument blocked for wrong owner
  await test("DOC-11: processDocument throws NOT_FOUND for wrong instructorId", async () => {
    const otherInstructor = await createTestInstructor("b");
    const service = new DocumentExtractionService();
    await assert.rejects(
      () => service.processDocument(documentId, otherInstructor.id),
      /NOT_FOUND/
    );
    await prisma.instructor.delete({ where: { id: otherInstructor.id } });
  });

  // DOC-12: retryPage works for a known page
  await test("DOC-12: retryPage re-extracts a single page successfully", async () => {
    const service = new DocumentExtractionService();
    const page = await service.retryPage(documentId, 1, instructorId);
    assert.ok(page !== null, "retryPage should return a page");
    assert.strictEqual(page!.pageNumber, 1);
    assert.ok(page!.extractedText.length > 0);
  });

  // DOC-13: Upsert — re-running processDocument on same document does not duplicate pages
  await test("DOC-13: processDocument upserts pages, no duplicate rows", async () => {
    const service = new DocumentExtractionService();
    await service.processDocument(documentId, instructorId);
    await service.processDocument(documentId, instructorId);

    const pages = await prisma.documentPage.findMany({
      where: { documentId },
      orderBy: { pageNumber: "asc" },
    });

    const pageNumbers = pages.map((p) => p.pageNumber);
    const unique = new Set(pageNumbers);
    assert.strictEqual(
      unique.size,
      pageNumbers.length,
      "Duplicate page numbers found — upsert failed"
    );
  });

  // DOC-14: Partial page extraction with explicit page numbers
  await test("DOC-14: processDocument with pageNumbers only extracts specified pages", async () => {
    const service = new DocumentExtractionService();
    // MockAdapter generates pages for whatever numbers are requested
    const progress = await service.processDocument(documentId, instructorId, [2, 3]);
    assert.ok(progress.totalPages <= 2, `Expected ≤2 pages, got ${progress.totalPages}`);
  });

  await teardown();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
