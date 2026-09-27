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
      status: true,
      updatedAt: true,
      _count: { select: { participants: true } },
    },
  });

  if (!session || session.instructorId !== userId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const completedCount = await prisma.sessionParticipant.count({
    where: { sessionId, answersCount: { gt: 0 } },
  });

  return NextResponse.json({
    sessionId: session.id,
    status: session.status,
    participantCount: session._count.participants,
    completedCount,
    lastUpdated: session.updatedAt.toISOString(),
  });
}
