// Realtime event name constants for the Phase 19 foundation layer.
// Kept separate from src/lib/session/events.ts so that future client hooks
// can import a single, stable surface without pulling in session-service deps.

export const REALTIME_EVENTS = {
  // ── Participant events ────────────────────────────────────────────────────
  /** Server → room: a new participant joined the session */
  PARTICIPANT_JOINED:  "realtime:participant_joined",
  /** Server → room: a participant submitted an answer */
  ANSWER_SUBMITTED:    "realtime:answer_submitted",
  /** Server → room: leaderboard recalculated */
  LEADERBOARD_UPDATED: "realtime:leaderboard_updated",

  // ── Session control events (Phase 19.4) ──────────────────────────────────
  /** Server → room: session started by instructor */
  SESSION_STARTED:     "realtime:session_started",
  /** Server → room: session paused by instructor */
  SESSION_PAUSED:      "realtime:session_paused",
  /** Server → room: session resumed by instructor */
  SESSION_RESUMED:     "realtime:session_resumed",
  /** Server → room: session ended */
  SESSION_ENDED:       "realtime:session_ended",

  // ── Question control events (Phase 19.4) ─────────────────────────────────
  /** Server → room: a question was activated / shown */
  QUESTION_STARTED:    "realtime:question_started",
  /** Server → room: instructor navigated to a different question */
  QUESTION_CHANGED:    "realtime:question_changed",
  /** Server → room: question locked (no more answers accepted) */
  QUESTION_LOCKED:     "realtime:question_locked",
} as const;

export type RealtimeEventName = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];
