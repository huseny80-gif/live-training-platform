"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractionService } from "@/lib/extraction/service";
import { storage } from "@/lib/storage/local";

async function requireInstructor(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session.user.id;
}

/** List documents for a program (ownership enforced) */
export async function listDocuments(programId: string) {
  const instructorId = await requireInstructor();

  const program = await prisma.trainingProgram.findFirst({
    where: { id: programId, instructorId },
  });
  if (!program) throw new Error("PROGRAM_NOT_FOUND");

  return prisma.trainingDocument.findMany({
    where: { programId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      fileSizeBytes: true,
      pageCount: true,
      contentType: true,
      extractionStatus: true,
      createdAt: true,
    },
  });
}

/** Get a single document with pages (ownership enforced) */
export async function getDocument(documentId: string) {
  const instructorId = await requireInstructor();

  const doc = await prisma.trainingDocument.findFirst({
    where: { id: documentId, program: { instructorId } },
    include: {
      pages: {
        orderBy: { pageNumber: "asc" },
        select: {
          id: true,
          pageNumber: true,
          title: true,
          extractedText: true,
          extractionMethod: true,
          extractionStatus: true,
          errorMessage: true,
          extractedAt: true,
        },
      },
    },
  });
  if (!doc) throw new Error("NOT_FOUND");
  return doc;
}

/** Trigger extraction for a document */
export async function triggerExtraction(documentId: string, pageNumbers?: number[]) {
  const instructorId = await requireInstructor();
  return extractionService.processDocument(documentId, instructorId, pageNumbers);
}

/** Retry a single failed page */
export async function retryPageExtraction(documentId: string, pageNumber: number) {
  const instructorId = await requireInstructor();
  return extractionService.retryPage(documentId, pageNumber, instructorId);
}

/** Delete a document and its stored file */
export async function deleteDocument(documentId: string) {
  const instructorId = await requireInstructor();

  const doc = await prisma.trainingDocument.findFirst({
    where: { id: documentId, program: { instructorId } },
  });
  if (!doc) throw new Error("NOT_FOUND");

  // Delete file from storage (best-effort)
  try {
    await storage.delete(doc.storagePath);
  } catch {
    // Storage delete failure should not block DB cleanup
  }

  await prisma.trainingDocument.delete({ where: { id: documentId } });
  return { success: true };
}
