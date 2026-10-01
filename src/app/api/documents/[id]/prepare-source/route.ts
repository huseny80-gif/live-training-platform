import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractionService } from "@/lib/extraction/service";
import { extractionErrorToArabic } from "@/lib/extraction/errors";
import { requiredReadablePages } from "@/lib/extraction/coverage";

export const maxDuration = 300;

const EXTRACTION_BATCH_SIZE = 20;
async function sourceReadiness(documentId: string, instructorId: string) {
  const doc = await prisma.trainingDocument.findFirst({
    where: {
      id: documentId,
      program: { instructorId },
    },
    select: {
      id: true,
      programId: true,
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

  const realReadablePageNumbers = new Set(
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

  const highestStoredPage = doc.pages.reduce(
    (max, page) => Math.max(max, page.pageNumber),
    0
  );
  const totalPages = Math.max(doc.pageCount ?? 0, highestStoredPage, 1);
  const requiredPages = requiredReadablePages(totalPages);

  return {
    ...doc,
    totalPages,
    requiredPages,
    completedPages: realReadablePageNumbers.size,
    sourceReady: realReadablePageNumbers.size >= requiredPages,
    realReadablePageNumbers,
    attemptedRealPageNumbers,
  };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ stage: "FAILED", error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id: documentId } = await params;
  const instructorId = session.user.id;

  let readiness = await sourceReadiness(documentId, instructorId);
  if (!readiness) {
    return NextResponse.json(
      { stage: "FAILED", error: "المادة التدريبية غير موجودة." },
      { status: 404 }
    );
  }

  if (readiness.sourceReady) {
    await prisma.trainingDocument.update({
      where: { id: documentId },
      data: {
        extractionStatus: "COMPLETED",
        extractionNotes:
          `SOURCE_READY ${readiness.completedPages}/${readiness.totalPages}`,
        extractedAt: new Date(),
      },
    });

    return NextResponse.json({
      stage: "READY",
      documentId,
      programId: readiness.programId,
      fileName: readiness.fileName,
      completedPages: readiness.completedPages,
      requiredPages: readiness.requiredPages,
      totalPages: readiness.totalPages,
    });
  }

  const allPageNumbers = Array.from(
    { length: readiness.totalPages },
    (_, index) => index + 1
  );

  const unattemptedPages = allPageNumbers.filter(
    (pageNumber) => !readiness!.attemptedRealPageNumbers.has(pageNumber)
  );
  const attemptedButUnreadable = allPageNumbers.filter(
    (pageNumber) =>
      readiness!.attemptedRealPageNumbers.has(pageNumber) &&
      !readiness!.realReadablePageNumbers.has(pageNumber)
  );

  const nextBatch = [...unattemptedPages, ...attemptedButUnreadable].slice(
    0,
    EXTRACTION_BATCH_SIZE
  );

  if (nextBatch.length === 0) {
    const error =
      `لم يكتمل اعتماد المصدر: تم استخراج ${readiness.completedPages} صفحة حقيقية من أصل ${readiness.requiredPages} مطلوبة.`;
    await prisma.trainingDocument.update({
      where: { id: documentId },
      data: {
        extractionStatus: "OCR_REQUIRED",
        extractionNotes: `SOURCE_NOT_READY ${readiness.completedPages}/${readiness.requiredPages}`,
      },
    });
    return NextResponse.json(
      {
        stage: "FAILED",
        error,
        documentId,
        completedPages: readiness.completedPages,
        requiredPages: readiness.requiredPages,
        totalPages: readiness.totalPages,
      },
      { status: 422 }
    );
  }

  await prisma.trainingDocument.update({
    where: { id: documentId },
    data: {
      extractionStatus: "PROCESSING",
      extractionNotes:
        `PREPARING_SOURCE ${readiness.completedPages}/${readiness.requiredPages}`,
    },
  });

  const extraction = await extractionService.processDocument(
    documentId,
    instructorId,
    nextBatch
  );

  if (extraction.status === "FAILED") {
    const error = extractionErrorToArabic(extraction.errorMessage);
    await prisma.trainingDocument.update({
      where: { id: documentId },
      data: {
        extractionStatus: "FAILED",
        extractionNotes: extraction.errorMessage ?? "SOURCE_PREPARATION_FAILED",
      },
    });
    return NextResponse.json(
      {
        stage: "FAILED",
        error,
        rawError: extraction.errorMessage,
        documentId,
      },
      { status: 422 }
    );
  }

  readiness = await sourceReadiness(documentId, instructorId);
  if (!readiness) {
    return NextResponse.json(
      { stage: "FAILED", error: "تعذر قراءة حالة المادة بعد التحليل." },
      { status: 500 }
    );
  }

  if (readiness.sourceReady) {
    await prisma.trainingDocument.update({
      where: { id: documentId },
      data: {
        extractionStatus: "COMPLETED",
        extractionNotes:
          `SOURCE_READY ${readiness.completedPages}/${readiness.totalPages}`,
        extractedAt: new Date(),
      },
    });

    return NextResponse.json({
      stage: "READY",
      documentId,
      programId: readiness.programId,
      fileName: readiness.fileName,
      completedPages: readiness.completedPages,
      requiredPages: readiness.requiredPages,
      totalPages: readiness.totalPages,
    });
  }

  await prisma.trainingDocument.update({
    where: { id: documentId },
    data: {
      extractionStatus: "PROCESSING",
      extractionNotes:
        `PREPARING_SOURCE ${readiness.completedPages}/${readiness.requiredPages}`,
    },
  });

  return NextResponse.json({
    stage: "EXTRACTING",
    documentId,
    programId: readiness.programId,
    fileName: readiness.fileName,
    completedPages: readiness.completedPages,
    requiredPages: readiness.requiredPages,
    totalPages: readiness.totalPages,
  });
}
