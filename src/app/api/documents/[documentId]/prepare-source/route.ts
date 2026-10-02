import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractionService } from "@/lib/extraction/service";
import { extractionErrorToArabic } from "@/lib/extraction/errors";
import { requiredReadablePages } from "@/lib/extraction/coverage";
import { representativePageOrder } from "@/lib/extraction/page-sampling";

export const maxDuration = 300;

const BATCH_SIZE = 20;

async function readCoverage(documentId: string) {
  const document = await prisma.trainingDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
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

  if (!document) return null;

  const highestPage = document.pages.reduce(
    (max, page) => Math.max(max, page.pageNumber),
    0,
  );
  const totalPages = Math.max(document.pageCount ?? 0, highestPage, 1);
  const requiredPages = requiredReadablePages(totalPages);

  const readable = document.pages.filter(
    (page) =>
      page.extractionStatus === "COMPLETED" &&
      page.extractionMethod !== null &&
      page.extractionMethod !== "MOCK" &&
      (page.extractedText?.trim().length ?? 0) > 20,
  );

  const readableNumbers = new Set(readable.map((page) => page.pageNumber));
  const attemptedNumbers = new Set(
    document.pages
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
    id: document.id,
    fileName: document.fileName,
    totalPages,
    requiredPages,
    completedPages: readableNumbers.size,
    readableNumbers,
    attemptedNumbers,
  };
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { stage: "FAILED", error: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const { documentId } = await context.params;

  const owned = await prisma.trainingDocument.findFirst({
    where: {
      id: documentId,
      program: { instructorId: session.user.id },
    },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json(
      { stage: "FAILED", error: "المادة التدريبية غير موجودة." },
      { status: 404 },
    );
  }

  let coverage = await readCoverage(documentId);
  if (!coverage) {
    return NextResponse.json(
      { stage: "FAILED", error: "تعذر قراءة حالة المادة." },
      { status: 404 },
    );
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

  const orderedPages = representativePageOrder(coverage.totalPages);
  const unattempted = orderedPages.filter(
    (page) => !coverage!.attemptedNumbers.has(page),
  );
  const retry = orderedPages.filter(
    (page) =>
      coverage!.attemptedNumbers.has(page) &&
      !coverage!.readableNumbers.has(page),
  );
  const targetPages = [...unattempted, ...retry].slice(0, BATCH_SIZE);

  if (targetPages.length === 0) {
    return NextResponse.json(
      {
        stage: "FAILED",
        documentId,
        error: "لا توجد صفحات إضافية قابلة للمعالجة مع بقاء المصدر غير مكتمل.",
        completedPages: coverage.completedPages,
        requiredPages: coverage.requiredPages,
        totalPages: coverage.totalPages,
      },
      { status: 422 },
    );
  }

  const extraction = await extractionService.processDocument(
    documentId,
    session.user.id,
    targetPages,
  );

  coverage = await readCoverage(documentId);
  if (!coverage) {
    return NextResponse.json(
      { stage: "FAILED", error: "تعذر تحديث حالة المصدر." },
      { status: 500 },
    );
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
        error: extractionErrorToArabic(extraction.errorMessage),
        rawError: extraction.errorMessage,
        completedPages: coverage.completedPages,
        requiredPages: coverage.requiredPages,
        totalPages: coverage.totalPages,
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

  return NextResponse.json({
    stage: "EXTRACTING",
    documentId,
    fileName: coverage.fileName,
    completedPages: coverage.completedPages,
    requiredPages: coverage.requiredPages,
    totalPages: coverage.totalPages,
  });
}
