"use server";

import { auth } from "@/lib/auth";
import {
  createSession,
  startSession,
  pauseSession,
  resumeSession,
  endSession,
  showQuestion,
  closeQuestion,
  showResults,
  nextQuestion,
  getLeaderboard,
  getSessionByCode,
  getSessionQuestions,
} from "@/lib/session/service";
import { prisma } from "@/lib/prisma";

async function requireInstructor(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session.user.id;
}

export async function createLiveSession(
  programId: string,
  dayNumber: number,
  title?: string
) {
  const instructorId = await requireInstructor();
  return createSession(programId, instructorId, dayNumber, title);
}

export async function startLiveSession(sessionId: string) {
  const instructorId = await requireInstructor();
  return startSession(sessionId, instructorId);
}

export async function pauseLiveSession(sessionId: string) {
  const instructorId = await requireInstructor();
  return pauseSession(sessionId, instructorId);
}

export async function resumeLiveSession(sessionId: string) {
  const instructorId = await requireInstructor();
  return resumeSession(sessionId, instructorId);
}

export async function endLiveSession(sessionId: string) {
  const instructorId = await requireInstructor();
  return endSession(sessionId, instructorId);
}

export async function showLiveQuestion(sessionId: string, sessionQuestionId: string) {
  const instructorId = await requireInstructor();
  return showQuestion(sessionId, sessionQuestionId, instructorId);
}

export async function closeLiveQuestion(sessionId: string, sessionQuestionId: string) {
  const instructorId = await requireInstructor();
  return closeQuestion(sessionId, sessionQuestionId, instructorId);
}

export async function showQuestionResults(sessionId: string, sessionQuestionId: string) {
  const instructorId = await requireInstructor();
  return showResults(sessionId, sessionQuestionId, instructorId);
}

export async function getNextQuestion(sessionId: string) {
  const instructorId = await requireInstructor();
  return nextQuestion(sessionId, instructorId);
}

export async function getSessionLeaderboard(sessionId: string) {
  await requireInstructor();
  return getLeaderboard(sessionId);
}

export async function getSessionInfo(sessionCode: string) {
  return getSessionByCode(sessionCode);
}

export async function listInstructorSessions(programId?: string) {
  const instructorId = await requireInstructor();
  return prisma.liveSession.findMany({
    where: { instructorId, ...(programId ? { programId } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { participants: true, sessionQuestions: true } },
    },
  });
}

export async function getSessionDetails(sessionId: string) {
  const instructorId = await requireInstructor();
  const session = await prisma.liveSession.findFirst({
    where: { id: sessionId, instructorId },
    include: {
      sessionQuestions: {
        orderBy: { questionOrder: "asc" },
        include: { question: { select: { questionText: true, questionOrder: true } } },
      },
      _count: { select: { participants: true } },
    },
  });
  if (!session) throw new Error("SESSION_NOT_FOUND");
  return session;
}

export async function getSessionQuestionsAction(sessionId: string) {
  await requireInstructor();
  return getSessionQuestions(sessionId);
}
