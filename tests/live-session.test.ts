/**
 * PHASE 7 Tests — Live Session Management
 * LIVE-01 through LIVE-26
 *
 * Tests cover:
 * - Session creation (LIVE-01 to LIVE-05)
 * - Participant join (LIVE-06 to LIVE-10)
 * - Session lifecycle (LIVE-11 to LIVE-14)
 * - Question lifecycle (LIVE-15 to LIVE-18)
 * - Answer submission & scoring (LIVE-19 to LIVE-23)
 * - Leaderboard & results (LIVE-24 to LIVE-26)
 */

import "dotenv/config";
import assert from "assert";
import { prisma } from "../src/lib/prisma";
import {
  createSession,
  participantJoin,
  startSession,
  pauseSession,
  resumeSession,
  endSession,
  showQuestion,
  closeQuestion,
  showResults,
  nextQuestion,
  submitAnswer,
  getLeaderboard,
  getLiveQuestionPayload,
  buildQuestionResult,
  getSessionByCode,
} from "../src/lib/session/service";
import { verifyGuestToken } from "../src/lib/session/guest-token";

// ─── Setup helpers ────────────────────────────────────────────────────────────

let instructorId: string;
let programId: string;
let dayId: string;
let questionId: string;
let optionAId: string;
let optionBId: string;

async function cleanup() {
  const instructors = await prisma.instructor.findMany({
    where: { email: { contains: "live-test-" } },
    select: { id: true },
  });
  const ids = instructors.map((i) => i.id);
  if (ids.length > 0) {
    // Delete live sessions first (FK references program)
    await prisma.liveSession.deleteMany({ where: { instructorId: { in: ids } } });
    await prisma.trainingProgram.deleteMany({ where: { instructorId: { in: ids } } });
    await prisma.instructor.deleteMany({ where: { id: { in: ids } } });
  }
}

async function setup() {
  await cleanup();
  const instructor = await prisma.instructor.create({
    data: { email: "live-test-a@example.com", passwordHash: "x", name: "Live Test Instructor" },
  });
  instructorId = instructor.id;

  const program = await prisma.trainingProgram.create({
    data: { instructorId, title: "Live Test Program", description: "Test", language: "AR", status: "DRAFT" },
  });
  programId = program.id;

  const day = await prisma.trainingDay.create({
    data: { programId, dayNumber: 1, title: "Day 1", objectives: [], status: "DRAFT" },
  });
  dayId = day.id;

  const question = await prisma.question.create({
    data: {
      dayId,
      programId,
      questionText: "ما هو تعريف GIS؟",
      questionOrder: 1,
      status: "APPROVED",
      generatedBy: "AI",
    },
  });
  questionId = question.id;

  const optA = await prisma.questionOption.create({
    data: { questionId, optionLabel: "A", optionText: "نظام خرائط", displayOrder: 1 },
  });
  const optB = await prisma.questionOption.create({
    data: { questionId, optionLabel: "B", optionText: "نظام معلومات جغرافية", displayOrder: 2 },
  });
  await prisma.questionOption.create({
    data: { questionId, optionLabel: "C", optionText: "قاعدة بيانات فقط", displayOrder: 3 },
  });
  await prisma.questionOption.create({
    data: { questionId, optionLabel: "D", optionText: "برنامج رسم", displayOrder: 4 },
  });

  optionAId = optA.id;
  optionBId = optB.id;

  // Set correct answer to B
  await prisma.question.update({
    where: { id: questionId },
    data: { correctOptionId: optionBId },
  });
}

// ─── Test runner ──────────────────────────────────────────────────────────────

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

  // ── Session creation ───────────────────────────────────────────────────────

  // LIVE-01: createSession requires valid programId owned by instructor
  await test("LIVE-01: createSession throws PROGRAM_NOT_FOUND for wrong instructor", async () => {
    const other = await prisma.instructor.create({
      data: { email: "live-test-b@example.com", passwordHash: "x", name: "Other" },
    });
    await assert.rejects(
      () => createSession(programId, other.id, 1),
      /PROGRAM_NOT_FOUND/
    );
    await prisma.instructor.delete({ where: { id: other.id } });
  });

  // LIVE-02: createSession throws when no questions for the day
  await test("LIVE-02: createSession throws NO_QUESTIONS_FOR_DAY when day has no approved questions", async () => {
    const emptyDay = await prisma.trainingDay.create({
      data: { programId, dayNumber: 99, title: "Empty Day", objectives: [], status: "DRAFT" },
    });
    await assert.rejects(
      () => createSession(programId, instructorId, 99),
      /NO_QUESTIONS_FOR_DAY/
    );
    await prisma.trainingDay.delete({ where: { id: emptyDay.id } });
  });

  // LIVE-03: createSession generates a unique session code
  await test("LIVE-03: createSession generates a unique 6-char session code", async () => {
    const session = await createSession(programId, instructorId, 1);
    assert.ok(typeof session.sessionCode === "string");
    assert.strictEqual(session.sessionCode.length, 6);
    assert.match(session.sessionCode, /^[0-9A-F]{6}$/);
    await prisma.liveSession.delete({ where: { id: session.id } });
  });

  // LIVE-04: createSession starts with DRAFT status
  await test("LIVE-04: createSession creates session with DRAFT status", async () => {
    const session = await createSession(programId, instructorId, 1);
    assert.strictEqual(session.status, "DRAFT");
    await prisma.liveSession.delete({ where: { id: session.id } });
  });

  // LIVE-05: createSession creates SessionQuestion rows
  await test("LIVE-05: createSession creates SessionQuestion rows for day questions", async () => {
    const session = await createSession(programId, instructorId, 1);
    const sqs = await prisma.sessionQuestion.findMany({ where: { sessionId: session.id } });
    assert.ok(sqs.length > 0, "Should create at least one SessionQuestion");
    await prisma.liveSession.delete({ where: { id: session.id } });
  });

  // ── Participant join ───────────────────────────────────────────────────────

  let activeSessionId: string;
  let activeSessionCode: string;

  // Create and start a session for join tests
  const joinTestSession = await createSession(programId, instructorId, 1);
  await startSession(joinTestSession.id, instructorId);
  activeSessionId = joinTestSession.id;
  activeSessionCode = joinTestSession.sessionCode;

  // LIVE-06: participantJoin rejects invalid display name
  await test("LIVE-06: participantJoin rejects display name shorter than 2 chars", async () => {
    await assert.rejects(
      () => participantJoin(activeSessionCode, "X"),
      /INVALID_DISPLAY_NAME/
    );
  });

  // LIVE-07: participantJoin rejects non-existent session code
  await test("LIVE-07: participantJoin throws SESSION_NOT_FOUND for unknown code", async () => {
    await assert.rejects(
      () => participantJoin("XXXXXX", "Ali"),
      /SESSION_NOT_FOUND/
    );
  });

  // LIVE-08: participantJoin rejects DRAFT sessions
  await test("LIVE-08: participantJoin throws SESSION_NOT_STARTED for DRAFT session", async () => {
    const draftSession = await createSession(programId, instructorId, 1);
    await assert.rejects(
      () => participantJoin(draftSession.sessionCode, "Ali"),
      /SESSION_NOT_STARTED/
    );
    await prisma.liveSession.delete({ where: { id: draftSession.id } });
  });

  // LIVE-09: participantJoin returns guest token
  await test("LIVE-09: participantJoin returns a valid guest JWT", async () => {
    const result = await participantJoin(activeSessionCode, "Ahmed");
    assert.ok(typeof result.token === "string" && result.token.length > 10);
    assert.ok(typeof result.participantId === "string");
    assert.strictEqual(result.sessionId, activeSessionId);
  });

  // LIVE-10: guest token can be verified server-side with correct participantId
  await test("LIVE-10: guest token payload contains correct participantId and sessionId", async () => {
    const result = await participantJoin(activeSessionCode, "Fatima");
    const payload = verifyGuestToken(result.token);
    assert.strictEqual(payload.participantId, result.participantId);
    assert.strictEqual(payload.sessionId, activeSessionId);
    assert.strictEqual(payload.displayName, "Fatima");
  });

  // ── Session lifecycle ──────────────────────────────────────────────────────

  // LIVE-11: startSession transitions DRAFT → ACTIVE
  await test("LIVE-11: startSession transitions DRAFT session to ACTIVE", async () => {
    const session = await createSession(programId, instructorId, 1);
    assert.strictEqual(session.status, "DRAFT");
    const updated = await startSession(session.id, instructorId);
    assert.strictEqual(updated.status, "ACTIVE");
    await prisma.liveSession.delete({ where: { id: session.id } });
  });

  // LIVE-12: pauseSession transitions ACTIVE → PAUSED
  await test("LIVE-12: pauseSession transitions ACTIVE session to PAUSED", async () => {
    const session = await createSession(programId, instructorId, 1);
    await startSession(session.id, instructorId);
    const paused = await pauseSession(session.id, instructorId);
    assert.strictEqual(paused.status, "PAUSED");
    await prisma.liveSession.delete({ where: { id: session.id } });
  });

  // LIVE-13: resumeSession transitions PAUSED → ACTIVE
  await test("LIVE-13: resumeSession transitions PAUSED session to ACTIVE", async () => {
    const session = await createSession(programId, instructorId, 1);
    await startSession(session.id, instructorId);
    await pauseSession(session.id, instructorId);
    const resumed = await resumeSession(session.id, instructorId);
    assert.strictEqual(resumed.status, "ACTIVE");
    await prisma.liveSession.delete({ where: { id: session.id } });
  });

  // LIVE-14: endSession transitions to ENDED and sets endedAt
  await test("LIVE-14: endSession sets status to ENDED and records endedAt", async () => {
    const session = await createSession(programId, instructorId, 1);
    await startSession(session.id, instructorId);
    const ended = await endSession(session.id, instructorId);
    assert.strictEqual(ended.status, "ENDED");
    assert.ok(ended.endedAt instanceof Date);
    await prisma.liveSession.delete({ where: { id: session.id } });
  });

  // ── Question lifecycle ─────────────────────────────────────────────────────

  let liveSessionId: string;
  let sessionQuestionId: string;

  // Create a fresh active session for question lifecycle tests
  const qSession = await createSession(programId, instructorId, 1);
  await startSession(qSession.id, instructorId);
  liveSessionId = qSession.id;
  const sqs = await prisma.sessionQuestion.findMany({ where: { sessionId: liveSessionId } });
  sessionQuestionId = sqs[0].id;

  // LIVE-15: showQuestion transitions DRAFT → LIVE
  await test("LIVE-15: showQuestion transitions SessionQuestion to LIVE", async () => {
    const sq = await showQuestion(liveSessionId, sessionQuestionId, instructorId);
    assert.strictEqual(sq.status, "LIVE");
    assert.ok(sq.startedAt instanceof Date);
  });

  // LIVE-16: getLiveQuestionPayload does NOT include correctOptionId
  await test("LIVE-16: getLiveQuestionPayload never includes correctOptionId", async () => {
    const payload = await getLiveQuestionPayload(sessionQuestionId);
    const payloadStr = JSON.stringify(payload);
    assert.ok(!payloadStr.includes('"correctOptionId"'), "correctOptionId key must not appear in live payload");
    assert.ok(payload.options.length === 4, "Should have 4 options");
    // Verify none of the option objects has a correctOptionId property
    for (const opt of payload.options) {
      assert.ok(!("correctOptionId" in opt), "option must not have correctOptionId property");
    }
  });

  // LIVE-17: closeQuestion transitions LIVE → CLOSED
  await test("LIVE-17: closeQuestion transitions LIVE question to CLOSED", async () => {
    const closed = await closeQuestion(liveSessionId, sessionQuestionId, instructorId);
    assert.strictEqual(closed.status, "CLOSED");
    assert.ok(closed.closedAt instanceof Date);
  });

  // LIVE-18: showResults transitions CLOSED → RESULTS and reveals correct answer
  await test("LIVE-18: showResults transitions to RESULTS and reveals correctOptionId", async () => {
    const result = await showResults(liveSessionId, sessionQuestionId, instructorId);
    assert.ok("correctOptionId" in result, "correctOptionId should be revealed in results");
    assert.strictEqual(result.correctOptionId, optionBId);
    const sq = await prisma.sessionQuestion.findUnique({ where: { id: sessionQuestionId } });
    assert.strictEqual(sq?.status, "RESULTS");
  });

  // ── Answer submission ──────────────────────────────────────────────────────

  // Create a fresh session for answer tests
  const ansSession = await createSession(programId, instructorId, 1);
  await startSession(ansSession.id, instructorId);
  const ansSqs = await prisma.sessionQuestion.findMany({ where: { sessionId: ansSession.id } });
  const ansSessionQId = ansSqs[0].id;
  await showQuestion(ansSession.id, ansSessionQId, instructorId);

  const { token: p1Token, participantId: p1Id } = await participantJoin(ansSession.sessionCode, "Player1");
  const { token: p2Token, participantId: p2Id } = await participantJoin(ansSession.sessionCode, "Player2");

  // LIVE-19: submitAnswer with invalid token throws INVALID_TOKEN
  await test("LIVE-19: submitAnswer rejects invalid participant token", async () => {
    await assert.rejects(
      () => submitAnswer("invalid.jwt.token", ansSessionQId, optionBId),
      /INVALID_TOKEN/
    );
  });

  // LIVE-20: submitAnswer with question not LIVE throws QUESTION_NOT_LIVE
  await test("LIVE-20: submitAnswer rejects answer when question is not LIVE", async () => {
    const closedSession = await createSession(programId, instructorId, 1);
    await startSession(closedSession.id, instructorId);
    const cSqs = await prisma.sessionQuestion.findMany({ where: { sessionId: closedSession.id } });
    const { token: cToken } = await participantJoin(closedSession.sessionCode, "TestP");

    // Don't show the question (keep it in DRAFT status)
    await assert.rejects(
      () => submitAnswer(cToken, cSqs[0].id, optionBId),
      /QUESTION_NOT_LIVE/
    );
    await prisma.liveSession.delete({ where: { id: closedSession.id } });
  });

  // LIVE-21: submitAnswer correct answer awards SCORE_CORRECT points
  await test("LIVE-21: correct answer awards 10 points", async () => {
    const result = await submitAnswer(p1Token, ansSessionQId, optionBId);
    assert.strictEqual(result.duplicate, false);
    assert.strictEqual(result.answer.isCorrect, true);
    assert.strictEqual(Number(result.answer.scoreAwarded), 10);
  });

  // LIVE-22: submitAnswer wrong answer awards 0 points
  await test("LIVE-22: wrong answer awards 0 points", async () => {
    const result = await submitAnswer(p2Token, ansSessionQId, optionAId);
    assert.strictEqual(result.duplicate, false);
    assert.strictEqual(result.answer.isCorrect, false);
    assert.strictEqual(Number(result.answer.scoreAwarded), 0);
  });

  // LIVE-23: submitAnswer is idempotent — duplicate submission returns duplicate flag
  await test("LIVE-23: duplicate answer submission returns duplicate:true", async () => {
    const result = await submitAnswer(p1Token, ansSessionQId, optionBId);
    assert.strictEqual(result.duplicate, true);
  });

  // ── Leaderboard & results ──────────────────────────────────────────────────

  // LIVE-24: getLeaderboard returns participants sorted by score
  await test("LIVE-24: getLeaderboard sorts participants by totalScore descending", async () => {
    const leaderboard = await getLeaderboard(ansSession.id);
    assert.ok(leaderboard.length >= 2, "Should have at least 2 participants");

    for (let i = 1; i < leaderboard.length; i++) {
      assert.ok(
        leaderboard[i - 1].totalScore >= leaderboard[i].totalScore,
        "Leaderboard should be sorted by score desc"
      );
    }
  });

  // LIVE-25: leaderboard assigns rank 1 to highest scorer
  await test("LIVE-25: leaderboard rank 1 goes to highest scorer", async () => {
    const leaderboard = await getLeaderboard(ansSession.id);
    const rank1 = leaderboard.find((p) => p.rank === 1);
    assert.ok(rank1, "Should have rank 1 participant");
    assert.strictEqual(rank1.totalScore, 10, "Rank 1 participant should have 10 points");
  });

  // LIVE-26: buildQuestionResult reveals correctOptionId and counts
  await test("LIVE-26: buildQuestionResult includes correctOptionId and answer counts", async () => {
    await closeQuestion(ansSession.id, ansSessionQId, instructorId);
    const result = await buildQuestionResult(ansSessionQId);
    assert.strictEqual(result.correctOptionId, optionBId);
    assert.strictEqual(result.totalAnswers, 2);
    assert.strictEqual(result.correctCount, 1);
    assert.ok(typeof result.answerCounts === "object");
  });

  await cleanup();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
