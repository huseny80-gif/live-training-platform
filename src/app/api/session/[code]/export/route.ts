import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSessionExcel } from "@/lib/excel/export";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const authSession = await auth();
  const userId = authSession?.user?.id ?? null;
  const { code: sessionId } = await params;

  console.log({ exportParam: sessionId, userId, authed: !!userId });

  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // Two-step: find by id first, then verify ownership
  let found: { id: string; instructorId: string } | null = null;
  try {
    found = await prisma.liveSession.findUnique({ where: { id: sessionId }, select: { id: true, instructorId: true } });
  } catch (e) {
    console.error({ exportDbError: String(e), sessionId });
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }
  console.log({ sessionFound: !!found, dbInstructorId: found?.instructorId, requestUserId: userId, ownershipMatch: found?.instructorId === userId });

  if (!found || found.instructorId !== userId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const liveSession = await prisma.liveSession.findUnique({
    where: { id: sessionId },
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

  // Fetch instructor name
  const instructor = await prisma.instructor.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  const participants = liveSession.participants.map((p) => ({
    rank: p.rank,
    displayName: p.displayName,
    joinedAt: p.joinedAt,
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

  const totalParticipants = sr?.totalParticipants ?? participants.length;

  const summary = {
    title: liveSession.title,
    sessionCode: liveSession.sessionCode,
    instructorName: instructor?.name ?? "",
    date: (liveSession.startedAt ?? liveSession.createdAt).toLocaleDateString("ar-SA"),
    participationRate: totalQ > 0 && totalParticipants > 0
      ? Math.round((participants.filter((p) => p.answersCount > 0).length / totalParticipants) * 100)
      : 0,
    totalParticipants,
    totalQuestions: sr?.totalQuestions ?? totalQ,
    averageScore: sr ? Number(sr.averageScore) : 0,
    highestScore: sr ? Number(sr.highestScore) : 0,
    correctRate: sr ? Math.round(Number(sr.correctRate) * 100) : 0,
  };

  const buffer = buildSessionExcel(summary, participants, questions);

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="Digital_Leadership_Test_Results.xlsx"; filename*=UTF-8\'\'%D9%86%D8%AA%D8%A7%D8%A6%D8%AC_%D8%A7%D9%84%D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1.xlsx',
    },
  });
}
