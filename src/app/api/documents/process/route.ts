import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recoverStaleProgramDocuments } from "@/lib/extraction/recovery";
import { extractionService } from "@/lib/extraction/service";

export const maxDuration = 300;

// Log only fixed codes; provider responses can contain sensitive request data.
function failureCode(message: string): string {
  const known = message.match(/\b(ANTHROPIC_API_KEY|NO_EXTRACTED_PAGES|AI_INCOMPLETE_CONTENT|AI_INVALID_CONTENT|AI_LANGUAGE_MISMATCH_AR|OCR_REQUIRED|INVALID_PDF|PDF_PASSWORD_REQUIRED|CONTENT_ALREADY_EXISTS|BLOB_READ_FAILED)\b/);
  if (known) return known[1];
  if (/timeout|timed out|aborted/i.test(message)) return "PROCESSING_TIMEOUT";
  if (/401|403|authentication/i.test(message)) return "PROVIDER_AUTH_FAILED";
  if (/429|quota|credit|billing/i.test(message)) return "PROVIDER_LIMIT";
  return "PROCESSING_FAILED";
}

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

  await recoverStaleProgramDocuments(programId, instructorId);

  // Extraction is independent per file and never starts question generation.
  const claimed = await prisma.trainingDocument.updateMany({
    where: { id: documentId, programId, program: { instructorId }, extractionStatus: { in: ["PENDING", "FAILED", "OCR_REQUIRED"] } },
    data: { extractionStatus: "PROCESSING", extractionNotes: "PROCESSING_EXTRACTING" },
  });
  if (claimed.count === 0) {
    const current = await prisma.trainingDocument.findUnique({ where: { id: documentId }, select: { extractionStatus: true } });
    return NextResponse.json({ status: current?.extractionStatus, documentId }, { status: 200 });
  }

  // Register background work with Next.js/Vercel lifecycle via after().
  // after() passes the promise to Vercel's waitUntil, keeping the invocation
  // alive until the pipeline completes or maxDuration is reached.
  after(async () => {
    const stage = "extraction";
    try {
      console.info("[documents] processing", { documentId, stage });
      const extraction = await extractionService.processDocument(documentId, instructorId, undefined, { keepProcessing: true });

      if (extraction.status !== "COMPLETED") {
        console.error("[documents] failed", { documentId, stage, code: failureCode(extraction.errorMessage ?? "") });
        await prisma.trainingDocument.update({
          where: { id: documentId },
          data: {
            extractionStatus: extraction.status === "OCR_REQUIRED" ? "OCR_REQUIRED" : "FAILED",
            extractionNotes: extraction.errorMessage ?? "Extraction returned non-COMPLETED status",
          },
        });
        return;
      }

      // Acceptance finishes after real text extraction; AI is a separate later step.
      await prisma.trainingDocument.update({
        where: { id: documentId },
        data: {
          extractionStatus: "COMPLETED",
          extractionNotes: `EXTRACTION_COMPLETED: ${extraction.completedPages}/${extraction.totalPages}`,
          extractedAt: new Date(),
        },
      });
      console.info("[documents] accepted", { documentId, pagesExtracted: extraction.completedPages, totalPages: extraction.totalPages });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown pipeline error";
      console.error("[documents] failed", { documentId, stage, code: failureCode(msg) });
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
