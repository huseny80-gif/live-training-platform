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

  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: { id: true, instructorId: true },
  });

  if (!session || session.instructorId !== userId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const participants = await prisma.sessionParticipant.findMany({
    where: { sessionId, answersCount: { gt: 0 } },
    select: {
      displayName: true,
      totalScore: true,
      correctCount: true,
      answersCount: true,
      updatedAt: true,
    },
    orderBy: [
      { totalScore: "desc" },
      { correctCount: "desc" },
      { updatedAt: "asc" },
    ],
  });

  const ranking = participants.map((p, i) => ({
    rank: i + 1,
    name: p.displayName,
    score: Number(p.totalScore),
    correctCount: p.correctCount,
    answersCount: p.answersCount,
    completedAt: p.updatedAt.toISOString(),
  }));

  return NextResponse.json({ ranking });
  } catch (e) {
    logger.error("leaderboard: unhandled error", { requestId, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
