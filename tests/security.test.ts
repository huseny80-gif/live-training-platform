/**
 * Phase 20.1 Security Tests
 * SEC-01 through SEC-12
 *
 * Tests cover:
 * - Rate limiting — answer submission (SEC-01 to SEC-03)
 * - AuditLog — session lifecycle events written (SEC-04 to SEC-08)
 * - SESSION_SECRET behavior (SEC-09 to SEC-10)
 * - guest-token isolation (SEC-11)
 * - correctOptionId never exposed (SEC-12)
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
  submitAnswer,
} from "../src/lib/session/service";
import { checkAnswerRateLimit } from "../src/lib/rate-limit";
import { issueGuestToken, verifyGuestToken } from "../src/lib/session/guest-token";

// ─── Test runner ─────────────────────────────────────────────────────────────

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

// ─── Setup ────────────────────────────────────────────────────────────────────

let instructorId: string;
let programId: string;

async function cleanup() {
  const instructors = await prisma.instructor.findMany({
    where: { email: { contains: "sec-test-" } },
    select: { id: true },
  });
  const ids = instructors.map((i) => i.id);
  if (ids.length > 0) {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.liveSession.deleteMany({ where: { instructorId: { in: ids } } });
    await prisma.trainingProgram.deleteMany({ where: { instructorId: { in: ids } } });
    await prisma.instructor.deleteMany({ where: { id: { in: ids } } });
  }
}

async function setup() {
  await cleanup();

  const bcrypt = await import("bcryptjs");
  const instructor = await prisma.instructor.create({
    data: {
      email: `sec-test-${Date.now()}@example.com`,
      name: "Security Tester",
      passwordHash: await bcrypt.hash("TestPass123!", 10),
    },
  });
  instructorId = instructor.id;

  const program = await prisma.trainingProgram.create({
    data: {
      instructorId,
      title: "Security Test Program",
      description: "Phase 20.1 security tests",
      language: "AR",
    },
  });
  programId = program.id;

  const day = await prisma.trainingDay.create({
    data: { programId, dayNumber: 1, title: "Day 1", status: "DRAFT" },
  });

  const question = await prisma.question.create({
    data: {
      programId,
      dayId: day.id,
      questionText: "Security test question?",
      questionType: "MULTIPLE_CHOICE",
      questionOrder: 1,
      status: "APPROVED",
      generatedBy: "MANUAL",
    },
  });

  const optA = await prisma.questionOption.create({
    data: { questionId: question.id, optionLabel: "A", optionText: "Option A", displayOrder: 1 },
  });
  const correctOpt = await prisma.questionOption.create({
    data: { questionId: question.id, optionLabel: "B", optionText: "Option B", displayOrder: 2 },
  });

  await prisma.question.update({
    where: { id: question.id },
    data: { correctOptionId: correctOpt.id },
  });

  void optA; // referenced only to confirm it was created
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log("\nPhase 20.1 Security Tests\n");
  await setup();

  // ── Rate limiting ─────────────────────────────────────────────────────────

  await test("SEC-01: checkAnswerRateLimit allows first 10 requests for a key", async () => {
    const key = `sq-test-${Date.now()}:tokenhash`;
    for (let i = 0; i < 10; i++) {
      const r = checkAnswerRateLimit(key);
      assert.strictEqual(r.allowed, true, `Request ${i + 1} should be allowed`);
    }
  });

  await test("SEC-02: checkAnswerRateLimit blocks the 11th request and returns retryAfterMs > 0", async () => {
    const key = `sq-block-${Date.now()}:tokenhash`;
    for (let i = 0; i < 10; i++) checkAnswerRateLimit(key);
    const r = checkAnswerRateLimit(key);
    assert.strictEqual(r.allowed, false);
    assert.ok(r.retryAfterMs > 0, "retryAfterMs should be positive");
  });

  await test("SEC-03: rate limit is key-scoped — a different key is not affected", async () => {
    const keyA = `sq-a-${Date.now()}:hash1`;
    const keyB = `sq-b-${Date.now()}:hash2`;
    for (let i = 0; i < 10; i++) checkAnswerRateLimit(keyA);
    checkAnswerRateLimit(keyA); // 11th — should be blocked
    const r = checkAnswerRateLimit(keyB); // fresh key — must be allowed
    assert.strictEqual(r.allowed, true);
  });

  // ── AuditLog ──────────────────────────────────────────────────────────────

  const session = await createSession(programId, instructorId, 1, "Audit Test Session");
  const sessionId = session.id;

  await test("SEC-04: createSession writes SESSION_CREATED audit log", async () => {
    const log = await prisma.auditLog.findFirst({
      where: { entityType: "LiveSession", entityId: sessionId, action: "SESSION_CREATED" },
    });
    assert.ok(log, "SESSION_CREATED audit log should exist");
    assert.strictEqual(log.actorId, instructorId);
    assert.strictEqual(log.actorType, "INSTRUCTOR");
  });

  await startSession(sessionId, instructorId);

  await test("SEC-05: startSession writes SESSION_STARTED audit log", async () => {
    const log = await prisma.auditLog.findFirst({
      where: { entityType: "LiveSession", entityId: sessionId, action: "SESSION_STARTED" },
    });
    assert.ok(log, "SESSION_STARTED audit log should exist");
    assert.strictEqual(log.actorId, instructorId);
  });

  await pauseSession(sessionId, instructorId);

  await test("SEC-06: pauseSession writes SESSION_PAUSED audit log", async () => {
    const log = await prisma.auditLog.findFirst({
      where: { entityType: "LiveSession", entityId: sessionId, action: "SESSION_PAUSED" },
    });
    assert.ok(log, "SESSION_PAUSED audit log should exist");
  });

  await resumeSession(sessionId, instructorId);

  await test("SEC-07: resumeSession writes SESSION_RESUMED audit log", async () => {
    const log = await prisma.auditLog.findFirst({
      where: { entityType: "LiveSession", entityId: sessionId, action: "SESSION_RESUMED" },
    });
    assert.ok(log, "SESSION_RESUMED audit log should exist");
  });

  // Show a question to get a QUESTION_STARTED log
  const sq = await prisma.sessionQuestion.findFirst({ where: { sessionId } });
  assert.ok(sq, "SessionQuestion should exist");
  await showQuestion(sessionId, sq.id, instructorId);

  await test("SEC-08: showQuestion writes QUESTION_STARTED audit log", async () => {
    const log = await prisma.auditLog.findFirst({
      where: { entityType: "SessionQuestion", entityId: sq.id, action: "QUESTION_STARTED" },
    });
    assert.ok(log, "QUESTION_STARTED audit log should exist");
    assert.strictEqual(log.actorId, instructorId);
  });

  // ── SESSION_SECRET ────────────────────────────────────────────────────────

  await test("SEC-09: issueGuestToken / verifyGuestToken round-trip succeeds", async () => {
    const payload = { participantId: "p-test", sessionId: "s-test", displayName: "Tester" };
    const token = issueGuestToken(payload);
    assert.ok(typeof token === "string" && token.length > 10);
    const decoded = verifyGuestToken(token);
    assert.strictEqual(decoded.participantId, "p-test");
    assert.strictEqual(decoded.sessionId, "s-test");
  });

  await test("SEC-10: verifyGuestToken throws INVALID_TOKEN for tampered token", async () => {
    const payload = { participantId: "p-x", sessionId: "s-x", displayName: "X" };
    const token = issueGuestToken(payload);
    const tampered = token.slice(0, -4) + "XXXX";
    let threw = false;
    try { verifyGuestToken(tampered); } catch { threw = true; }
    assert.ok(threw, "tampered token should throw");
  });

  // ── correctOptionId never exposed ─────────────────────────────────────────

  await test("SEC-11: getLiveQuestionPayload does not include correctOptionId", async () => {
    const { getLiveQuestionPayload } = await import("../src/lib/session/service");
    const q = await getLiveQuestionPayload(sq.id);
    assert.ok(q, "payload should exist");
    assert.ok(!("correctOptionId" in q), "correctOptionId must not be in live question payload");
    if (q.options) {
      for (const opt of q.options) {
        assert.ok(!("isCorrect" in opt), "isCorrect must not be in option payload");
        assert.ok(!("correctOptionId" in opt), "correctOptionId must not be in option payload");
      }
    }
  });

  await test("SEC-12: submitAnswer response does not include correctOptionId", async () => {
    const joinResult = await participantJoin(session.sessionCode, "TestParticipant");
    const opts = await prisma.questionOption.findMany({ where: { questionId: sq.questionId } });
    const correctQuestion = await prisma.question.findUnique({
      where: { id: sq.questionId },
      select: { correctOptionId: true },
    });
    const wrongOpt = opts.find((o) => o.id !== correctQuestion?.correctOptionId);
    assert.ok(wrongOpt, "wrong option should exist");

    const result = await submitAnswer(joinResult.token, sq.id, wrongOpt.id);
    assert.ok(!("correctOptionId" in result), "correctOptionId must not be in submitAnswer result");
    assert.ok(!("correctOptionId" in result.answer), "correctOptionId must not be in result.answer");
  });

  await endSession(sessionId, instructorId);

  await cleanup();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
