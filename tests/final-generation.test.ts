import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { FinalGenerationJobs, finalJobStatus } from "../src/lib/ai/final-jobs";
import { createFinalSession } from "../src/lib/session/service";
import type { AIAdapter, ContentGenerationRequest, ContentGenerationResult } from "../src/lib/ai/types";
async function main() {
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.DATABASE_URL!).hostname));
  const instructor = await prisma.instructor.findUniqueOrThrow({ where: { email: "test@example.com" } });
  const ids: string[] = []; let passed = 0;
  function output(req: ContentGenerationRequest): ContentGenerationResult {
    assert.equal(req.assessmentType, "FINAL"); assert.equal(req.totalDays, 7); assert.equal(req.questionsPerDay, 5);
    return { days: Array.from({ length: 7 }, (_, i) => ({ dayNumber: i + 1, title: `محور ${i + 1}`, sourcePages: [1], objectives: [], topics: [], contentSummary: "", pageRangeStart: 1, pageRangeEnd: 1 })),
      questions: Array.from({ length: 35 }, (_, i) => ({ questionType: i < 15 ? "MULTIPLE_CHOICE" : "TRUE_FALSE", questionText: `كيف نطبق التحليل المكاني النهائي في الحالة ${i + 1}؟`, dayNumber: Math.floor(i / 5) + 1, questionOrder: i % 5 + 1, sourcePageNumber: 1, options: (i < 15 ? ["A", "B", "C", "D"] : ["A", "B"]).map((label, j) => ({ label: label as "A" | "B" | "C" | "D", text: i < 15 ? `الخيار العربي ${j + 1}` : (j === 0 ? "صح" : "خطأ") })), correctLabel: "B", explanation: "التحليل يعتمد على خصائص البيانات المكانية." })), modelUsed: "TEST_FIXTURE", promptVersion: "test", generatedAt: new Date(), inputTokens: 0, outputTokens: 0 };
  }
  const adapter: AIAdapter = { name: "TEST", modelId: "TEST", async generate(req) { await req.onProgress?.(2); await req.onProgress?.(7); return output(req); } };
  async function fixture() {
    const p = await prisma.trainingProgram.create({ data: { instructorId: instructor.id, title: `اختبار النهائي ${Date.now()}` } }); ids.push(p.id);
    const d = await prisma.trainingDocument.create({ data: { programId: p.id, fileName: "native.pdf", fileSizeBytes: 100, storagePath: "local", extractionStatus: "COMPLETED", extractionNotes: "EXTRACTION_COMPLETED:1/1" } });
    await prisma.documentPage.create({ data: { documentId: d.id, pageNumber: 1, extractedText: "المعلومات الجغرافية والتحليل المكاني تستخدم الإحداثيات وتساعد في إدارة البيانات والتخطيط المكاني واختيار مواقع الخدمات.", extractionStatus: "COMPLETED", extractionMethod: "NATIVE_TEXT" } });
    const day = await prisma.trainingDay.create({ data: { programId: p.id, dayNumber: 1, title: "اليوم الأصلي" } });
    await prisma.question.create({ data: { programId: p.id, dayId: day.id, questionOrder: 1, questionText: "السؤال اليومي يجب أن يبقى محفوظاً" } });
    return { p, d, day };
  }
  try {
    const a = await fixture(); const b = await fixture(); const jobs = new FinalGenerationJobs(adapter);
    assert.equal((await jobs.claim(a.p.id, a.d.id, "foreign-instructor")).status, "NOT_FOUND"); passed++;
    const claims = await Promise.all([jobs.claim(a.p.id, a.d.id, instructor.id), jobs.claim(a.p.id, a.d.id, instructor.id)]);
    assert.equal(claims.filter(c => c.status === "STARTED").length, 1); assert.equal(claims.filter(c => c.status === "PROCESSING").length, 1); passed++;
    const second = await jobs.claim(b.p.id, b.d.id, instructor.id);
    await Promise.all([jobs.run(a.p.id, a.d.id, instructor.id, claims.find(c => c.runId)!.runId!), jobs.run(b.p.id, b.d.id, instructor.id, second.runId!)]);
    for (const f of [a, b]) {
      const status = await finalJobStatus(f.p.id, instructor.id); assert.equal(status?.questions, 35); assert.equal(status?.state.status, "completed");
      assert.equal(await prisma.question.count({ where: { dayId: f.day.id } }), 1);
      assert.equal((await prisma.trainingDocument.findUniqueOrThrow({ where: { id: f.d.id } })).extractionNotes, "EXTRACTION_COMPLETED:1/1");
      const questions = await prisma.question.findMany({ where: { programId: f.p.id, day: { dayNumber: 0 } }, include: { options: true } });
      assert.equal(new Set(questions.map(q => q.sourcePageId)).size, 1); assert.ok(questions.every(q => q.options.find(o => o.optionLabel === "B")?.id === q.correctOptionId));
      assert.equal(questions.filter(q => q.questionType === "MULTIPLE_CHOICE").length, 15); assert.equal(questions.filter(q => q.questionType === "TRUE_FALSE").length, 20);
    }
    passed++;
    assert.equal((await jobs.claim(a.p.id, a.d.id, instructor.id)).status, "CONTENT_ALREADY_EXISTS"); passed++;
    const c = await fixture(); const broken = new FinalGenerationJobs({ ...adapter, async generate(req) { return { ...output(req), questions: output(req).questions.slice(0, 34) }; } });
    const claim = await broken.claim(c.p.id, c.d.id, instructor.id); await broken.run(c.p.id, c.d.id, instructor.id, claim.runId!);
    assert.equal((await finalJobStatus(c.p.id, instructor.id))?.questions, 0); assert.equal((await finalJobStatus(c.p.id, instructor.id))?.state.status, "failed"); passed++;
    const retry = await jobs.claim(c.p.id, c.d.id, instructor.id); await prisma.trainingDay.updateMany({ where: { programId: c.p.id, dayNumber: 0 }, data: { updatedAt: new Date(Date.now() - 400_000) } });
    assert.equal((await finalJobStatus(c.p.id, instructor.id))?.state.status, "failed");
    await jobs.run(c.p.id, c.d.id, instructor.id, retry.runId!); assert.equal((await finalJobStatus(c.p.id, instructor.id))?.questions, 0); passed++;
    const duplicate = await fixture();
    const duplicateJobs = new FinalGenerationJobs({ ...adapter, async generate(req) { const result = output(req); result.questions[0].questionText = "السؤال اليومي يجب أن يبقى محفوظاً"; return result; } });
    const dupClaim = await duplicateJobs.claim(duplicate.p.id, duplicate.d.id, instructor.id); await duplicateJobs.run(duplicate.p.id, duplicate.d.id, instructor.id, dupClaim.runId!);
    assert.equal((await finalJobStatus(duplicate.p.id, instructor.id))?.questions, 0); passed++;
    const missingCoverage = await fixture();
    await prisma.documentPage.create({ data: { documentId: missingCoverage.d.id, pageNumber: 2, extractedText: "صفحة أخرى من المادة التدريبية يجب تغطيتها كاملة في خطة الاختبار النهائي بمختلف أنواع الأسئلة.", extractionStatus: "COMPLETED", extractionMethod: "NATIVE_TEXT" } });
    const coverageClaim = await jobs.claim(missingCoverage.p.id, missingCoverage.d.id, instructor.id); await jobs.run(missingCoverage.p.id, missingCoverage.d.id, instructor.id, coverageClaim.runId!);
    assert.equal((await finalJobStatus(missingCoverage.p.id, instructor.id))?.questions, 0); passed++;
    const bank = await prisma.trainingDay.findUniqueOrThrow({ where: { programId_dayNumber: { programId: a.p.id, dayNumber: 0 } } });
    await prisma.question.updateMany({ where: { dayId: bank.id }, data: { status: "APPROVED" } });
    const exam = await createFinalSession(a.p.id, instructor.id, 35);
    const examQuestions = await prisma.sessionQuestion.findMany({ where: { sessionId: exam.id }, include: { question: true } });
    assert.equal(examQuestions.length, 35); assert.ok(examQuestions.every(q => q.question.dayId === bank.id)); passed++;
    console.log(`Final generation: ${passed} passed, 0 failed (provider fixtures; no live API calls)`);
  } finally { await prisma.liveSession.deleteMany({ where: { programId: { in: ids } } }); await prisma.trainingProgram.deleteMany({ where: { id: { in: ids } } }); await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
