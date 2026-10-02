import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { GenerationJobs, recoverGenerationJobs } from "../src/lib/ai/jobs";
import { ContentGenerationService } from "../src/lib/ai/service";
import { generationState } from "../src/lib/ai/generation-state";
import { generatedCourseFixture } from "./helpers/generation";
import type { AIAdapter } from "../src/lib/ai/types";

async function run() {
  assert.equal(process.env.NODE_ENV, "production");
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.DATABASE_URL!).hostname));
  const programs: string[] = [];
  try {
    const instructor = await prisma.instructor.findUniqueOrThrow({ where: { email: "test@example.com" } });
    const makeProgram = async () => {
      const program = await prisma.trainingProgram.create({ data: { instructorId: instructor.id, title: "اختبار توليد منفصل", language: "AR" } });
      programs.push(program.id);
      const document = await prisma.trainingDocument.create({ data: { programId: program.id, fileName: "source.pdf", storagePath: "test-only", fileSizeBytes: 1, mimeType: "application/pdf", extractionStatus: "COMPLETED", extractionNotes: "EXTRACTION_COMPLETED: 1/1" } });
      await prisma.documentPage.create({ data: { documentId: document.id, pageNumber: 1, extractionMethod: "NATIVE_TEXT", extractionStatus: "COMPLETED", extractedText: "تدعم نظم المعلومات الجغرافية تحليل الإحداثيات المكانية وتخزين البيانات وربطها بالموقع الجغرافي." } });
      return { program, document };
    };
    const output = generatedCourseFixture();
    const adapter: AIAdapter = { name: "TEST_ONLY", modelId: "TEST_ONLY", generate: async request => {
      for (const days of [2, 4, 6, 8, 10]) await request.onProgress?.(days);
      return output;
    } };
    const jobs = new GenerationJobs(new ContentGenerationService(adapter));
    const first = await makeProgram();
    assert.equal((await jobs.claim(first.document.id, first.program.id, "foreign-instructor")).status, "NOT_FOUND");
    console.log("PASS: only the owner can claim generation");
    const claim = await jobs.claim(first.document.id, first.program.id, instructor.id);
    assert.equal(claim.status, "STARTED"); assert.ok(claim.runId);
    assert.equal((await jobs.claim(first.document.id, first.program.id, instructor.id)).status, "PROCESSING");
    assert.equal((await prisma.trainingDocument.findUniqueOrThrow({ where: { id: first.document.id } })).extractionStatus, "COMPLETED");
    console.log("PASS: generation is idempotent and keeps the file accepted");
    await jobs.run(first.document.id, first.program.id, instructor.id, claim.runId!);
    const finished = await prisma.trainingDocument.findUniqueOrThrow({ where: { id: first.document.id } });
    assert.deepEqual(generationState(finished.extractionNotes), { status: "completed", days: 10, questions: 50 });
    assert.equal(finished.extractionStatus, "COMPLETED");
    assert.equal(await prisma.question.count({ where: { programId: first.program.id } }), 50);
    assert.equal((await jobs.claim(first.document.id, first.program.id, instructor.id)).status, "CONTENT_ALREADY_EXISTS");
    console.log("PASS: 50 source-linked questions complete without re-extraction or overwrite");
    const second = await makeProgram();
    const failedJobs = new GenerationJobs(new ContentGenerationService({ ...adapter, generate: async () => ({ ...output, questions: [] }) }));
    const failedClaim = await failedJobs.claim(second.document.id, second.program.id, instructor.id);
    await failedJobs.run(second.document.id, second.program.id, instructor.id, failedClaim.runId!);
    const failed = await prisma.trainingDocument.findUniqueOrThrow({ where: { id: second.document.id } });
    assert.equal(failed.extractionStatus, "COMPLETED");
    assert.deepEqual(generationState(failed.extractionNotes), { status: "failed", error: "AI_INCOMPLETE_CONTENT" });
    assert.equal(await prisma.question.count({ where: { programId: second.program.id } }), 0);
    console.log("PASS: incomplete AI output stays retryable without rejecting the file");
    const retry = await jobs.claim(second.document.id, second.program.id, instructor.id);
    assert.equal(retry.status, "STARTED");
    await prisma.trainingDocument.update({ where: { id: second.document.id }, data: { updatedAt: new Date(Date.now() - 7 * 60 * 1000) } });
    assert.equal((await recoverGenerationJobs(instructor.id, { documentId: second.document.id })).count, 1);
    assert.equal((await prisma.trainingDocument.findUniqueOrThrow({ where: { id: second.document.id } })).extractionStatus, "COMPLETED");
    console.log("PASS: an expired generation lease preserves accepted text and enables retry");
    const fresh = await jobs.claim(second.document.id, second.program.id, instructor.id);
    await jobs.run(second.document.id, second.program.id, instructor.id, retry.runId!);
    assert.ok((await prisma.trainingDocument.findUniqueOrThrow({ where: { id: second.document.id } })).extractionNotes?.includes(fresh.runId!));
    assert.equal(await prisma.question.count({ where: { programId: second.program.id } }), 0);
    console.log("PASS: an old worker cannot overwrite a replacement job");
    const third = await makeProgram();
    const sibling = await prisma.trainingDocument.create({ data: { ...third.document, id: undefined, fileName: "second.pdf", extractionNotes: "EXTRACTION_COMPLETED: 1/1" } });
    await prisma.documentPage.create({ data: { documentId: sibling.id, pageNumber: 1, extractionMethod: "NATIVE_TEXT", extractionStatus: "COMPLETED", extractedText: "صفحة المصدر الثانية للمعلومات الجغرافية والتحليل المكاني والإحداثيات." } });
    const claims = await Promise.all([jobs.claim(third.document.id, third.program.id, instructor.id), jobs.claim(sibling.id, third.program.id, instructor.id)]);
    assert.deepEqual(claims.map(result => result.status).sort(), ["PROGRAM_PROCESSING", "STARTED"]);
    console.log("PASS: simultaneous generation requests for two files start only one program job");
    console.log("Generation jobs: 7 passed, 0 failed (AI output fixtures; no live API calls)");
  } finally {
    for (const programId of programs) await prisma.trainingProgram.delete({ where: { id: programId } });
    await prisma.$disconnect();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
