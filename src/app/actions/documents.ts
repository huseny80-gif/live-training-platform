"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractionService } from "@/lib/extraction/service";
import { storage } from "@/lib/storage";
import { inspectPdf } from "@/lib/extraction/pdf-inspector";

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

/**
 * Resolve a document created asynchronously by the Vercel Blob upload-completed
 * callback, keyed by its storage path (the blob URL). Used by the client-side
 * blob upload flow to recover the documentId once the callback has run.
 */
export async function resolveDocumentByStoragePath(programId: string, storagePath: string) {
  const instructorId = await requireInstructor();

  const program = await prisma.trainingProgram.findFirst({
    where: { id: programId, instructorId },
  });
  if (!program) throw new Error("PROGRAM_NOT_FOUND");

  const doc = await prisma.trainingDocument.findFirst({
    where: { storagePath, programId },
    select: {
      id: true,
      fileName: true,
      pageCount: true,
      contentType: true,
      fileSizeBytes: true,
      extractionStatus: true,
    },
  });
  return doc;
}

/**
 * Idempotently register a TrainingDocument for a blob that has already been
 * uploaded to Vercel Blob storage. Verifies program ownership, verifies the
 * blobUrl is actually a private blob scoped to this program, fetches the
 * blob to run PDF inspection, and creates the DB record — or returns the
 * existing one if it was already registered (e.g. by the upload-completed
 * webhook, or a duplicate client call).
 *
 * Shared by the `completeBlobUpload` action (called directly by the client
 * right after upload) and the upload-url route's onUploadCompleted webhook
 * (which fires from Vercel's infrastructure and cannot reach localhost).
 */
export async function registerBlobUpload(params: {
  instructorId: string;
  programId: string;
  blobUrl: string;
  fileName: string;
}) {
  const { instructorId, programId, blobUrl, fileName } = params;

  const program = await prisma.trainingProgram.findFirst({
    where: { id: programId, instructorId },
    select: { id: true },
  });
  if (!program) throw new Error("PROGRAM_NOT_FOUND");

  // blobUrl is client-supplied (completeBlobUpload) or comes from Vercel's
  // upload-completed webhook — either way it names a blob this function is
  // about to read and attach to programId, so verify it actually is a
  // private blob scoped to this program before trusting it. Without this,
  // any instructor could register (and thereby read, via storage.read below)
  // a blob belonging to a different program or instructor by passing its URL.
  let blobHost: URL;
  try {
    blobHost = new URL(blobUrl);
  } catch {
    throw new Error("INVALID_BLOB_URL");
  }
  if (!blobHost.hostname.endsWith(".private.blob.vercel-storage.com")) {
    throw new Error("BLOB_NOT_PRIVATE");
  }
  const expectedPrefix = `uploads/${programId}/`;
  const blobPathname = blobHost.pathname.replace(/^\//, "");
  const blobPathRest = blobPathname.startsWith(expectedPrefix)
    ? blobPathname.slice(expectedPrefix.length)
    : null;
  if (!blobPathRest || blobPathRest.includes("/")) {
    throw new Error("BLOB_PATH_MISMATCH");
  }

  const existing = await prisma.trainingDocument.findFirst({
    where: { storagePath: blobUrl, programId },
    select: {
      id: true,
      fileName: true,
      pageCount: true,
      contentType: true,
      fileSizeBytes: true,
      extractionStatus: true,
    },
  });
  if (existing) return existing;

  // storage.read authenticates the request with BLOB_READ_WRITE_TOKEN, which
  // a plain fetch(blobUrl) cannot do now that uploads are private access.
  const buffer = await storage.read(blobUrl);

  const inspection = inspectPdf(buffer);
  if (inspection.pageCount === 0) throw new Error("INVALID_PDF");

  return prisma.trainingDocument.create({
    data: {
      programId,
      fileName,
      storagePath: blobUrl,
      fileSizeBytes: buffer.length,
      mimeType: "application/pdf",
      pageCount: inspection.pageCount,
      contentType: inspection.contentType as
        | "TEXT_BASED"
        | "IMAGE_BASED"
        | "MIXED"
        | "UNKNOWN",
      extractionStatus: "PENDING",
    },
    select: {
      id: true,
      fileName: true,
      pageCount: true,
      contentType: true,
      fileSizeBytes: true,
      extractionStatus: true,
    },
  });
}

/**
 * Client-facing completion step for the Vercel Blob direct-upload flow.
 * Called by the browser immediately after the blob upload resolves, so the
 * client gets a documentId deterministically instead of polling for the
 * webhook to run. Idempotent — safe if the webhook also fires.
 */
export async function completeBlobUpload(
  programId: string,
  blobUrl: string,
  fileName: string
) {
  const instructorId = await requireInstructor();
  const doc = await registerBlobUpload({ instructorId, programId, blobUrl, fileName });
  // Invalidate the program page so window.location.reload() fetches fresh data
  // that includes the newly-created document.
  revalidatePath(`/programs/${programId}`);
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

/** Mark a document as FAILED — called when the client-side pipeline throws */
export async function markDocumentFailed(documentId: string) {
  const instructorId = await requireInstructor();

  const doc = await prisma.trainingDocument.findFirst({
    where: { id: documentId, program: { instructorId } },
    select: { id: true, extractionStatus: true },
  });
  if (!doc) throw new Error("NOT_FOUND");

  // Only update if still in a transient state — don't downgrade COMPLETED to FAILED
  if (doc.extractionStatus === "PENDING" || doc.extractionStatus === "PROCESSING") {
    await prisma.trainingDocument.update({
      where: { id: documentId },
      data: { extractionStatus: "FAILED" },
    });
  }
  return { success: true };
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
