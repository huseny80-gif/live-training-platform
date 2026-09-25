// Socket.io event handler — wires EVENTS constants to SessionService functions.
// Instructor is authenticated via next-auth session token.
// Participants are authenticated via guest JWT.

import type { Server, Socket } from "socket.io";
import { getToken } from "next-auth/jwt";
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
  getSessionByCode,
  getSessionQuestions,
} from "../service";
import { EVENTS } from "../events";
import type {
  InstructorAuthPayload,
  StartSessionPayload,
  ShowQuestionPayload,
  CloseQuestionPayload,
  ShowResultsPayload,
  NextQuestionPayload,
  PauseSessionPayload,
  ResumeSessionPayload,
  EndSessionPayload,
  ParticipantJoinPayload,
  SubmitAnswerPayload,
} from "../events";

function roomId(sessionId: string) {
  return `session:${sessionId}`;
}

function instructorRoom(sessionId: string) {
  return `instructor:${sessionId}`;
}

export function registerSessionHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    // ── Instructor authentication ──────────────────────────────────────────────
    socket.on(EVENTS.INSTRUCTOR_AUTH, async (payload: InstructorAuthPayload) => {
      try {
        const token = await getToken({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          req: { headers: { cookie: `next-auth.session-token=${payload.sessionToken}` } } as any,
          secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
        });
        if (!token?.sub) {
          socket.emit(EVENTS.ERROR, { code: "UNAUTHORIZED" });
          return;
        }

        const instructorId = token.sub;
        socket.data.instructorId = instructorId;
        socket.data.sessionId = payload.sessionId;

        await socket.join(roomId(payload.sessionId));
        await socket.join(instructorRoom(payload.sessionId));

        // Send current session state
        const questions = await getSessionQuestions(payload.sessionId);
        socket.emit(EVENTS.SESSION_STATE, { sessionId: payload.sessionId, questions });
        socket.emit(EVENTS.INSTRUCTOR_JOINED, { sessionId: payload.sessionId });
      } catch (err) {
        socket.emit(EVENTS.ERROR, { code: "AUTH_FAILED", message: String(err) });
      }
    });

    // ── Start session ──────────────────────────────────────────────────────────
    socket.on(EVENTS.START_SESSION, async (payload: StartSessionPayload) => {
      try {
        const instructorId = socket.data.instructorId;
        if (!instructorId) { socket.emit(EVENTS.ERROR, { code: "NOT_AUTHENTICATED" }); return; }

        const session = await startSession(payload.sessionId, instructorId);
        const questions = await getSessionQuestions(payload.sessionId);

        io.to(roomId(payload.sessionId)).emit(EVENTS.SESSION_STARTED, {
          sessionId: session.id,
          title: session.title,
          dayNumber: session.dayNumber,
          totalQuestions: questions.length,
        });
      } catch (err) {
        socket.emit(EVENTS.ERROR, { code: "START_FAILED", message: String(err) });
      }
    });

    // ── Show question ──────────────────────────────────────────────────────────
    socket.on(EVENTS.SHOW_QUESTION, async (payload: ShowQuestionPayload) => {
      try {
        const instructorId = socket.data.instructorId;
        if (!instructorId) { socket.emit(EVENTS.ERROR, { code: "NOT_AUTHENTICATED" }); return; }

        await showQuestion(payload.sessionId, payload.sessionQuestionId, instructorId);
        const question = await getLiveQuestionPayload(payload.sessionQuestionId);

        io.to(roomId(payload.sessionId)).emit(EVENTS.QUESTION_LIVE, question);
      } catch (err) {
        socket.emit(EVENTS.ERROR, { code: "SHOW_QUESTION_FAILED", message: String(err) });
      }
    });

    // ── Close question ─────────────────────────────────────────────────────────
    socket.on(EVENTS.CLOSE_QUESTION, async (payload: CloseQuestionPayload) => {
      try {
        const instructorId = socket.data.instructorId;
        if (!instructorId) { socket.emit(EVENTS.ERROR, { code: "NOT_AUTHENTICATED" }); return; }

        await closeQuestion(payload.sessionId, payload.sessionQuestionId, instructorId);
        io.to(roomId(payload.sessionId)).emit(EVENTS.QUESTION_CLOSED, {
          sessionQuestionId: payload.sessionQuestionId,
        });
      } catch (err) {
        socket.emit(EVENTS.ERROR, { code: "CLOSE_QUESTION_FAILED", message: String(err) });
      }
    });

    // ── Show results ───────────────────────────────────────────────────────────
    socket.on(EVENTS.SHOW_RESULTS, async (payload: ShowResultsPayload) => {
      try {
        const instructorId = socket.data.instructorId;
        if (!instructorId) { socket.emit(EVENTS.ERROR, { code: "NOT_AUTHENTICATED" }); return; }

        const result = await showResults(payload.sessionId, payload.sessionQuestionId, instructorId);
        io.to(roomId(payload.sessionId)).emit(EVENTS.QUESTION_RESULTS, result);
      } catch (err) {
        socket.emit(EVENTS.ERROR, { code: "SHOW_RESULTS_FAILED", message: String(err) });
      }
    });

    // ── Next question ──────────────────────────────────────────────────────────
    socket.on(EVENTS.NEXT_QUESTION, async (payload: NextQuestionPayload) => {
      try {
        const instructorId = socket.data.instructorId;
        if (!instructorId) { socket.emit(EVENTS.ERROR, { code: "NOT_AUTHENTICATED" }); return; }

        const next = await nextQuestion(payload.sessionId, instructorId);
        socket.emit(EVENTS.SESSION_STATE, { nextQuestion: next });
      } catch (err) {
        socket.emit(EVENTS.ERROR, { code: "NEXT_QUESTION_FAILED", message: String(err) });
      }
    });

    // ── Pause session ──────────────────────────────────────────────────────────
    socket.on(EVENTS.PAUSE_SESSION, async (payload: PauseSessionPayload) => {
      try {
        const instructorId = socket.data.instructorId;
        if (!instructorId) { socket.emit(EVENTS.ERROR, { code: "NOT_AUTHENTICATED" }); return; }

        await pauseSession(payload.sessionId, instructorId);
        io.to(roomId(payload.sessionId)).emit(EVENTS.SESSION_PAUSED, { sessionId: payload.sessionId });
      } catch (err) {
        socket.emit(EVENTS.ERROR, { code: "PAUSE_FAILED", message: String(err) });
      }
    });

    // ── Resume session ─────────────────────────────────────────────────────────
    socket.on(EVENTS.RESUME_SESSION, async (payload: ResumeSessionPayload) => {
      try {
        const instructorId = socket.data.instructorId;
        if (!instructorId) { socket.emit(EVENTS.ERROR, { code: "NOT_AUTHENTICATED" }); return; }

        await resumeSession(payload.sessionId, instructorId);
        io.to(roomId(payload.sessionId)).emit(EVENTS.SESSION_RESUMED, { sessionId: payload.sessionId });
      } catch (err) {
        socket.emit(EVENTS.ERROR, { code: "RESUME_FAILED", message: String(err) });
      }
    });

    // ── End session ────────────────────────────────────────────────────────────
    socket.on(EVENTS.END_SESSION, async (payload: EndSessionPayload) => {
      try {
        const instructorId = socket.data.instructorId;
        if (!instructorId) { socket.emit(EVENTS.ERROR, { code: "NOT_AUTHENTICATED" }); return; }

        await endSession(payload.sessionId, instructorId);
        const leaderboard = await getLeaderboard(payload.sessionId);

        io.to(roomId(payload.sessionId)).emit(EVENTS.SESSION_ENDED, {
          sessionId: payload.sessionId,
          leaderboard,
        });
      } catch (err) {
        socket.emit(EVENTS.ERROR, { code: "END_FAILED", message: String(err) });
      }
    });

    // ── Participant join ───────────────────────────────────────────────────────
    socket.on(EVENTS.PARTICIPANT_JOIN, async (payload: ParticipantJoinPayload) => {
      try {
        const result = await participantJoin(payload.sessionCode, payload.displayName);
        socket.data.participantId = result.participantId;
        socket.data.participantToken = result.token;
        socket.data.sessionId = result.sessionId;

        await socket.join(roomId(result.sessionId));

        // Confirm join to participant
        socket.emit(EVENTS.PARTICIPANT_JOINED, {
          participantId: result.participantId,
          token: result.token,
          sessionId: result.sessionId,
        });

        // Count for instructor
        const session = await getSessionByCode(payload.sessionCode);
        if (session) {
          const { prisma } = await import("@/lib/prisma");
          const totalParticipants = await prisma.sessionParticipant.count({
            where: { sessionId: result.sessionId },
          });
          io.to(instructorRoom(result.sessionId)).emit(EVENTS.PARTICIPANT_JOINED, {
            participantId: result.participantId,
            displayName: payload.displayName,
            joinedAt: new Date().toISOString(),
            totalParticipants,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        socket.emit(EVENTS.ERROR, { code: msg });
      }
    });

    // ── Submit answer ──────────────────────────────────────────────────────────
    socket.on(EVENTS.SUBMIT_ANSWER, async (payload: SubmitAnswerPayload) => {
      try {
        const result = await submitAnswer(
          payload.participantToken,
          payload.sessionQuestionId,
          payload.selectedOptionId,
          payload.timeTakenSeconds,
        );

        if (result.duplicate) {
          socket.emit(EVENTS.ERROR, { code: "ALREADY_ANSWERED" });
          return;
        }

        // Acknowledge to participant (no correct answer included)
        socket.emit(EVENTS.ANSWER_ACKNOWLEDGED, {
          sessionQuestionId: payload.sessionQuestionId,
          participantId: result.answer.participantId,
          isCorrect: result.answer.isCorrect,
          scoreAwarded: result.answer.scoreAwarded,
        });

        // Notify instructor of answer count
        const { prisma } = await import("@/lib/prisma");
        const answeredCount = await prisma.participantAnswer.count({
          where: { sessionQuestionId: payload.sessionQuestionId, isFinal: true },
        });
        const sessionId = socket.data.sessionId as string;
        if (sessionId) {
          const totalParticipants = await prisma.sessionParticipant.count({
            where: { sessionId },
          });
          io.to(instructorRoom(sessionId)).emit(EVENTS.ANSWER_RECEIVED, {
            sessionQuestionId: payload.sessionQuestionId,
            answeredCount,
            totalParticipants,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        socket.emit(EVENTS.ERROR, { code: msg });
      }
    });
  });
}
