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
  return prisma.trainingProgram.findUnique({
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
    },
  });
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
