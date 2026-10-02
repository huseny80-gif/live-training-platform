import { after, NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { finalGenerationJobs } from "@/lib/ai/final-jobs";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  const user = await auth(); if (!user?.user?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.programId !== "string" || typeof body.documentId !== "string") return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  const { programId, documentId } = body; const instructorId = user.user.id;
  if (!await prisma.trainingDocument.count({ where: { id: documentId, programId, program: { instructorId } } })) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY" }, { status: 503 });
  const claim = await finalGenerationJobs.claim(programId, documentId, instructorId);
  if (claim.status === "PROCESSING") return NextResponse.json({ status: "PROCESSING" });
  if (claim.status !== "STARTED" || !claim.runId) return NextResponse.json({ error: claim.status }, { status: 409 });
  after(() => finalGenerationJobs.run(programId, documentId, instructorId, claim.runId!));
  return NextResponse.json({ status: "PROCESSING" }, { status: 202 });
}
