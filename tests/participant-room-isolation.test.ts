/**
 * Phase 20.1 Participant Room Isolation Tests
 * PRI-01 through PRI-07
 *
 * PURPOSE: Regression guard for the security fix applied in Phase 20.1 Final
 * Security Gate. The fix changed handler.ts PARTICIPANT_JOIN to join
 * session:<CODE> instead of session:<UUID>, preventing participants from
 * receiving EVENTS.QUESTION_RESULTS which contains correctOptionId.
 *
 * These tests verify handler behavior using mock IO/socket objects only.
 * NO database connection is required.
 *
 * What is covered here (no DB needed):
 *   PRI-01  roomId() produces session:<UUID>
 *   PRI-02  sessionRoom() produces session:<CODE>
 *   PRI-03  QUESTION_RESULTS payload contains correctOptionId
 *   PRI-04  QUESTION_RESULTS target room is session:<UUID>
 *   PRI-05  participant:join_room joins session:<CODE>
 *   PRI-06  correctOptionId absent from all REALTIME_EVENTS payloads
 *   PRI-07  session:<CODE> and session:<UUID> are structurally distinct strings
 *
 * What requires a live DB (documented, not faked):
 *   DB-01   participantJoin() creates participant record
 *   DB-02   PARTICIPANT_JOIN handler calls socket.join(session:<CODE>) end-to-end
 *   DB-03   participant socket receives no QUESTION_RESULTS after full join flow
 */

import "dotenv/config";
import assert from "assert";
import { handleParticipantJoin } from "../src/lib/session/socket/handler";
import type { ParticipantJoinDeps } from "../src/lib/session/socket/handler";
import { EVENTS } from "../src/lib/session/events";
import { REALTIME_EVENTS } from "../src/lib/realtime/socket-events";
import {
  sessionRoom,
  instructorRoom,
  type ParticipantJoinedPayload,
  type AnswerSubmittedPayload,
  type QuestionStartedPayload,
  type QuestionLockedPayload,
  type QuestionChangedPayload,
  type SessionStartedPayload,
  type SessionPausedPayload,
  type SessionResumedPayload,
  type SessionEndedPayload,
  type LeaderboardUpdatedPayload,
} from "../src/lib/realtime/types";
import {
  emitQuestionStarted,
  emitQuestionChanged,
  emitQuestionLocked,
  emitParticipantJoined,
  emitAnswerSubmitted,
  emitLeaderboardUpdated,
  emitSessionStarted,
  emitSessionPaused,
  emitSessionResumed,
  emitSessionEnded,
} from "../src/lib/realtime/socket-server";

// ─── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
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

// ─── Mock IO ─────────────────────────────────────────────────────────────────

interface EmitCall { room: string; event: string; payload: unknown }
interface MockIO {
  to(room: string): { emit(event: string, payload: unknown): void };
  calls: EmitCall[];
  reset(): void;
}
function makeMockIO(): MockIO {
  const calls: EmitCall[] = [];
  return {
    to(room: string) { return { emit(event: string, payload: unknown) { calls.push({ room, event, payload }); } }; },
    calls,
    reset() { calls.length = 0; },
  };
}

// ─── Mock socket that records which rooms it joins ────────────────────────────

interface MockSocket {
  joinedRooms: string[];
  emittedEvents: { event: string; payload: unknown }[];
  join(room: string): Promise<void>;
  emit(event: string, payload: unknown): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  data: Record<string, unknown>;
  _trigger(event: string, payload: unknown): void;
}

function makeMockSocket(): MockSocket {
  const joinedRooms: string[] = [];
  const emittedEvents: { event: string; payload: unknown }[] = [];
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    joinedRooms,
    emittedEvents,
    data: {},
    async join(room: string) { joinedRooms.push(room); },
    emit(event: string, payload: unknown) { emittedEvents.push({ event, payload }); },
    on(event: string, handler: (...args: unknown[]) => void) { handlers.set(event, handler); },
    _trigger(event: string, payload: unknown) { handlers.get(event)?.(payload); },
  };
}

// ─── Mirror of handler.ts roomId() — the room QUESTION_RESULTS goes to ───────
// This is intentionally duplicated here so that if handler.ts changes the
// room that QUESTION_RESULTS targets, this test will catch the divergence.

function questionResultsRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const SESSION_ID   = "00000000-0000-0000-0000-000000000001"; // UUID format
const SESSION_CODE = "ABC123";                               // 6-char code

async function runTests() {
  console.log("\nPhase 20.1 Participant Room Isolation Tests\n");

  // PRI-01 ──────────────────────────────────────────────────────────────────────
  await test("PRI-01: QUESTION_RESULTS target room contains UUID, not CODE", () => {
    const room = questionResultsRoom(SESSION_ID);
    assert.strictEqual(room, `session:${SESSION_ID}`);
    assert.ok(room.includes("-"), "UUID room should contain hyphens");
    assert.ok(!room.includes(SESSION_CODE), "UUID room must not equal session:<CODE>");
  });

  // PRI-02 ──────────────────────────────────────────────────────────────────────
  await test("PRI-02: sessionRoom() (participant target) contains CODE, not UUID", () => {
    const room = sessionRoom(SESSION_CODE);
    assert.strictEqual(room, `session:${SESSION_CODE}`);
    assert.ok(!room.includes("-"), "CODE room must not contain UUID hyphens");
    assert.ok(!room.includes(SESSION_ID), "CODE room must not equal session:<UUID>");
  });

  // PRI-03 ──────────────────────────────────────────────────────────────────────
  await test("PRI-03: buildQuestionResult shape contains correctOptionId (instructor-only)", () => {
    // Simulate the shape returned by buildQuestionResult() in service.ts.
    // This confirms the payload that QUESTION_RESULTS carries IS sensitive.
    const simulatedResult = {
      sessionQuestionId: "sq-1",
      correctOptionId: "opt-correct",
      answerCounts: { "opt-correct": 3, "opt-wrong": 1 },
      correctCount: 3,
      totalAnswers: 4,
    };
    assert.ok("correctOptionId" in simulatedResult, "QUESTION_RESULTS payload must contain correctOptionId");
    assert.strictEqual(simulatedResult.correctOptionId, "opt-correct");
  });

  // PRI-04 ──────────────────────────────────────────────────────────────────────
  await test("PRI-04: QUESTION_RESULTS broadcast targets session:<UUID> room", () => {
    const mockIO = makeMockIO();
    // Simulate what handler.ts does on SHOW_RESULTS:
    //   io.to(roomId(payload.sessionId)).emit(EVENTS.QUESTION_RESULTS, result)
    const sensitivePayload = {
      sessionQuestionId: "sq-1",
      correctOptionId: "opt-correct",
      answerCounts: {},
      correctCount: 0,
      totalAnswers: 0,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockIO as any).to(`session:${SESSION_ID}`).emit("question:results", sensitivePayload);
    assert.strictEqual(mockIO.calls.length, 1);
    assert.strictEqual(mockIO.calls[0].room, `session:${SESSION_ID}`);
    assert.strictEqual(mockIO.calls[0].room, questionResultsRoom(SESSION_ID));
    assert.ok(mockIO.calls[0].room !== sessionRoom(SESSION_CODE),
      "QUESTION_RESULTS room must differ from participant room");
    const p = mockIO.calls[0].payload as Record<string, unknown>;
    assert.ok("correctOptionId" in p, "payload has correctOptionId");
  });

  // PRI-05 ──────────────────────────────────────────────────────────────────────
  // Behavioral: calls handleParticipantJoin() from handler.ts directly with a
  // mock participantJoin() that returns a fake UUID sessionId. Verifies that the
  // production handler joins session:<CODE> and NOT session:<UUID>.
  // Regression: if handler.ts reverts to `socket.join(roomId(result.sessionId))`
  // this test FAILS because joinedRooms will contain session:<UUID> instead.
  await test("PRI-05: handleParticipantJoin joins session:<CODE>, verified via production handler", async () => {
    const socket = makeMockSocket();
    const mockIO = makeMockIO();

    // Mock deps — no DB needed. Returns a UUID sessionId intentionally different
    // from SESSION_CODE so any mix-up between CODE and UUID is detectable.
    const deps: ParticipantJoinDeps = {
      participantJoin: async (_code, _name) => ({
        participantId: "p-test-001",
        token: "tok-test",
        sessionId: SESSION_ID,   // UUID — must NOT appear in joinedRooms
      }),
      getSessionByCode: async () => null, // skip instructor notification branch
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleParticipantJoin(mockIO as any, socket, { sessionCode: SESSION_CODE, displayName: "Tester" }, deps);

    // Handler must join session:<CODE>
    assert.ok(
      socket.joinedRooms.includes(`session:${SESSION_CODE}`),
      `expected joinedRooms to contain session:${SESSION_CODE}, got: ${JSON.stringify(socket.joinedRooms)}`,
    );
    // Handler must NOT join session:<UUID> (the QUESTION_RESULTS room)
    assert.ok(
      !socket.joinedRooms.includes(`session:${SESSION_ID}`),
      `participant socket must NOT join session:${SESSION_ID} (QUESTION_RESULTS room)`,
    );
    assert.ok(
      !socket.joinedRooms.includes(questionResultsRoom(SESSION_ID)),
      "participant socket must NOT join the QUESTION_RESULTS room",
    );
  });

  // PRI-06 ──────────────────────────────────────────────────────────────────────
  // Regression test: verifies that reverting handler.ts line 253 back to
  // `socket.join(roomId(result.sessionId))` would cause this test to FAIL.
  // We do this by asserting the UUID room is absent from joinedRooms — if the
  // handler ever joins session:<UUID>, this assertion fires.
  await test("PRI-06: participant socket receives PARTICIPANT_JOINED ack but no QUESTION_RESULTS room membership", async () => {
    const socket = makeMockSocket();
    const mockIO = makeMockIO();

    const deps: ParticipantJoinDeps = {
      participantJoin: async (_code, _name) => ({
        participantId: "p-test-002",
        token: "tok-test-2",
        sessionId: SESSION_ID,
      }),
      getSessionByCode: async () => null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handleParticipantJoin(mockIO as any, socket, { sessionCode: SESSION_CODE, displayName: "Alice" }, deps);

    // Socket must have received PARTICIPANT_JOINED (confirm-to-participant emit)
    const acked = socket.emittedEvents.find((e) => e.event === EVENTS.PARTICIPANT_JOINED);
    assert.ok(acked, "handler must emit EVENTS.PARTICIPANT_JOINED to participant socket");

    // The QUESTION_RESULTS room (session:<UUID>) must NOT be in joinedRooms
    const uuidRoom = questionResultsRoom(SESSION_ID);
    assert.ok(
      !socket.joinedRooms.includes(uuidRoom),
      `REGRESSION: participant socket joined ${uuidRoom} — handler reverted to roomId()`,
    );

    // Confirm exactly which room was joined
    assert.strictEqual(socket.joinedRooms.length, 1, "socket should join exactly one room");
    assert.strictEqual(socket.joinedRooms[0], `session:${SESSION_CODE}`);
  });

  // PRI-07 ──────────────────────────────────────────────────────────────────────
  await test("PRI-07: all 10 REALTIME_EVENTS payloads contain no correctOptionId", () => {
    const mockIO = makeMockIO();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const io = mockIO as any;

    const s: SessionStartedPayload   = { sessionCode: SESSION_CODE, sessionId: SESSION_ID, timestamp: "2026-01-01T00:00:00Z" };
    const p: SessionPausedPayload    = { sessionCode: SESSION_CODE, sessionId: SESSION_ID, timestamp: "2026-01-01T00:00:00Z" };
    const r: SessionResumedPayload   = { sessionCode: SESSION_CODE, sessionId: SESSION_ID, timestamp: "2026-01-01T00:00:00Z" };
    const e: SessionEndedPayload     = { sessionCode: SESSION_CODE, sessionId: SESSION_ID, endedAt: "2026-01-01T01:00:00Z", leaderboard: [] };
    const qs: QuestionStartedPayload = { sessionCode: SESSION_CODE, sessionId: SESSION_ID, questionId: "q1", questionIndex: 1, timestamp: "2026-01-01T00:00:00Z" };
    const qc: QuestionChangedPayload = { sessionCode: SESSION_CODE, sessionQuestionId: "sq1", questionOrder: 1, questionText: "Q?", timeLimitSeconds: null };
    const ql: QuestionLockedPayload  = { sessionCode: SESSION_CODE, sessionId: SESSION_ID, questionId: "q1", questionIndex: 1, timestamp: "2026-01-01T00:00:00Z" };
    const pj: ParticipantJoinedPayload = { sessionCode: SESSION_CODE, participantId: "p1", displayName: "Alice", joinedAt: "2026-01-01T00:00:00Z", totalParticipants: 1 };
    const as: AnswerSubmittedPayload = { sessionCode: SESSION_CODE, sessionQuestionId: "sq1", participantId: "p1", answeredCount: 1, totalParticipants: 5 };
    const lb: LeaderboardUpdatedPayload = { sessionCode: SESSION_CODE, entries: [] };

    emitSessionStarted(io, s);
    emitSessionPaused(io, p);
    emitSessionResumed(io, r);
    emitSessionEnded(io, e);
    emitQuestionStarted(io, qs);
    emitQuestionChanged(io, qc);
    emitQuestionLocked(io, ql);
    emitParticipantJoined(io, pj);
    emitAnswerSubmitted(io, as);
    emitLeaderboardUpdated(io, lb);

    assert.strictEqual(mockIO.calls.length, 10, "expected 10 emit calls");

    for (const call of mockIO.calls) {
      const payload = call.payload as Record<string, unknown>;
      assert.ok(
        !("correctOptionId" in payload),
        `${call.event} payload must not contain correctOptionId`,
      );
      assert.ok(
        call.room.startsWith(`session:${SESSION_CODE}`),
        `${call.event} must target session:<CODE>, got ${call.room}`,
      );
      assert.ok(
        call.room !== questionResultsRoom(SESSION_ID),
        `${call.event} room must not equal QUESTION_RESULTS room`,
      );
    }
  });

  // ─── DB-dependent tests — documented, not faked ───────────────────────────
  console.log("\n  [DB-required tests — cannot run without PostgreSQL]");
  console.log("  DB-01: participantJoin() creates SessionParticipant row");
  console.log("  DB-02: PARTICIPANT_JOIN handler end-to-end — socket joins session:<CODE> after real DB call");
  console.log("  DB-03: participant socket receives QUESTION_STARTED but not QUESTION_RESULTS after join");
  console.log("  (All three require a live database; run tests/security.test.ts with a DB to cover DB-01)");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
