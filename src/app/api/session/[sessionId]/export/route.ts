import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSessionExcel } from "@/lib/excel/export";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { sessionId } = await params;

  const liveSession = await prisma.liveSession.findFirst({
    where: { id: sessionId, instructorId: session.user.id },
    include: {
      sessionResult: true,
      participants: {
        orderBy: [{ totalScore: "desc" }, { correctCount: "desc" }],
      },
      sessionQuestions: {
        orderBy: { questionOrder: "asc" },
        include: {
          question: { select: { questionText: true } },
          answers: {
            where: { isFinal: true },
            select: { isCorrect: true },
          },
        },
      },
    },
  });

  if (!liveSession) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const totalQ = liveSession.sessionQuestions.length;
  const sr = liveSession.sessionResult;

  const participants = liveSession.participants.map((p) => ({
    rank: p.rank,
    displayName: p.displayName,
    totalScore: Number(p.totalScore),
    correctCount: p.correctCount,
    wrongCount: p.answersCount - p.correctCount,
    answersCount: p.answersCount,
    percentage: totalQ > 0 ? Math.round((p.correctCount / totalQ) * 100) : 0,
  }));

  const questions = liveSession.sessionQuestions.map((sq) => ({
    questionOrder: sq.questionOrder,
    questionText: sq.question.questionText,
    totalAnswers: sq.answers.length,
    correctAnswers: sq.answers.filter((a) => a.isCorrect).length,
    accuracy:
      sq.answers.length > 0
        ? Math.round(
            (sq.answers.filter((a) => a.isCorrect).length / sq.answers.length) * 100
          )
        : 0,
  }));

  const summary = {
    title: liveSession.title,
    sessionCode: liveSession.sessionCode,
    totalParticipants: sr?.totalParticipants ?? participants.length,
    totalQuestions: sr?.totalQuestions ?? totalQ,
    averageScore: sr ? Number(sr.averageScore) : 0,
    highestScore: sr ? Number(sr.highestScore) : 0,
    correctRate: sr ? Number(sr.correctRate) : 0,
  };

  const buffer = buildSessionExcel(summary, participants, questions);

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="session-${sessionId}.xlsx"`,
    },
  });
}
