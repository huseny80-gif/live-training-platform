import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { recoverStaleDocument, recoverStaleProgramDocuments, PROCESSING_STALE_MS } from "../src/lib/extraction/recovery";

async function run() {
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.DATABASE_URL!).hostname));
  let programId: string | undefined;
  try {
    const instructor = await prisma.instructor.findUniqueOrThrow({ where: { email: "test@example.com" } });
    const program = await prisma.trainingProgram.create({ data: { instructorId: instructor.id, title: "اختبار استعادة المعالجة المتوقفة" } });
    programId = program.id;
    const now = new Date();
    const stale = new Date(now.getTime() - PROCESSING_STALE_MS - 1000);
    const doc = await prisma.trainingDocument.create({ data: { programId, fileName: "test.pdf", storagePath: "test-only", fileSizeBytes: 1, mimeType: "application/pdf", extractionStatus: "PROCESSING", updatedAt: stale } });
    assert.equal((await recoverStaleDocument(doc.id, "other-instructor", now)).count, 0);
    console.log("PASS: foreign instructors cannot reset a job");
    assert.equal((await recoverStaleDocument(doc.id, instructor.id, now)).count, 1);
    const recovered = await prisma.trainingDocument.findUniqueOrThrow({ where: { id: doc.id } });
    assert.equal(recovered.extractionStatus, "FAILED"); assert.equal(recovered.extractionNotes, "PROCESSING_TIMEOUT");
    console.log("PASS: expired processing becomes retryable with an actionable reason");
    await prisma.trainingDocument.update({ where: { id: doc.id }, data: { extractionStatus: "PROCESSING", updatedAt: now } });
    assert.equal((await recoverStaleDocument(doc.id, instructor.id, now)).count, 0);
    console.log("PASS: a newer active job cannot be reset by a stale poll");
    await prisma.trainingDocument.update({ where: { id: doc.id }, data: { extractionStatus: "COMPLETED", updatedAt: stale } });
    assert.equal((await recoverStaleDocument(doc.id, instructor.id, now)).count, 0);
    console.log("PASS: completed content is preserved regardless of age");
    await prisma.trainingDocument.update({ where: { id: doc.id }, data: { extractionStatus: "PROCESSING", updatedAt: stale } });
    const active = await prisma.trainingDocument.create({ data: { programId, fileName: "active.pdf", storagePath: "test-only", fileSizeBytes: 1, mimeType: "application/pdf", extractionStatus: "PROCESSING", updatedAt: now } });
    assert.equal((await recoverStaleProgramDocuments(program.id, "other-instructor", now)).count, 0);
    assert.equal((await recoverStaleProgramDocuments(program.id, instructor.id, now)).count, 1);
    assert.equal((await prisma.trainingDocument.findUniqueOrThrow({ where: { id: active.id } })).extractionStatus, "PROCESSING");
    console.log("PASS: program-page recovery preserves active jobs and enforces ownership");
    console.log("Processing recovery: 5 passed, 0 failed");
  } finally {
    if (programId) await prisma.trainingProgram.delete({ where: { id: programId } });
    await prisma.$disconnect();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
