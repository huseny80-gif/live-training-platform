import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractionService } from "@/lib/extraction/service";
import { contentGenerationService } from "@/lib/ai/service";
import { extractionErrorToArabic } from "@/lib/extraction/errors";
import { generationErrorToArabic } from "@/lib/ai/errors";
import { verifyArabicProgramBank } from "@/lib/ai/program-acceptance";
import { requiredReadablePages } from "@/lib/extraction/coverage";
import { representativePageOrder } from "@/lib/extraction/page-sampling";

export const maxDuration = 300;

const EXTRACTION_BATCH_SIZE = 20;
async function documentCoverage(documentId: string) {
  const doc = await prisma.trainingDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      fileName: true,
      pageCount: true,
      extractionStatus: true,
      pages: {
        select: {
          pageNumber: true,
          extractionMethod: true,
          extractionStatus: true,
          extractedText: true,
        },
      },
    },
  });

  if (!doc) return null;

  const attemptedRealPageNumbers = new Set(
    doc.pages
      .filter(
        (page) =>
          page.extractionMethod !== "MOCK" &&
          (
            page.extractionMethod !== null ||
            page.extractionStatus === "FAILED" ||
            page.extractionStatus === "OCR_REQUIRED"
          )
      )
      .map((page) => page.pageNumber)
  );

  const readablePageNumbers = new Set(
    doc.pages
      .filter(
        (page) =>
          page.extractionStatus === "COMPLETED" &&
          page.extractionMethod !== null &&
          page.extractionMethod !== "MOCK" &&
          (page.extractedText?.trim().length ?? 0) > 20
      )
      .map((page) => page.pageNumber)
  );

  const totalPages = Math.max(doc.pageCount ?? 0, ...doc.pages.map((page) => page.pageNumber), 1);
  const requiredPages = requiredReadablePages(totalPages);

  return {
    ...doc,
    totalPages,
    requiredPages,
    attemptedRealPageNumbers,
    readablePageNumbers,
    completedPages: readablePageNumbers.size,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const instructorId = session.user.id;
  const { id: programId } = await params;

  let body: { documentId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body is optional
  }

  const program = await prisma.trainingProgram.findFirst({
    where: { id: programId, instructorId },
    select: {
      id: true,
      language: true,
      sessions: {
        select: { sessionCode: true, status: true },
        orderBy: { createdAt: "desc" },
      },
      documents: {
        orderBy: { createdAt: "desc" },
        select: { id: true, fileName: true, createdAt: true },
      },
    },
  });

  if (!program) {
    return NextResponse.json({ error: "PROGRAM_NOT_FOUND" }, { status: 404 });
  }

  if (program.sessions.length > 0) {
    return NextResponse.json(
      {
        stage: "BLOCKED_BY_SESSIONS",
        error:
          "لا يمكن استبدال بنك الأسئلة أثناء وجود جلسات محفوظة. احذف الجلسات من تبويب الجلسات ثم أعد المحاولة.",
        sessions: program.sessions.map((item) => ({
          code: item.sessionCode,
          status: item.status,
        })),
      },
      { status: 409 }
    );
  }

  if (program.documents.length === 0) {
    return NextResponse.json(
      { stage: "FAILED", error: "لا يوجد ملف PDF مرفوع لهذا البرنامج." },
      { status: 400 }
    );
  }

  const requestedDocumentId = body.documentId;
  const candidateIds = requestedDocumentId
    ? [requestedDocumentId]
    : program.documents.map((document) => document.id);

  let selected = null as Awaited<ReturnType<typeof documentCoverage>>;

  // Prefer the requested document. Otherwise prefer the document with the
  // highest existing real-source coverage, falling back to the newest upload.
  if (requestedDocumentId) {
    const owned = program.documents.some((document) => document.id === requestedDocumentId);
    if (!owned) {
      return NextResponse.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });
    }
    selected = await documentCoverage(requestedDocumentId);
  } else {
    const coverage = (
      await Promise.all(candidateIds.map((documentId) => documentCoverage(documentId)))
    ).filter((value): value is NonNullable<typeof value> => Boolean(value));

    coverage.sort((a, b) => {
      if (b.completedPages !== a.completedPages) return b.completedPages - a.completedPages;
      return 0;
    });
    selected = coverage[0] ?? null;
  }

  if (!selected) {
    return NextResponse.json(
      { stage: "FAILED", error: "تعذر العثور على المادة التدريبية." },
      { status: 404 }
    );
  }

  // Resume real extraction only for pages that do not already have usable
  // real source text. Each request processes a bounded chunk, so 147-page
  // PDFs survive serverless execution limits and preserve progress.
  if (selected.completedPages < selected.requiredPages) {
    const allPageNumbers = representativePageOrder(selected.totalPages);
    const unattemptedPages = allPageNumbers.filter(
      (pageNumber) => !selected!.attemptedRealPageNumbers.has(pageNumber)
    );
    const attemptedButUnreadable = allPageNumbers.filter(
      (pageNumber) =>
        selected!.attemptedRealPageNumbers.has(pageNumber) &&
        !selected!.readablePageNumbers.has(pageNumber)
    );
    const missingPages = [...unattemptedPages, ...attemptedButUnreadable].slice(
      0,
      EXTRACTION_BATCH_SIZE
    );

    if (missingPages.length === 0) {
      return NextResponse.json(
        {
          stage: "FAILED",
          error: "لا توجد صفحات إضافية قابلة للمعالجة رغم أن تغطية المصدر غير مكتملة.",
        },
        { status: 422 }
      );
    }

    await prisma.trainingDocument.update({
      where: { id: selected.id },
      data: {
        extractionStatus: "PROCESSING",
        extractionNotes: `EXTRACTING_REAL_SOURCE ${selected.completedPages}/${selected.requiredPages}`,
      },
    });

    const extraction = await extractionService.processDocument(
      selected.id,
      instructorId,
      missingPages
    );

    if (extraction.status === "FAILED") {
      const message = extractionErrorToArabic(extraction.errorMessage);
      await prisma.trainingDocument.update({
        where: { id: selected.id },
        data: { extractionStatus: "FAILED", extractionNotes: extraction.errorMessage ?? message },
      });
      return NextResponse.json(
        {
          stage: "FAILED",
          error: message,
          rawError: extraction.errorMessage,
          documentId: selected.id,
        },
        { status: 422 }
      );
    }

    const refreshed = await documentCoverage(selected.id);
    if (!refreshed) {
      return NextResponse.json({ stage: "FAILED", error: "تعذر تحديث حالة المادة." }, { status: 500 });
    }

    if (refreshed.completedPages < refreshed.requiredPages) {
      await prisma.trainingDocument.update({
        where: { id: selected.id },
        data: {
          extractionStatus: "PROCESSING",
          extractionNotes: `EXTRACTING_REAL_SOURCE ${refreshed.completedPages}/${refreshed.requiredPages}`,
        },
      });

      return NextResponse.json({
        stage: "EXTRACTING",
        documentId: selected.id,
        fileName: selected.fileName,
        completedPages: refreshed.completedPages,
        requiredPages: refreshed.requiredPages,
        totalPages: refreshed.totalPages,
      });
    }

    selected = refreshed;
  }

  await prisma.trainingDocument.update({
    where: { id: selected.id },
    data: {
      extractionStatus: "PROCESSING",
      extractionNotes: "GENERATING_ARABIC_CONTENT",
    },
  });

  const generation = await contentGenerationService.generateForProgram(
    programId,
    selected.id,
    instructorId,
    "AR"
  );

  if (generation.status !== "COMPLETED") {
    const rawError = generation.errorMessage ?? "GENERATION_FAILED";
    const error = generationErrorToArabic(rawError);
    await prisma.trainingDocument.update({
      where: { id: selected.id },
      data: {
        extractionStatus: "COMPLETED",
        extractionNotes:
          `REAL_SOURCE_READY · GENERATION_FAILED · ${rawError}`,
        extractedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        stage: "FAILED",
        error,
        rawError,
        documentId: selected.id,
      },
      { status: 422 }
    );
  }

  const acceptance = await verifyArabicProgramBank(programId);

  if (!acceptance.ok) {
    const rawError = `PROGRAM_ACCEPTANCE_FAILED — ${acceptance.reason}`;
    await prisma.trainingDocument.update({
      where: { id: selected.id },
      data: {
        extractionStatus: "COMPLETED",
        extractionNotes:
          `REAL_SOURCE_READY · ACCEPTANCE_FAILED · ${rawError}`,
        extractedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        stage: "FAILED",
        error:
          `فشل تحقق القبول النهائي بعد الحفظ: ${acceptance.days} أيام، ${acceptance.questions} سؤالًا. لم تُعتمد العملية كناجحة.`,
        rawError,
        documentId: selected.id,
        daysGenerated: acceptance.days,
        questionsGenerated: acceptance.questions,
        questionsPerDay: acceptance.questionsPerDay,
      },
      { status: 422 }
    );
  }

  await prisma.$transaction([
    prisma.trainingProgram.update({
      where: { id: programId },
      data: { language: "AR" },
    }),
    prisma.trainingDocument.update({
      where: { id: selected.id },
      data: {
        extractionStatus: "COMPLETED",
        extractionNotes:
          `SOURCE_ACCEPTED · 10 days · 50 questions · 5/day · real source ${selected.completedPages}/${selected.totalPages}`,
        extractedAt: new Date(),
      },
    }),
  ]);

  revalidatePath(`/programs/${programId}`);
  revalidatePath(`/programs/${programId}/manage`);
  revalidatePath(`/programs/${programId}/final-questions`);
  revalidatePath("/dashboard");

  return NextResponse.json({
    stage: "COMPLETED",
    documentId: selected.id,
    fileName: selected.fileName,
    daysGenerated: acceptance.days,
    questionsGenerated: acceptance.questions,
    questionsPerDay: acceptance.questionsPerDay,
    completedPages: selected.completedPages,
    requiredPages: selected.requiredPages,
    totalPages: selected.totalPages,
  });
}
