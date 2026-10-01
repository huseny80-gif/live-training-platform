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

  // Claim atomically: a failed document can retry, concurrent requests cannot run twice.
  const claimed = await prisma.trainingDocument.updateMany({
    where: { id: documentId, extractionStatus: { in: ["PENDING", "FAILED", "OCR_REQUIRED"] } },
    data: { extractionStatus: "PROCESSING", extractionNotes: null },
  });
  if (claimed.count === 0) {
    const current = await prisma.trainingDocument.findUnique({ where: { id: documentId }, select: { extractionStatus: true } });
    return NextResponse.json({ status: current?.extractionStatus, documentId }, { status: 200 });
  }

  // Register background work with Next.js/Vercel lifecycle via after().
  // after() passes the promise to Vercel's waitUntil, keeping the invocation
  // alive until the pipeline completes or maxDuration is reached.
  after(async () => {
    try {
      const extraction = await extractionService.processDocument(documentId, instructorId, undefined, { keepProcessing: true });

      if (extraction.status !== "COMPLETED") {
        await prisma.trainingDocument.update({
          where: { id: documentId },
          data: {
            extractionStatus: extraction.status === "OCR_REQUIRED" ? "OCR_REQUIRED" : "FAILED",
            extractionNotes: extraction.errorMessage ?? "Extraction returned non-COMPLETED status",
          },
        });
        return;
      }

      // Extraction done but generation hasn't run yet. Reset to PROCESSING so
      // the client keeps polling instead of refreshing before days/questions exist.
      await prisma.trainingDocument.update({
        where: { id: documentId },
        data: { extractionStatus: "PROCESSING" },
      });

      const generation = await contentGenerationService.generateForProgram(
        programId,
        documentId,
        instructorId
      );

      if (generation.status !== "COMPLETED") {
        await prisma.trainingDocument.update({
          where: { id: documentId },
          data: {
            extractionStatus: "FAILED",
            extractionNotes: generation.errorMessage ?? "Content generation failed",
          },
        });
        return;
      }

      // Both extraction and generation succeeded
      await prisma.trainingDocument.update({
        where: { id: documentId },
        data: {
          extractionStatus: "COMPLETED",
          extractionNotes: `${generation.daysGenerated} days · ${generation.questionsGenerated} questions`,
          extractedAt: new Date(),
        },
      });
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
