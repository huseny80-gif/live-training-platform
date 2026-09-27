// Realtime foundation — shared TypeScript types for the Socket.IO layer.
// These types are intentionally decoupled from database models so they can be
// imported by both server-side handlers and client-side hooks.

// ── Room naming ───────────────────────────────────────────────────────────────

/** Returns the canonical Socket.IO room name for a given session code. */
export function sessionRoom(code: string): string {
  return `session:${code}`;
}

/** Returns the canonical Socket.IO room name for the instructor of a session. */
export function instructorRoom(sessionId: string): string {
  return `instructor:${sessionId}`;
}

// ── Realtime event payloads ───────────────────────────────────────────────────

export interface ParticipantJoinedPayload {
  sessionCode: string;
  participantId: string;
  displayName: string;
  joinedAt: string;       // ISO timestamp
  totalParticipants: number;
}

export interface AnswerSubmittedPayload {
  sessionCode: string;
  sessionQuestionId: string;
  participantId: string;
  answeredCount: number;
  totalParticipants: number;
}

export interface QuestionChangedPayload {
  sessionCode: string;
  sessionQuestionId: string;
  questionOrder: number;
  questionText: string;
  timeLimitSeconds: number | null;
}

export interface LeaderboardUpdatedPayload {
  sessionCode: string;
  entries: LeaderboardEntry[];
}

export interface LeaderboardEntry {
  rank: number;
  participantId: string;
  displayName: string;
  totalScore: number;
  correctCount: number;
  answersCount: number;
}

export interface SessionEndedPayload {
  sessionCode: string;
  sessionId: string;
  endedAt: string;        // ISO timestamp
  leaderboard: LeaderboardEntry[];
}

// ── Session control event payloads (Phase 19.4) ───────────────────────────────

export interface SessionStartedPayload {
  sessionCode: string;
  sessionId: string;
  timestamp: string;      // ISO timestamp
}

export interface SessionPausedPayload {
  sessionCode: string;
  sessionId: string;
  timestamp: string;
}

export interface SessionResumedPayload {
  sessionCode: string;
  sessionId: string;
  timestamp: string;
}

// ── Question control event payloads (Phase 19.4) ──────────────────────────────

export interface QuestionStartedPayload {
  sessionCode: string;
  sessionId: string;
  questionId: string;
  questionIndex: number;
  timestamp: string;
}

export interface QuestionLockedPayload {
  sessionCode: string;
  sessionId: string;
  questionId: string;
  questionIndex: number;
  timestamp: string;
}

// ── Discriminated union for all realtime events ───────────────────────────────

export type RealtimeEvent =
  | { type: "PARTICIPANT_JOINED";    payload: ParticipantJoinedPayload }
  | { type: "ANSWER_SUBMITTED";      payload: AnswerSubmittedPayload }
  | { type: "QUESTION_CHANGED";      payload: QuestionChangedPayload }
  | { type: "LEADERBOARD_UPDATED";   payload: LeaderboardUpdatedPayload }
  | { type: "SESSION_ENDED";         payload: SessionEndedPayload }
  | { type: "SESSION_STARTED";       payload: SessionStartedPayload }
  | { type: "SESSION_PAUSED";        payload: SessionPausedPayload }
  | { type: "SESSION_RESUMED";       payload: SessionResumedPayload }
  | { type: "QUESTION_STARTED";  payload: QuestionStartedPayload }
  | { type: "QUESTION_CHANGED";  payload: QuestionChangedPayload }
  | { type: "QUESTION_LOCKED";   payload: QuestionLockedPayload };
