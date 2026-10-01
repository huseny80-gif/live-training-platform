"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { revalidatePath } from "next/cache";

// ─── helpers ────────────────────────────────────────────────────────────────

async function requireInstructor(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return session.user.id;
}

async function requireOwnership(programId: string, instructorId: string) {
  const program = await prisma.trainingProgram.findUnique({
    where: { id: programId },
    select: { instructorId: true },
  });
  if (!program) throw new Error("NOT_FOUND");
  if (program.instructorId !== instructorId) throw new Error("FORBIDDEN");
  return program;
}

// ─── schemas ────────────────────────────────────────────────────────────────

const CreateProgramSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  language: z.enum(["AR", "EN"]).default("AR"),
});

const UpdateProgramSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional(),
  language: z.enum(["AR", "EN"]).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
});

// ─── actions ────────────────────────────────────────────────────────────────

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function createProgram(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const instructorId = await requireInstructor();
  const parsed = CreateProgramSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    language: formData.get("language") || "AR",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const program = await prisma.trainingProgram.create({
    data: { ...parsed.data, instructorId },
  });
  revalidatePath("/dashboard");
  return { ok: true, data: { id: program.id } };
}

export async function listOwnedPrograms() {
  const instructorId = await requireInstructor();
  return prisma.trainingProgram.findMany({
    where: { instructorId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { days: true, sessions: true } },
      days: {
        include: {
          _count: { select: { questions: true } },
        },
      },
    },
  });
}

export async function getProgram(programId: string) {
  const instructorId = await requireInstructor();
  await requireOwnership(programId, instructorId);

  const program = await prisma.trainingProgram.findUnique({
    where: { id: programId },
    include: {
      _count: { select: { days: true, sessions: true } },
      days: {
        orderBy: { dayNumber: "asc" },
        include: { _count: { select: { questions: true } } },
      },
      sessions: {
        select: { id: true, sessionCode: true, status: true, startedAt: true },
        orderBy: { createdAt: "desc" },
      },
      documents: {
        select: {
          id: true,
          fileName: true,
          fileSizeBytes: true,
          pageCount: true,
          contentType: true,
          extractionStatus: true,
          extractionNotes: true,
          updatedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!program) return null;

  const documentIds = program.documents.map((document) => document.id);
  const realPages = documentIds.length
    ? await prisma.documentPage.findMany({
        where: {
          documentId: { in: documentIds },
          extractionStatus: "COMPLETED",
          NOT: { extractionMethod: "MOCK" },
        },
        select: {
          documentId: true,
          extractedText: true,
        },
      })
    : [];

  const realPageCountByDocument = new Map<string, number>();
  for (const page of realPages) {
    if ((page.extractedText?.trim().length ?? 0) <= 20) continue;
    realPageCountByDocument.set(
      page.documentId,
      (realPageCountByDocument.get(page.documentId) ?? 0) + 1
    );
  }

  return {
    ...program,
    documents: program.documents.map((document) => {
      const realPageCount = realPageCountByDocument.get(document.id) ?? 0;
      const totalPages = Math.max(document.pageCount ?? realPageCount, 1);
      const requiredPageCount = Math.max(1, Math.ceil(totalPages * 0.7));

      return {
        ...document,
        realPageCount,
        requiredPageCount,
        sourceReady: realPageCount >= requiredPageCount,
      };
    }),
  };
}

export async function updateProgram(
  programId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const instructorId = await requireInstructor();
  await requireOwnership(programId, instructorId);
  const parsed = UpdateProgramSchema.safeParse({
    title: formData.get("title") || undefined,
    description: formData.get("description") || undefined,
    language: formData.get("language") || undefined,
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  await prisma.trainingProgram.update({
    where: { id: programId },
    data: parsed.data,
  });
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

export async function deleteProgram(programId: string): Promise<ActionResult> {
  const instructorId = await requireInstructor();
  await requireOwnership(programId, instructorId);

  // Safety: block deletion if active sessions exist
  const activeSessions = await prisma.liveSession.count({
    where: {
      programId,
      status: { in: ["ACTIVE"] },
    },
  });
  if (activeSessions > 0) {
    return {
      ok: false,
      error: `Cannot delete: ${activeSessions} active session(s) still running.`,
    };
  }

  await prisma.trainingProgram.delete({ where: { id: programId } });
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}
