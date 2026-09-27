import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const authSession = await auth();
  const userId = authSession?.user?.id ?? null;
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { code: sessionId } = await params;

  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      instructorId: true,
      _count: { select: { participants: true } },
    },
  });

  if (!session || session.instructorId !== userId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const participantCount = session._count.participants;

  // Participants who answered at least one question
  const completedCount = await prisma.sessionParticipant.count({
    where: { sessionId, answersCount: { gt: 0 } },
  });

  // Score aggregates from participants who completed
  const scoreAgg = await prisma.sessionParticipant.aggregate({
    where: { sessionId, answersCount: { gt: 0 } },
    _avg: { totalScore: true },
    _max: { totalScore: true },
  });

  const averageScore = scoreAgg._avg.totalScore
    ? Number(scoreAgg._avg.totalScore)
    : 0;
  const highestScore = scoreAgg._max.totalScore
    ? Number(scoreAgg._max.totalScore)
    : 0;

  // Answer totals (final answers only)
  const answerAgg = await prisma.participantAnswer.aggregate({
    where: { sessionId, isFinal: true },
    _count: { id: true },
  });
  const correctAgg = await prisma.participantAnswer.aggregate({
    where: { sessionId, isFinal: true, isCorrect: true },
    _count: { id: true },
  });

  const totalAnswers = answerAgg._count.id;
  const correctAnswers = correctAgg._count.id;
  const correctRate =
    totalAnswers > 0
      ? Math.round((correctAnswers / totalAnswers) * 100)
      : 0;
  const participationRate =
    participantCount > 0
      ? Math.round((completedCount / participantCount) * 100)
      : 0;

  // Per-question breakdown
  const sessionQuestions = await prisma.sessionQuestion.findMany({
    where: { sessionId },
    select: { id: true, questionId: true, questionOrder: true },
    orderBy: { questionOrder: "asc" },
  });

  const questions = await Promise.all(
    sessionQuestions.map(async (sq) => {
      const [correctQ, wrongQ] = await Promise.all([
        prisma.participantAnswer.count({
          where: { sessionQuestionId: sq.id, isFinal: true, isCorrect: true },
        }),
        prisma.participantAnswer.count({
          where: { sessionQuestionId: sq.id, isFinal: true, isCorrect: false },
        }),
      ]);
      const total = correctQ + wrongQ;
      return {
        questionId: sq.questionId,
        questionOrder: sq.questionOrder,
        correct: correctQ,
        wrong: wrongQ,
        difficultyRate: total > 0 ? Math.round((wrongQ / total) * 100) : 0,
      };
    })
  );

  return NextResponse.json({
    participantCount,
    completedCount,
    participationRate,
    averageScore: Math.round(averageScore * 10) / 10,
    highestScore: Math.round(highestScore * 10) / 10,
    correctAnswers,
    totalAnswers,
    correctRate,
    questions,
  });
}
