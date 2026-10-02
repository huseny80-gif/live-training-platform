import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractionService } from "@/lib/extraction/service";
import { extractionErrorToArabic } from "@/lib/extraction/errors";
import { requiredReadablePages } from "@/lib/extraction/coverage";
import { representativePageOrder } from "@/lib/extraction/page-sampling";

export const maxDuration = 300;

const EXTRACTION_BATCH_SIZE = 20;

async function getCoverage(documentId: string) {
  const doc = await prisma.trainingDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      programId: true,
      fileName: true,
      pageCount: true,
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

  const totalPages = Math.max(
    doc.pageCount ?? 0,
    ...doc.pages.map((page) => page.pageNumber),
    1,
  );
  const requiredPages = requiredReadablePages(totalPages);

  const readablePageNumbers = new Set(
    doc.pages
      .filter(
        (page) =>
          page.extractionStatus === "COMPLETED" &&
          page.extractionMethod !== null &&
          page.extractionMethod !== "MOCK" &&
          (page.extractedText?.trim().length ?? 0) > 20,
      )
      .map((page) => page.pageNumber),
  );

  const attemptedPageNumbers = new Set(
    doc.pages
      .filter(
        (page) =>
          page.extractionMethod !== "MOCK" &&
          (page.extractionMethod !== null ||
            page.extractionStatus === "FAILED" ||
            page.extractionStatus === "OCR_REQUIRED"),
      )
      .map((page) => page.pageNumber),
  );

  return {
    ...doc,
    totalPages,
    requiredPages,
    completedPages: readablePageNumbers.size,
    readablePageNumbers,
    attemptedPageNumbers,
  };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ stage: "FAILED", error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { documentId } = await params;
  const owned = await prisma.trainingDocument.findFirst({
    where: { id: documentId, program: { instructorId: session.user.id } },
    select: { id: true },
  });

  if (!owned) {
    return NextResponse.json(
      { stage: "FAILED", error: "المادة التدريبية غير موجودة أو لا تملك صلاحية الوصول إليها." },
      { status: 404 },
    );
  }

  let coverage = await getCoverage(documentId);
  if (!coverage) {
    return NextResponse.json({ stage: "FAILED", error: "تعذر قراءة حالة المادة." }, { status: 404 });
  }

  if (coverage.completedPages >= coverage.requiredPages) {
    await prisma.trainingDocument.update({
      where: { id: documentId },
      data: {
        extractionStatus: "COMPLETED",
        extractionNotes:
          `REAL_SOURCE_READY ${coverage.completedPages}/${coverage.totalPages}`,
        extractedAt: new Date(),
      },
    });

    return NextResponse.json({
      stage: "READY",
      documentId,
      fileName: coverage.fileName,
      completedPages: coverage.completedPages,
      requiredPages: coverage.requiredPages,
      totalPages: coverage.totalPages,
    });
  }

  const pageOrder = representativePageOrder(coverage.totalPages);
  const unattempted = pageOrder.filter(
    (pageNumber) => !coverage!.attemptedPageNumbers.has(pageNumber),
  );
  const retryUnreadable = pageOrder.filter(
    (pageNumber) =>
      coverage!.attemptedPageNumbers.has(pageNumber) &&
      !coverage!.readablePageNumbers.has(pageNumber),
  );
  const targetPages = [...unattempted, ...retryUnreadable].slice(
    0,
    EXTRACTION_BATCH_SIZE,
  );

  if (targetPages.length === 0) {
    return NextResponse.json(
      {
        stage: "FAILED",
        documentId,
        completedPages: coverage.completedPages,
        requiredPages: coverage.requiredPages,
        totalPages: coverage.totalPages,
        error: "لا توجد صفحات إضافية قابلة للمعالجة، وما زالت تغطية المصدر الحقيقي غير كافية.",
      },
      { status: 422 },
    );
  }

  await prisma.trainingDocument.update({
    where: { id: documentId },
    data: {
      extractionStatus: "PROCESSING",
      extractionNotes:
        `PREPARING_REAL_SOURCE ${coverage.completedPages}/${coverage.requiredPages}`,
    },
  });

  const extraction = await extractionService.processDocument(
    documentId,
    session.user.id,
    targetPages,
  );

  coverage = await getCoverage(documentId);
  if (!coverage) {
    return NextResponse.json({ stage: "FAILED", error: "تعذر تحديث حالة المادة." }, { status: 500 });
  }

  if (coverage.completedPages >= coverage.requiredPages) {
    await prisma.trainingDocument.update({
      where: { id: documentId },
      data: {
        extractionStatus: "COMPLETED",
        extractionNotes:
          `REAL_SOURCE_READY ${coverage.completedPages}/${coverage.totalPages}`,
        extractedAt: new Date(),
      },
    });

    return NextResponse.json({
      stage: "READY",
      documentId,
      fileName: coverage.fileName,
      completedPages: coverage.completedPages,
      requiredPages: coverage.requiredPages,
      totalPages: coverage.totalPages,
    });
  }

  if (extraction.status === "FAILED") {
    return NextResponse.json(
      {
        stage: "FAILED",
        documentId,
        completedPages: coverage.completedPages,
        requiredPages: coverage.requiredPages,
        totalPages: coverage.totalPages,
        error: extractionErrorToArabic(extraction.errorMessage),
        rawError: extraction.errorMessage,
      },
      { status: 422 },
    );
  }

  // Partial real extraction is progress, not a document failure.
  await prisma.trainingDocument.update({
    where: { id: documentId },
    data: {
      extractionStatus: "PROCESSING",
      extractionNotes:
        `PREPARING_REAL_SOURCE ${coverage.completedPages}/${coverage.requiredPages}`,
    },
  });

  return NextResponse.json({
    stage: "EXTRACTING",
    documentId,
    fileName: coverage.fileName,
    completedPages: coverage.completedPages,
    requiredPages: coverage.requiredPages,
    totalPages: coverage.totalPages,
  });
}
