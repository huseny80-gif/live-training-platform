import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generationJobs } from "@/lib/ai/jobs";

export const maxDuration = 300;
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  let body: { documentId?: string; programId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  const { documentId, programId } = body;
  if (typeof documentId !== "string" || typeof programId !== "string" || !documentId || !programId) return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  const instructorId = session.user.id;
  const owned = await prisma.trainingDocument.count({ where: { id: documentId, programId, program: { instructorId } } });
  if (!owned) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY" }, { status: 503 });
  const claim = await generationJobs.claim(documentId, programId, instructorId);
  if (claim.status === "PROCESSING") {
    const current = await prisma.trainingDocument.findUnique({ where: { id: documentId }, select: { extractionNotes: true } });
    return NextResponse.json({ status: "PROCESSING", documentId, notes: current?.extractionNotes });
  }
  if (claim.status !== "STARTED" || !claim.runId) return NextResponse.json({ error: claim.status }, { status: claim.status === "NOT_FOUND" ? 404 : 409 });
  after(async () => { await generationJobs.run(documentId, programId, instructorId, claim.runId!); });
  return NextResponse.json({ status: "PROCESSING", documentId, notes: `GENERATION_PROCESSING:${claim.runId}:0` }, { status: 202 });
}
