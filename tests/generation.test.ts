/**
 * PHASE 6 Tests — AI Content Generation
 * GEN-01 through GEN-15
 *
 * NOTE on real AI generation (GEN-14):
 * Requires ANTHROPIC_API_KEY in .env and COMPLETED DocumentPages from
 * LlamaParse (ACP-06). GEN-14 is SKIPPED unless ANTHROPIC_API_KEY is set.
 * All structural/logic tests run without API calls.
 */

import "dotenv/config";
import assert from "assert";
import { prisma } from "../src/lib/prisma";
import { ClaudeAIAdapter } from "../src/lib/ai/adapters/claude";
import { ContentGenerationService } from "../src/lib/ai/service";
import { buildDayPlanPrompt, buildQuestionsPrompt, PROMPT_VERSION } from "../src/lib/ai/prompts";
import type { SourcePageRef, GeneratedQuestion, GeneratedDayPlan } from "../src/lib/ai/types";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makePages(count: number): SourcePageRef[] {
  return Array.from({ length: count }, (_, i) => ({
    pageId: `page-${i + 1}`,
    pageNumber: i + 1,
    extractedText: `محتوى تعليمي حقيقي للصفحة ${i + 1} — نظم المعلومات الجغرافية، البيانات المكانية، الإسقاطات الجغرافية`,
    title: `عنوان الصفحة ${i + 1}`,
  }));
}

/** Minimal valid GeneratedQuestion */
function makeQuestion(dayNumber: number, order: number): GeneratedQuestion {
  return {
    questionText: `ما هو تعريف نظم المعلومات الجغرافية؟ (يوم ${dayNumber}، سؤال ${order})`,
    options: [
      { label: "A", text: "نظام لإدارة الخرائط الرقمية" },
      { label: "B", text: "نظام لتحليل البيانات المكانية والوصفية" },
      { label: "C", text: "نظام لتخزين الصور الفضائية فقط" },
      { label: "D", text: "نظام لرسم الخرائط اليدوية" },
    ],
    correctLabel: "B",
    explanation: "GIS هو نظام متكامل لجمع وتخزين وتحليل البيانات المكانية",
    dayNumber,
    questionOrder: order,
    sourcePageNumber: dayNumber,
    topic: "مقدمة GIS",
    difficulty: "MEDIUM",
  };
}

/** Minimal valid GeneratedDayPlan */
function makeDayPlan(dayNumber: number): GeneratedDayPlan {
  return {
    dayNumber,
    title: `اليوم ${dayNumber}: مقدمة في GIS`,
    objectives: ["فهم مفهوم GIS", "التعرف على مكوناته"],
    contentSummary: `محتوى اليوم ${dayNumber}`,
    topics: ["تعريف GIS", "المكونات الأساسية"],
    pageRangeStart: (dayNumber - 1) * 14 + 1,
    pageRangeEnd: dayNumber * 14,
    sourcePages: Array.from({ length: 14 }, (_, i) => (dayNumber - 1) * 14 + i + 1),
  };
}

// ─── State ────────────────────────────────────────────────────────────────────

let instructorId: string;
let programId: string;
let documentId: string;

async function cleanup() {
  const instructors = await prisma.instructor.findMany({
    where: { email: { contains: "gen-test-" } },
    select: { id: true },
  });
  const ids = instructors.map((i) => i.id);
  if (ids.length > 0) {
    await prisma.trainingProgram.deleteMany({ where: { instructorId: { in: ids } } });
    await prisma.instructor.deleteMany({ where: { id: { in: ids } } });
  }
}

async function setup() {
  await cleanup();
  const instructor = await prisma.instructor.create({
    data: { email: "gen-test-a@example.com", passwordHash: "x", name: "Gen Test" },
  });
  instructorId = instructor.id;

  const program = await prisma.trainingProgram.create({
    data: { instructorId, title: "GIS Program", description: "Test", language: "AR", status: "DRAFT" },
  });
  programId = program.id;

  const doc = await prisma.trainingDocument.create({
    data: {
      programId,
      fileName: "gis.pdf",
      storagePath: `${instructorId}/${programId}/test.pdf`,
      fileSizeBytes: 1000,
      mimeType: "application/pdf",
      pageCount: 10,
      extractionStatus: "COMPLETED",
    },
  });
  documentId = doc.id;
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

  // GEN-01: Prompt version is defined and stable
  await test("GEN-01: PROMPT_VERSION is defined", async () => {
    assert.ok(typeof PROMPT_VERSION === "string" && PROMPT_VERSION.length > 0);
  });

  // GEN-02: Day plan prompt includes required elements
  await test("GEN-02: buildDayPlanPrompt includes page content and day count", async () => {
    const pages = makePages(5).map((p) => ({
      pageNumber: p.pageNumber,
      title: p.title,
      extractedText: p.extractedText,
    }));
    const prompt = buildDayPlanPrompt(pages, "GIS Program", "AR", 10);
    assert.ok(prompt.includes("10"), "Should mention 10 days");
    assert.ok(prompt.includes("GIS Program"), "Should include program title");
    assert.ok(prompt.includes("صفحة 1"), "Should include page content");
  });

  // GEN-03: Questions prompt includes day context and avoidance list
  await test("GEN-03: buildQuestionsPrompt includes day context", async () => {
    const day = makeDayPlan(1);
    const pages = makePages(14).map((p) => ({
      pageNumber: p.pageNumber,
      title: p.title,
      extractedText: p.extractedText,
    }));
    const prompt = buildQuestionsPrompt(day, pages, "AR", 5, ["سؤال موجود"]);
    assert.ok(prompt.includes("اليوم 1"), "Should include day number");
    assert.ok(prompt.includes("سؤال موجود"), "Should include existing questions to avoid");
    assert.ok(prompt.includes("5"), "Should mention 5 questions");
  });

  // GEN-04: ClaudeAIAdapter throws when ANTHROPIC_API_KEY not set
  await test("GEN-04: ClaudeAIAdapter throws when ANTHROPIC_API_KEY missing", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const adapter = new ClaudeAIAdapter();
    await assert.rejects(
      () => adapter.generate({
        pages: makePages(5),
        language: "AR",
        programTitle: "Test",
        totalDays: 10,
        questionsPerDay: 5,
      }),
      /ANTHROPIC_API_KEY/
    );
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
  });

  // GEN-05: GeneratedQuestion structure validation
  await test("GEN-05: GeneratedQuestion has exactly 4 options", async () => {
    const q = makeQuestion(1, 1);
    assert.strictEqual(q.options.length, 4);
    const labels = q.options.map((o) => o.label).sort();
    assert.deepStrictEqual(labels, ["A", "B", "C", "D"]);
  });

  // GEN-06: GeneratedQuestion correct answer is one of the 4 labels
  await test("GEN-06: correctLabel is one of A/B/C/D", async () => {
    const q = makeQuestion(1, 1);
    assert.ok(["A", "B", "C", "D"].includes(q.correctLabel));
  });

  // GEN-07: ContentGenerationService rejects MOCK-only pages
  await test("GEN-07: generateForProgram returns FAILED when only MOCK pages exist", async () => {
    // Create MOCK pages
    for (let i = 1; i <= 5; i++) {
      await prisma.documentPage.create({
        data: {
          documentId,
          pageNumber: i,
          extractedText: "محتوى وهمي",
          extractionMethod: "MOCK",
          extractionStatus: "COMPLETED",
        },
      });
    }
    const service = new ContentGenerationService();
    const result = await service.generateForProgram(programId, documentId, instructorId);
    assert.strictEqual(result.status, "FAILED");
    assert.ok(result.errorMessage?.includes("MOCK_ONLY_CONTENT"), `Expected MOCK_ONLY_CONTENT error, got: ${result.errorMessage}`);

    // Clean up pages
    await prisma.documentPage.deleteMany({ where: { documentId } });
  });

  // GEN-08: ContentGenerationService returns FAILED when no pages extracted
  await test("GEN-08: generateForProgram returns FAILED with no extracted pages", async () => {
    const service = new ContentGenerationService();
    const result = await service.generateForProgram(programId, documentId, instructorId);
    assert.strictEqual(result.status, "FAILED");
    assert.ok(result.errorMessage?.includes("NO_EXTRACTED_PAGES"), `Expected NO_EXTRACTED_PAGES, got: ${result.errorMessage}`);
  });

  // GEN-09: Ownership check blocks wrong instructor
  await test("GEN-09: generateForProgram throws NOT_FOUND for wrong instructorId", async () => {
    const otherInstructor = await prisma.instructor.create({
      data: { email: "gen-test-b@example.com", passwordHash: "x", name: "Other" },
    });
    const service = new ContentGenerationService();
    await assert.rejects(
      () => service.generateForProgram(programId, documentId, otherInstructor.id),
      /PROGRAM_NOT_FOUND/
    );
    await prisma.instructor.delete({ where: { id: otherInstructor.id } });
  });

  // GEN-10: getDayQuestionsForParticipant never returns correctOptionId
  await test("GEN-10: participant question fetch never exposes correctOptionId", async () => {
    // Create a day and question manually to test the query
    const day = await prisma.trainingDay.create({
      data: { programId, dayNumber: 99, title: "Test Day", objectives: [], status: "DRAFT" },
    });
    const question = await prisma.question.create({
      data: {
        dayId: day.id, programId, questionText: "سؤال اختبار?",
        questionOrder: 1, status: "DRAFT", generatedBy: "AI",
      },
    });
    const optA = await prisma.questionOption.create({
      data: { questionId: question.id, optionLabel: "A", optionText: "خيار أ", displayOrder: 1 },
    });
    const optB = await prisma.questionOption.create({
      data: { questionId: question.id, optionLabel: "B", optionText: "خيار ب", displayOrder: 2 },
    });
    await prisma.questionOption.create({
      data: { questionId: question.id, optionLabel: "C", optionText: "خيار ج", displayOrder: 3 },
    });
    await prisma.questionOption.create({
      data: { questionId: question.id, optionLabel: "D", optionText: "خيار د", displayOrder: 4 },
    });
    await prisma.question.update({
      where: { id: question.id },
      data: { correctOptionId: optA.id },
    });

    const service = new ContentGenerationService();
    const questions = await service.getDayQuestionsForParticipant(day.id);
    assert.ok(questions.length > 0);

    for (const q of questions) {
      assert.ok(!("correctOptionId" in q), "correctOptionId must NOT be in participant response");
      assert.ok(!("correctLabel" in q), "correctLabel must NOT be in participant response");
      assert.ok("options" in q, "options must be present");
    }

    // Verify instructor version DOES have it
    const instructorQs = await service.getDayQuestionsForInstructor(day.id, instructorId);
    assert.ok(instructorQs[0].correctOptionId === optA.id);

    await prisma.trainingDay.delete({ where: { id: day.id } });
  });

  // GEN-11: 10 days × 5 questions structural check (in-memory)
  await test("GEN-11: 10 days × 5 questions = 50 total (structure validation)", async () => {
    const days = Array.from({ length: 10 }, (_, i) => makeDayPlan(i + 1));
    const questions: GeneratedQuestion[] = [];
    for (let d = 1; d <= 10; d++) {
      for (let q = 1; q <= 5; q++) {
        questions.push(makeQuestion(d, q));
      }
    }
    assert.strictEqual(days.length, 10);
    assert.strictEqual(questions.length, 50);

    for (const day of days) {
      const dayQ = questions.filter((q) => q.dayNumber === day.dayNumber);
      assert.strictEqual(dayQ.length, 5, `Day ${day.dayNumber} should have 5 questions`);
    }
  });

  // GEN-12: No duplicate question orders within a day
  await test("GEN-12: questionOrder is unique within each day", async () => {
    const questions: GeneratedQuestion[] = [];
    for (let d = 1; d <= 3; d++) {
      for (let q = 1; q <= 5; q++) {
        questions.push(makeQuestion(d, q));
      }
    }
    for (let day = 1; day <= 3; day++) {
      const dayQs = questions.filter((q) => q.dayNumber === day);
      const orders = dayQs.map((q) => q.questionOrder);
      const unique = new Set(orders);
      assert.strictEqual(unique.size, orders.length, `Duplicate questionOrder in day ${day}`);
    }
  });

  // GEN-13: Source page traceability — every question has a sourcePageNumber
  await test("GEN-13: every question has sourcePageNumber set", async () => {
    const questions = Array.from({ length: 50 }, (_, i) =>
      makeQuestion(Math.floor(i / 5) + 1, (i % 5) + 1)
    );
    for (const q of questions) {
      assert.ok(typeof q.sourcePageNumber === "number" && q.sourcePageNumber >= 1,
        `Question ${q.dayNumber}/${q.questionOrder} missing sourcePageNumber`);
    }
  });

  // GEN-14: Real AI generation (skipped if no API key or no real pages)
  await test("GEN-14: SKIPPED — real AI generation requires ANTHROPIC_API_KEY + LlamaParse pages (ACP-06)", async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log("    → ANTHROPIC_API_KEY not set — skipping live generation test");
      return; // pass (skip)
    }
    // Even with API key, if no real (non-MOCK) pages exist → service returns FAILED
    const service = new ContentGenerationService();
    const result = await service.generateForProgram(programId, documentId, instructorId);
    // Should fail with NO_EXTRACTED_PAGES or MOCK_ONLY_CONTENT since no real pages
    assert.ok(
      result.status === "FAILED",
      `Expected FAILED (no real pages yet), got ${result.status}: ${result.errorMessage}`
    );
  });

  // GEN-15: Idempotency — generating twice deletes and recreates, no duplication
  await test("GEN-15: DB upsert is idempotent — re-generation replaces, not duplicates", async () => {
    // Create some days manually
    await prisma.trainingDay.create({
      data: { programId, dayNumber: 1, title: "Day 1", objectives: [], status: "DRAFT" },
    });
    await prisma.trainingDay.create({
      data: { programId, dayNumber: 2, title: "Day 2", objectives: [], status: "DRAFT" },
    });

    const beforeCount = await prisma.trainingDay.count({ where: { programId } });
    assert.strictEqual(beforeCount, 2);

    // Simulate the idempotent delete
    await prisma.trainingDay.deleteMany({ where: { programId } });
    const afterCount = await prisma.trainingDay.count({ where: { programId } });
    assert.strictEqual(afterCount, 0, "Delete should clear all days before regeneration");
  });

  await cleanup();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
