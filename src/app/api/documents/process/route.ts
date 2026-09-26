import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractionService } from "@/lib/extraction/service";
import { contentGenerationService } from "@/lib/ai/service";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const instructorId = session.user.id;

  let body: { documentId?: string; programId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const { documentId, programId } = body;
  if (!documentId || !programId) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }

  // Verify ownership
  const doc = await prisma.trainingDocument.findFirst({
    where: { id: documentId, programId, program: { instructorId } },
    select: { id: true, extractionStatus: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Idempotency: skip if already past PENDING
  if (doc.extractionStatus !== "PENDING") {
    return NextResponse.json({ status: doc.extractionStatus, documentId }, { status: 200 });
  }

  // Mark PROCESSING synchronously so the client sees immediate progress
  await prisma.trainingDocument.update({
    where: { id: documentId },
    data: { extractionStatus: "PROCESSING", extractionNotes: null },
  });

  // Register background work with Next.js/Vercel lifecycle via after().
  // after() passes the promise to Vercel's waitUntil, keeping the invocation
  // alive until the pipeline completes or maxDuration is reached.
  after(async () => {
    try {
      const extraction = await extractionService.processDocument(documentId, instructorId);

      if (extraction.status !== "COMPLETED") {
        await prisma.trainingDocument.update({
          where: { id: documentId },
          data: {
            extractionStatus: "FAILED",
            extractionNotes: extraction.errorMessage ?? "Extraction returned non-COMPLETED status",
          },
        });
        return;
      }

      const generation = await contentGenerationService.generateForProgram(
        programId,
        documentId,
        instructorId
      );

      if (generation.status !== "COMPLETED") {
        await prisma.trainingDocument.update({
          where: { id: documentId },
          data: {
            extractionNotes: generation.errorMessage ?? "Generation returned non-COMPLETED status",
          },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown pipeline error";
      try {
        await prisma.trainingDocument.update({
          where: { id: documentId },
          data: { extractionStatus: "FAILED", extractionNotes: msg },
        });
      } catch {
        // best-effort — DB might be unavailable
      }
    }
  });

  return NextResponse.json({ status: "PROCESSING", documentId }, { status: 202 });
}
