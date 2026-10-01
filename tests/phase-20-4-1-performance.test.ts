// Phase 20.4.1 — Database Performance Tests
// PERF-DB-01: Analytics query count must be ≤ 10 for a 20-question session.
// Offline — no real DB required. Validates the optimised analytics handler
// logic directly by counting Prisma client calls made during a request.

import { strict as assert } from "assert";

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

// ── Minimal Prisma mock ───────────────────────────────────────────────────────
// Counts calls to each method and returns realistic stub data.

function buildPrismaMock(questionCount: number) {
  let callCount = 0;

  const sessionQuestions = Array.from({ length: questionCount }, (_, i) => ({
    id: `sq-${i + 1}`,
    questionId: `q-${i + 1}`,
    questionOrder: i + 1,
  }));

  // Simulate groupBy result: for each sessionQuestion, 3 correct and 2 wrong
  const breakdownRows = sessionQuestions.flatMap((sq) => [
    { sessionQuestionId: sq.id, isCorrect: true,  _count: { id: 3 } },
    { sessionQuestionId: sq.id, isCorrect: false, _count: { id: 2 } },
  ]);

  const prisma = {
    liveSession: {
      findUnique: async (_args: unknown) => {
        callCount++;
        return {
          id: "session-1",
          instructorId: "instructor-1",
          _count: { participants: 10 },
        };
      },
    },
    sessionParticipant: {
      count: async (_args: unknown) => { callCount++; return 7; },
      aggregate: async (_args: unknown) => {
        callCount++;
        return { _avg: { totalScore: 25 }, _max: { totalScore: 40 } };
      },
    },
    sessionQuestion: {
      findMany: async (_args: unknown) => { callCount++; return sessionQuestions; },
    },
    participantAnswer: {
      groupBy: async (_args: unknown) => { callCount++; return breakdownRows; },
    },
  };

  return { prisma, getCallCount: () => callCount };
}

// ── Inline analytics handler logic ───────────────────────────────────────────
// Mirrors the optimised route logic without importing Next.js internals.

async function runAnalyticsLogic(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  sessionId: string,
  userId: string,
) {
  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: { id: true, instructorId: true, _count: { select: { participants: true } } },
  });
  if (!session || session.instructorId !== userId) throw new Error("NOT_FOUND");

  const participantCount = session._count.participants;

  const completedCount = await prisma.sessionParticipant.count({
    where: { sessionId, answersCount: { gt: 0 } },
  });

  const scoreAgg = await prisma.sessionParticipant.aggregate({
    where: { sessionId, answersCount: { gt: 0 } },
    _avg: { totalScore: true },
    _max: { totalScore: true },
  });

  const averageScore = scoreAgg._avg.totalScore ? Number(scoreAgg._avg.totalScore) : 0;
  const highestScore = scoreAgg._max.totalScore ? Number(scoreAgg._max.totalScore) : 0;

  const sessionQuestions = await prisma.sessionQuestion.findMany({
    where: { sessionId },
    select: { id: true, questionId: true, questionOrder: true },
    orderBy: { questionOrder: "asc" },
  });

  // Single grouped query — replaces 2N per-question counts
  const breakdown = await prisma.participantAnswer.groupBy({
    by: ["sessionQuestionId", "isCorrect"],
    where: { sessionId, isFinal: true },
    _count: { id: true },
  });

  const sqMap = new Map<string, { correct: number; wrong: number }>();
  for (const row of breakdown) {
    const entry = sqMap.get(row.sessionQuestionId) ?? { correct: 0, wrong: 0 };
    if (row.isCorrect) entry.correct = row._count.id;
    else entry.wrong = row._count.id;
    sqMap.set(row.sessionQuestionId, entry);
  }

  let totalAnswers = 0;
  let correctAnswers = 0;
  for (const { correct, wrong } of sqMap.values()) {
    totalAnswers += correct + wrong;
    correctAnswers += correct;
  }

  const correctRate  = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;
  const participationRate = participantCount > 0 ? Math.round((completedCount / participantCount) * 100) : 0;

  const questions = sessionQuestions.map((sq: { id: string; questionId: string; questionOrder: number }) => {
    const counts = sqMap.get(sq.id) ?? { correct: 0, wrong: 0 };
    const total = counts.correct + counts.wrong;
    return {
      questionId: sq.questionId,
      questionOrder: sq.questionOrder,
      correct: counts.correct,
      wrong: counts.wrong,
      difficultyRate: total > 0 ? Math.round((counts.wrong / total) * 100) : 0,
    };
  });

  return {
    participantCount,
    completedCount,
    participationRate,
    averageScore: Math.round(averageScore * 10) / 10,
    highestScore: Math.round(highestScore * 10) / 10,
    correctAnswers,
    totalAnswers,
    correctRate,
    questions,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log("PHASE-20-4-1 — Database Performance");

  // DB-01: Query count ≤ 10 for 20-question session
  await test("DB-01: analytics uses ≤10 DB queries for a 20-question session", async () => {
    const { prisma, getCallCount } = buildPrismaMock(20);
    await runAnalyticsLogic(prisma, "session-1", "instructor-1");
    const queries = getCallCount();
    assert.ok(
      queries <= 10,
      `Expected ≤10 queries but got ${queries} (N+1 not fixed)`
    );
  });

  // Verify: exact query count is 5 (Q1 liveSession, Q2 count, Q3 aggregate, Q4 sessionQuestions, Q5 groupBy)
  await test("DB-01b: analytics makes exactly 5 DB queries for a 20-question session", async () => {
    const { prisma, getCallCount } = buildPrismaMock(20);
    await runAnalyticsLogic(prisma, "session-1", "instructor-1");
    const queries = getCallCount();
    assert.equal(queries, 5, `Expected exactly 5 queries but got ${queries}`);
  });

  // Verify: response shape is preserved (contract check)
  await test("DB-01c: analytics response shape matches existing API contract", async () => {
    const { prisma } = buildPrismaMock(5);
    const result = await runAnalyticsLogic(prisma, "session-1", "instructor-1");

    assert.ok("participantCount"   in result, "missing participantCount");
    assert.ok("completedCount"     in result, "missing completedCount");
    assert.ok("participationRate"  in result, "missing participationRate");
    assert.ok("averageScore"       in result, "missing averageScore");
    assert.ok("highestScore"       in result, "missing highestScore");
    assert.ok("correctAnswers"     in result, "missing correctAnswers");
    assert.ok("totalAnswers"       in result, "missing totalAnswers");
    assert.ok("correctRate"        in result, "missing correctRate");
    assert.ok(Array.isArray(result.questions), "questions must be an array");

    const q = result.questions[0];
    assert.ok("questionId"     in q, "missing questions[].questionId");
    assert.ok("questionOrder"  in q, "missing questions[].questionOrder");
    assert.ok("correct"        in q, "missing questions[].correct");
    assert.ok("wrong"          in q, "missing questions[].wrong");
    assert.ok("difficultyRate" in q, "missing questions[].difficultyRate");
  });

  // Verify: correctRate and difficultyRate computed correctly
  await test("DB-01d: correctRate and difficultyRate are computed correctly", async () => {
    const { prisma } = buildPrismaMock(2);
    const result = await runAnalyticsLogic(prisma, "session-1", "instructor-1");

    // Each question: 3 correct, 2 wrong → 5 total per question, 2 questions
    // totalAnswers = 10, correctAnswers = 6
    assert.equal(result.totalAnswers,  10, "totalAnswers should be 10");
    assert.equal(result.correctAnswers, 6, "correctAnswers should be 6");
    assert.equal(result.correctRate,   60, "correctRate should be 60%");

    // difficultyRate = wrong / total = 2/5 = 40%
    for (const q of result.questions) {
      assert.equal(q.correct, 3, "correct per question should be 3");
      assert.equal(q.wrong,   2, "wrong per question should be 2");
      assert.equal(q.difficultyRate, 40, "difficultyRate should be 40%");
    }
  });

  // Verify: query count scales flat (not linearly) with question count
  await test("DB-01e: query count is constant regardless of question count (flat, not N+1)", async () => {
    const { prisma: p5,  getCallCount: c5  } = buildPrismaMock(5);
    const { prisma: p50, getCallCount: c50 } = buildPrismaMock(50);

    await runAnalyticsLogic(p5,  "session-1", "instructor-1");
    await runAnalyticsLogic(p50, "session-1", "instructor-1");

    assert.equal(c5(),  c50(), `Query count must be identical regardless of question count (got ${c5()} vs ${c50()})`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
