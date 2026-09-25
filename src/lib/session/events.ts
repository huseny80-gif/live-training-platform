// ─────────────────────────────────────────────────────────────────────────────
// Socket.io Event Contracts — Phase 7
//
// Naming convention:
//   instructor:*  — emitted by Instructor client
//   participant:* — emitted by Participant client
//   session:*     — broadcast from Server to room
//   question:*    — question lifecycle events
//   error:*       — server error responses
//
// Direction markers:
//   C→S = Client to Server (emit)
//   S→C = Server to Client (emit / broadcast)
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared payloads ───────────────────────────────────────────────────────────

export interface QuestionOptionPayload {
  id: string;
  optionLabel: "A" | "B" | "C" | "D";
  optionText: string;
  displayOrder: number;
}

/** Safe question — no correct answer included */
export interface LiveQuestionPayload {
  sessionQuestionId: string;
  questionId: string;
  questionText: string;
  options: QuestionOptionPayload[];   // correctOptionId deliberately absent
  questionOrder: number;
  timeLimitSeconds: number | null;
  startedAt: string;                  // ISO timestamp
}

export interface QuestionResultPayload {
  sessionQuestionId: string;
  correctOptionId: string;            // revealed only AFTER question is CLOSED
  answerCounts: Record<string, number>; // optionId → count
  correctCount: number;
  totalAnswers: number;
}

export interface LeaderboardEntry {
  participantId: string;
  displayName: string;
  totalScore: number;
  rank: number;
  correctCount: number;
  answersCount: number;
}

// ── Instructor → Server (C→S) ─────────────────────────────────────────────────

export interface InstructorAuthPayload {
  sessionToken: string;               // next-auth JWT
  sessionId: string;
}

export interface StartSessionPayload {
  sessionId: string;
}

export interface ShowQuestionPayload {
  sessionId: string;
  sessionQuestionId: string;
}

export interface CloseQuestionPayload {
  sessionId: string;
  sessionQuestionId: string;
}

export interface ShowResultsPayload {
  sessionId: string;
  sessionQuestionId: string;
}

export interface NextQuestionPayload {
  sessionId: string;
}

export interface PauseSessionPayload {
  sessionId: string;
}

export interface ResumeSessionPayload {
  sessionId: string;
}

export interface EndSessionPayload {
  sessionId: string;
}

// ── Participant → Server (C→S) ────────────────────────────────────────────────

export interface ParticipantJoinPayload {
  sessionCode: string;
  displayName: string;
}

export interface SubmitAnswerPayload {
  participantToken: string;           // guest JWT issued on join
  sessionQuestionId: string;
  selectedOptionId: string;
  timeTakenSeconds?: number;
}

// ── Server → Instructor (S→C) ─────────────────────────────────────────────────

export interface ParticipantJoinedPayload {
  participantId: string;
  displayName: string;
  joinedAt: string;
  totalParticipants: number;
}

export interface AnswerReceivedPayload {
  sessionQuestionId: string;
  answeredCount: number;
  totalParticipants: number;
}

// ── Server → Participants (broadcast to room) ─────────────────────────────────

export interface SessionStartedPayload {
  sessionId: string;
  title: string | null;
  dayNumber: number;
  totalQuestions: number;
}

export interface SessionPausedPayload { sessionId: string }
export interface SessionResumedPayload { sessionId: string }
export interface SessionEndedPayload {
  sessionId: string;
  leaderboard: LeaderboardEntry[];
}

export interface AnswerAcknowledgedPayload {
  sessionQuestionId: string;
  participantId: string;
  isCorrect: boolean;                 // participant can see their own result
  scoreAwarded: number;
  // correctOptionId NOT included here
}

// ── Socket event name constants ───────────────────────────────────────────────

export const EVENTS = {
  // Instructor → Server
  INSTRUCTOR_AUTH:      "instructor:auth",
  START_SESSION:        "instructor:start_session",
  SHOW_QUESTION:        "instructor:show_question",
  CLOSE_QUESTION:       "instructor:close_question",
  SHOW_RESULTS:         "instructor:show_results",
  NEXT_QUESTION:        "instructor:next_question",
  PAUSE_SESSION:        "instructor:pause_session",
  RESUME_SESSION:       "instructor:resume_session",
  END_SESSION:          "instructor:end_session",

  // Participant → Server
  PARTICIPANT_JOIN:     "participant:join",
  SUBMIT_ANSWER:        "participant:submit_answer",

  // Server → Instructor
  INSTRUCTOR_JOINED:    "server:instructor_joined",
  PARTICIPANT_JOINED:   "server:participant_joined",
  ANSWER_RECEIVED:      "server:answer_received",
  SESSION_STATE:        "server:session_state",

  // Server → All in room (broadcast)
  SESSION_STARTED:      "session:started",
  SESSION_PAUSED:       "session:paused",
  SESSION_RESUMED:      "session:resumed",
  SESSION_ENDED:        "session:ended",
  QUESTION_LIVE:        "question:live",
  QUESTION_CLOSED:      "question:closed",
  QUESTION_RESULTS:     "question:results",
  ANSWER_ACKNOWLEDGED:  "answer:acknowledged",

  // Error responses
  ERROR:                "error",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
