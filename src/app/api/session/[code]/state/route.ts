// GET /api/session/[code]/state
// Returns the current session state for a participant — safe, no correct answers.
// Reads guest_token cookie to determine if the participant has already answered.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyGuestToken } from "@/lib/session/guest-token";
import { getLiveQuestionPayload } from "@/lib/session/service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const session = await prisma.liveSession.findUnique({
    where: { sessionCode: code.toUpperCase() },
    select: {
      id: true,
      status: true,
      title: true,
      dayNumber: true,
      currentQuestionId: true,
      _count: { select: { participants: true, sessionQuestions: true } },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  }

  // Read participant identity from cookie (optional — guest may not have joined yet)
  let participantId: string | null = null;
  const cookieStore = await cookies();
  const rawToken = cookieStore.get("guest_token")?.value;
  if (rawToken) {
    try {
      const payload = verifyGuestToken(rawToken);
      if (payload.sessionId === session.id) {
        participantId = payload.participantId;
      }
    } catch {
      // invalid/expired token — treat as anonymous
    }
  }

  const totalQuestions = session._count.sessionQuestions;

  // No current live question — return session status only
  if (!session.currentQuestionId || session.status !== "ACTIVE") {
    return NextResponse.json({
      sessionStatus: session.status,
      sessionTitle: session.title,
      dayNumber: session.dayNumber,
      participantCount: session._count.participants,
      totalQuestions,
      currentQuestionIndex: null,
      currentQuestion: null,
      hasAnswered: false,
    });
  }

  // Fetch current SessionQuestion
  const sq = await prisma.sessionQuestion.findUnique({
    where: { id: session.currentQuestionId },
    select: { status: true, questionOrder: true },
  });

  if (!sq || sq.status === "DRAFT" || sq.status === "READY") {
    return NextResponse.json({
      sessionStatus: session.status,
      sessionTitle: session.title,
      dayNumber: session.dayNumber,
      participantCount: session._count.participants,
      totalQuestions,
      currentQuestionIndex: sq?.questionOrder ?? null,
      currentQuestion: null,
      hasAnswered: false,
    });
  }

  // Question is LIVE, CLOSED, or RESULTS — build payload (no correct answer)
  let questionPayload = null;
  let hasAnswered = false;
  let myAnswer: string | null = null;
  let isCorrect: boolean | null = null;
  let scoreAwarded: number | null = null; // converted from Decimal below

  if (sq.status === "LIVE" || sq.status === "CLOSED" || sq.status === "RESULTS") {
    questionPayload = await getLiveQuestionPayload(session.currentQuestionId);
    questionPayload = { ...questionPayload, questionStatus: sq.status };

    if (participantId) {
      const answer = await prisma.participantAnswer.findFirst({
        where: {
          sessionQuestionId: session.currentQuestionId,
          participantId,
          isFinal: true,
        },
        select: { selectedOptionId: true, isCorrect: true, scoreAwarded: true },
      });
      if (answer) {
        hasAnswered = true;
        myAnswer = answer.selectedOptionId;
        isCorrect = answer.isCorrect;
        scoreAwarded = Number(answer.scoreAwarded);
      }
    }
  }

  return NextResponse.json({
    sessionStatus: session.status,
    sessionTitle: session.title,
    dayNumber: session.dayNumber,
    participantCount: session._count.participants,
    totalQuestions,
    currentQuestionIndex: sq.questionOrder,
    currentQuestion: questionPayload,
    hasAnswered,
    myAnswer,
    isCorrect,
    scoreAwarded,
  });
}
