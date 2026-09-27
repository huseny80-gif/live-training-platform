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
    where: { sessionId },
    select: {
      id: true,
      displayName: true,
      joinedAt: true,
      status: true,
      answersCount: true,
    },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json({
    participants: participants.map((p) => ({
      id: p.id,
      name: p.displayName,
      joinedAt: p.joinedAt.toISOString(),
      status: p.answersCount > 0 ? "COMPLETED" : p.status === "OFFLINE" ? "OFFLINE" : "JOINED",
    })),
  });
  } catch (e) {
    logger.error("participants: unhandled error", { requestId, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
