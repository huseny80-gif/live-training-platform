import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recoverGenerationJobs } from "@/lib/ai/jobs";
import { generationState } from "@/lib/ai/generation-state";
import { recoverStaleDocument } from "@/lib/extraction/recovery";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const instructorId = session.user.id;

  const documentId = req.nextUrl.searchParams.get("documentId");
  if (!documentId) {
    return NextResponse.json({ error: "MISSING_DOCUMENT_ID" }, { status: 400 });
  }

  await recoverStaleDocument(documentId, instructorId);
  await recoverGenerationJobs(instructorId, { documentId });

  const doc = await prisma.trainingDocument.findFirst({
    where: { id: documentId, program: { instructorId } },
    select: {
      id: true,
      extractionStatus: true,
      extractionNotes: true,
      pageCount: true,
    },
  });
  if (!doc) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ...doc, generation: generationState(doc.extractionNotes) });
}
