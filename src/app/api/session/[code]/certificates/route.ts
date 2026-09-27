// GET /api/session/[code]/certificates
// Instructor-only. Lists all certificates issued for the session.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listSessionCertificates } from "@/lib/session/service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { code } = await params;
  const liveSession = await prisma.liveSession.findUnique({
    where: { sessionCode: code },
    select: { id: true },
  });
  if (!liveSession) {
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  }

  try {
    const certs = await listSessionCertificates(liveSession.id, session.user.id);
    return NextResponse.json({ certificates: certs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ERROR";
    const status = msg === "SESSION_NOT_FOUND_OR_UNAUTHORIZED" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
