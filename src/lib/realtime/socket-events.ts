// Realtime event name constants for the Phase 19 foundation layer.
// Kept separate from src/lib/session/events.ts so that future client hooks
// can import a single, stable surface without pulling in session-service deps.

export const REALTIME_EVENTS = {
  /** Server → room: a new participant joined the session */
  PARTICIPANT_JOINED:  "realtime:participant_joined",
  /** Server → room: a participant submitted an answer */
  ANSWER_SUBMITTED:    "realtime:answer_submitted",
  /** Server → room: the active question changed (shown or advanced) */
  QUESTION_CHANGED:    "realtime:question_changed",
  /** Server → room: leaderboard recalculated */
  LEADERBOARD_UPDATED: "realtime:leaderboard_updated",
  /** Server → room: session ended */
  SESSION_ENDED:       "realtime:session_ended",
} as const;

export type RealtimeEventName = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];
