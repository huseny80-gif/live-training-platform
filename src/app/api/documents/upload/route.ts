import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { inspectPdf } from "@/lib/extraction/pdf-inspector";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth check
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const instructorId = session.user.id;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "INVALID_FORM_DATA" }, { status: 400 });
  }

  const programId = formData.get("programId");
  const file = formData.get("file");

  if (!programId || typeof programId !== "string") {
    return NextResponse.json({ error: "MISSING_PROGRAM_ID" }, { status: 400 });
  }
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "MISSING_FILE" }, { status: 400 });
  }

  // File type validation
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "INVALID_FILE_TYPE" }, { status: 400 });
  }

  // File size limit
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });
  }

  // Verify program ownership
  const program = await prisma.trainingProgram.findFirst({
    where: { id: programId, instructorId },
  });
  if (!program) {
    return NextResponse.json({ error: "PROGRAM_NOT_FOUND" }, { status: 404 });
  }

  // Read file buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Pre-flight PDF inspection
  const inspection = inspectPdf(buffer);
  if (inspection.pageCount === 0) {
    return NextResponse.json({ error: "INVALID_PDF" }, { status: 400 });
  }

  // Sanitize filename — strip path components, keep extension
  const rawName = (file as File).name ?? "upload.pdf";
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.pdf$/i, "") + ".pdf";

  // Storage key: instructor/program/uuid-filename (no path traversal possible)
  const storageKey = `${instructorId}/${programId}/${randomUUID()}-${safeName}`;

  // Save to storage
  await storage.save(storageKey, buffer, "application/pdf");

  // Create TrainingDocument record
  const doc = await prisma.trainingDocument.create({
    data: {
      programId,
      fileName: safeName,
      storagePath: storageKey,
      fileSizeBytes: buffer.length,
      mimeType: "application/pdf",
      pageCount: inspection.pageCount,
      contentType: inspection.contentType as "TEXT_BASED" | "IMAGE_BASED" | "MIXED" | "UNKNOWN",
      extractionStatus: "PENDING",
    },
  });

  return NextResponse.json({
    documentId: doc.id,
    fileName: doc.fileName,
    pageCount: doc.pageCount,
    contentType: doc.contentType,
    fileSizeBytes: doc.fileSizeBytes,
    extractionStatus: doc.extractionStatus,
    inspection: {
      contentType: inspection.contentType,
      pageCount: inspection.pageCount,
      imageObjectCount: inspection.imageObjectCount,
      textOperatorCount: inspection.textOperatorCount,
      requiresOcr: inspection.requiresOcr,
    },
  }, { status: 201 });
}
