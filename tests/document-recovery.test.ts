import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { storage } from "../src/lib/storage";
import { NativeTextAdapter } from "../src/lib/extraction/adapters/native-text";
import { DocumentExtractionService } from "../src/lib/extraction/service";
import { ContentGenerationService } from "../src/lib/ai/service";
import type { AIAdapter, ContentGenerationResult } from "../src/lib/ai/types";
import { textPdf } from "./helpers/pdf";

async function run() {
  assert.equal(process.env.NODE_ENV, "production");
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.DATABASE_URL!).hostname));
  delete process.env.LLAMA_CLOUD_API_KEY;
  const buffer = textPdf(147);
  const native = new NativeTextAdapter();
  const full = await native.extract({ fileBuffer: buffer, fileName: "source.pdf", mimeType: "application/pdf" });
  assert.equal(full.totalPages, 147); assert.equal(full.successCount, 147);
  assert.match(full.pages[146].extractedText, /GIS source page 147/);
  assert.ok(full.pages.every(p => p.extractionMethod === "NATIVE_TEXT"));
  console.log("PASS: real compressed 147-page PDF extracts locally without an OCR key");
  const subset = await native.extract({ fileBuffer: buffer, fileName: "source.pdf", mimeType: "application/pdf", pageNumbers: [2, 147] });
  assert.deepEqual(subset.pages.map(p => p.pageNumber), [2, 147]);
  assert.equal(subset.totalPages, 147);
  console.log("PASS: page retries preserve source numbering");

  let programId: string | undefined;
  const keys: string[] = [];
  try {
    const instructor = await prisma.instructor.findUniqueOrThrow({ where: { email: "test@example.com" } });
    const program = await prisma.trainingProgram.create({ data: { instructorId: instructor.id, title: "اختبار استعادة معالجة المستند", language: "AR" } });
    programId = program.id;
    const makeDocument = async (pdf: Buffer) => {
      const key = `recovery-${randomUUID()}/source.pdf`; keys.push(key);
      await storage.save(key, pdf, "application/pdf");
      return prisma.trainingDocument.create({ data: { programId: program.id, fileName: "source.pdf", storagePath: key, mimeType: "application/pdf", fileSizeBytes: pdf.length, extractionStatus: "FAILED" } });
    };
    const document = await makeDocument(buffer);
    const recovered = await new DocumentExtractionService().processDocument(document.id, instructor.id);
    assert.equal(recovered.status, "COMPLETED");
    assert.equal(await prisma.documentPage.count({ where: { documentId: document.id, extractionMethod: "NATIVE_TEXT" } }), 147);
    console.log("PASS: failed document recovers using genuine persisted source pages");
    const scanned = await makeDocument(textPdf(2, [2]));
    const missingOcr = await new DocumentExtractionService().processDocument(scanned.id, instructor.id);
    assert.equal(missingOcr.status, "OCR_REQUIRED");
    assert.equal(missingOcr.errorMessage, "OCR_REQUIRED");
    assert.equal(await prisma.documentPage.count({ where: { documentId: scanned.id, extractionMethod: "MOCK" } }), 0);
    console.log("PASS: mixed scanned PDF reports OCR requirement without synthetic content");

    // Deterministic AI responses exist only in tests; exercise actual persistence and validation.
    const result: ContentGenerationResult = {
      days: Array.from({ length: 10 }, (_, i) => ({ dayNumber: i + 1, title: `اليوم ${i + 1}`, objectives: ["فهم المعلومات الجغرافية"], contentSummary: "تحليل الإحداثيات المكانية", topics: ["التحليل المكاني"], pageRangeStart: 1, pageRangeEnd: 147, sourcePages: [i + 1] })),
      questions: Array.from({ length: 50 }, (_, i) => ({ dayNumber: Math.floor(i / 5) + 1, questionOrder: i % 5 + 1, questionText: `كيف نحلل البيانات الجغرافية في المثال ${i + 1}؟`, options: ["A", "B", "C", "D"].map((label, j) => ({ label: label as "A" | "B" | "C" | "D", text: `اختيار التحليل ${j + 1}` })), correctLabel: "A", explanation: "الإحداثيات تحدد الموقع الجغرافي.", sourcePageNumber: Math.floor(i / 5) + 1 })),
      modelUsed: "TEST_ONLY", promptVersion: "test", inputTokens: 0, outputTokens: 0, generatedAt: new Date(),
    };
    const adapter = (output: ContentGenerationResult): AIAdapter => ({ name: "TEST_ONLY", modelId: "TEST_ONLY", generate: async () => output });
    const originalDays = await Promise.all(result.days.map(day => prisma.trainingDay.create({ data: { programId: program.id, dayNumber: day.dayNumber, title: `عنوان المدرب ${day.dayNumber}`, objectives: ["هدف المدرب"] } })));
    const invalid = await new ContentGenerationService(adapter({ ...result, questions: [] })).generateForProgram(program.id, document.id, instructor.id);
    assert.equal(invalid.status, "FAILED"); assert.equal(invalid.errorMessage, "AI_INCOMPLETE_CONTENT");
    assert.deepEqual((await prisma.trainingDay.findMany({ where: { programId }, orderBy: { dayNumber: "asc" } })).map(d => d.id), originalDays.map(d => d.id));
    assert.equal(await prisma.question.count({ where: { programId } }), 0);
    console.log("PASS: incomplete AI output leaves all existing days intact");
    const badSource = structuredClone(result); badSource.questions[0].sourcePageNumber = 999;
    assert.equal((await new ContentGenerationService(adapter(badSource)).generateForProgram(program.id, document.id, instructor.id)).status, "FAILED");
    assert.equal(await prisma.question.count({ where: { programId } }), 0);
    console.log("PASS: ungrounded questions cannot be persisted");
    const failingWrite = structuredClone(result);
    failingWrite.questions[8].difficulty = "INVALID_ENUM" as "MEDIUM";
    const rollback = await new ContentGenerationService(adapter(failingWrite)).generateForProgram(program.id, document.id, instructor.id);
    assert.equal(rollback.status, "FAILED");
    assert.equal(await prisma.question.count({ where: { programId } }), 0);
    assert.equal(await prisma.trainingTopic.count({ where: { day: { programId } } }), 0);
    assert.ok((await prisma.trainingDay.findMany({ where: { programId } })).every(d => d.contentSummary === null));
    console.log("PASS: a database write failure rolls back all partially created content");
    const success = await new ContentGenerationService(adapter(result)).generateForProgram(program.id, document.id, instructor.id);
    assert.equal(success.status, "COMPLETED"); assert.equal(success.questionsGenerated, 50);
    const days = await prisma.trainingDay.findMany({ where: { programId }, orderBy: { dayNumber: "asc" }, include: { _count: { select: { questions: true } } } });
    assert.deepEqual(days.map(d => d.id), originalDays.map(d => d.id));
    assert.ok(days.every(d => d.title.startsWith("عنوان المدرب") && d._count.questions === 5));
    console.log("PASS: 50 validated questions fill existing days without changing their IDs or titles");
    const repeat = await new ContentGenerationService(adapter(result)).generateForProgram(program.id, document.id, instructor.id);
    assert.equal(repeat.status, "FAILED"); assert.equal(repeat.errorMessage, "CONTENT_ALREADY_EXISTS");
    assert.equal(await prisma.question.count({ where: { programId } }), 50);
    console.log("PASS: retry cannot overwrite existing questions or session content");
    console.log("Document recovery: 9 passed, 0 failed");
  } finally {
    for (const key of keys) await storage.delete(key);
    if (programId) await prisma.trainingProgram.delete({ where: { id: programId } });
    await prisma.$disconnect();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
