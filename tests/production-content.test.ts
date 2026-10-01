import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { storage } from "../src/lib/storage";
import { DocumentExtractionService } from "../src/lib/extraction/service";
import { ContentGenerationService } from "../src/lib/ai/service";

async function run() {
  assert.equal(process.env.NODE_ENV, "production", "Run with NODE_ENV=production");
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.DATABASE_URL!).hostname), "Requires an isolated local database");
  // Exercise the production path with no real extraction provider configured.
  delete process.env.LLAMA_CLOUD_API_KEY;
  const key = `production-guard-${randomUUID()}/source.pdf`;
  let programId: string | undefined;
  try {
    const instructor = await prisma.instructor.findUniqueOrThrow({ where: { email: "test@example.com" } });
    const program = await prisma.trainingProgram.create({ data: { instructorId: instructor.id, title: "اختبار حماية المحتوى الوهمي", language: "AR" } });
    programId = program.id;
    await storage.save(key, Buffer.from("%PDF-1.4\n/Type /Page\n/Count 1\n%%EOF"), "application/pdf");
    const document = await prisma.trainingDocument.create({ data: { programId, fileName: "source.pdf", storagePath: key, fileSizeBytes: 45, mimeType: "application/pdf" } });
    const extraction = await new DocumentExtractionService().processDocument(document.id, instructor.id);
    assert.equal(extraction.status, "FAILED");
    assert.equal(extraction.errorMessage, "INVALID_PDF");
    assert.equal(await prisma.documentPage.count({ where: { documentId: document.id } }), 0);
    console.log("PASS: production extraction never falls back to synthetic content");

    await prisma.documentPage.create({ data: { documentId: document.id, pageNumber: 1, extractionStatus: "COMPLETED", extractionMethod: "MOCK", extractedText: "هذه بيانات وهمية من اختبار محلي فقط ولا يجوز استخدامها لإنشاء محتوى في الإنتاج." } });
    const generation = await new ContentGenerationService().generateForProgram(programId, document.id, instructor.id);
    assert.equal(generation.status, "FAILED");
    assert.match(generation.errorMessage ?? "", /NO_EXTRACTED_PAGES/);
    assert.equal(await prisma.question.count({ where: { programId } }), 0);
    console.log("PASS: existing mock pages cannot generate production questions");
    console.log("Production content guards: 2 passed, 0 failed");
  } finally {
    await storage.delete(key);
    if (programId) await prisma.trainingProgram.delete({ where: { id: programId } });
    await prisma.$disconnect();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
