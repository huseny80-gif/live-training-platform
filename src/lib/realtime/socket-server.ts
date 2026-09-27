// Realtime foundation — server-side helpers for emitting Phase 19 events.
// These functions wrap socket.io `io.to(...).emit(...)` calls with typed
// payloads so that service-layer code never constructs room names or event
// strings inline.
//
// Usage (from a Socket.IO handler or API route that has access to the io
// instance):
//
//   import { emitParticipantJoined } from "@/lib/realtime/socket-server";
//   emitParticipantJoined(io, { sessionCode, participantId, ... });

import type { Server } from "socket.io";
import { REALTIME_EVENTS } from "./socket-events";
import {
  sessionRoom,
  type ParticipantJoinedPayload,
  type AnswerSubmittedPayload,
  type QuestionChangedPayload,
  type LeaderboardUpdatedPayload,
  type SessionEndedPayload,
} from "./types";

export function emitParticipantJoined(
  io: Server,
  payload: ParticipantJoinedPayload,
): void {
  io.to(sessionRoom(payload.sessionCode)).emit(
    REALTIME_EVENTS.PARTICIPANT_JOINED,
    payload,
  );
}

export function emitAnswerSubmitted(
  io: Server,
  payload: AnswerSubmittedPayload,
): void {
  io.to(sessionRoom(payload.sessionCode)).emit(
    REALTIME_EVENTS.ANSWER_SUBMITTED,
    payload,
  );
}

export function emitQuestionChanged(
  io: Server,
  payload: QuestionChangedPayload,
): void {
  io.to(sessionRoom(payload.sessionCode)).emit(
    REALTIME_EVENTS.QUESTION_CHANGED,
    payload,
  );
}

export function emitLeaderboardUpdated(
  io: Server,
  payload: LeaderboardUpdatedPayload,
): void {
  io.to(sessionRoom(payload.sessionCode)).emit(
    REALTIME_EVENTS.LEADERBOARD_UPDATED,
    payload,
  );
}

export function emitSessionEnded(
  io: Server,
  payload: SessionEndedPayload,
): void {
  io.to(sessionRoom(payload.sessionCode)).emit(
    REALTIME_EVENTS.SESSION_ENDED,
    payload,
  );
}
