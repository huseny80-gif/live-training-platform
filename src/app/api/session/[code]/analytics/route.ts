import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const requestId = req.headers.get("x-request-id") ?? undefined;
  try {
  const authSession = await auth();
  const userId = authSession?.user?.id ?? null;
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { code: sessionId } = await params;

  // Q1: session auth + participant count
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

  // Q2: participants who answered at least one question
  const completedCount = await prisma.sessionParticipant.count({
    where: { sessionId, answersCount: { gt: 0 } },
  });

  // Q3: score aggregates from participants who completed
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

  // Q4: all session questions (ordered)
  const sessionQuestions = await prisma.sessionQuestion.findMany({
    where: { sessionId },
    select: { id: true, questionId: true, questionOrder: true },
    orderBy: { questionOrder: "asc" },
  });

  // Q5: single grouped query replacing 2N per-question COUNT queries.
  // Groups by (sessionQuestionId, isCorrect) for isFinal=true rows only.
  // Uses participant_answers_analytics_idx covering index.
  const breakdown = await prisma.participantAnswer.groupBy({
    by: ["sessionQuestionId", "isCorrect"],
    where: { sessionId, isFinal: true },
    _count: { id: true },
  });

  // Build lookup: sqId → { correct, wrong }
  const sqMap = new Map<string, { correct: number; wrong: number }>();
  for (const row of breakdown) {
    const entry = sqMap.get(row.sessionQuestionId) ?? { correct: 0, wrong: 0 };
    if (row.isCorrect) {
      entry.correct = row._count.id;
    } else {
      entry.wrong = row._count.id;
    }
    sqMap.set(row.sessionQuestionId, entry);
  }

  // Derive session-level totals from the grouped breakdown (no extra queries)
  let totalAnswers = 0;
  let correctAnswers = 0;
  for (const { correct, wrong } of sqMap.values()) {
    totalAnswers += correct + wrong;
    correctAnswers += correct;
  }

  const correctRate =
    totalAnswers > 0
      ? Math.round((correctAnswers / totalAnswers) * 100)
      : 0;
  const participationRate =
    participantCount > 0
      ? Math.round((completedCount / participantCount) * 100)
      : 0;

  // Build per-question breakdown (no DB queries — uses sqMap)
  const questions = sessionQuestions.map((sq) => {
    const counts = sqMap.get(sq.id) ?? { correct: 0, wrong: 0 };
    const total = counts.correct + counts.wrong;
    return {
      questionId: sq.questionId,
      questionOrder: sq.questionOrder,
      correct: counts.correct,
      wrong: counts.wrong,
      difficultyRate: total > 0 ? Math.round((counts.wrong / total) * 100) : 0,
    };
  });

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
  } catch (e) {
    logger.error("analytics: unhandled error", { requestId, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
