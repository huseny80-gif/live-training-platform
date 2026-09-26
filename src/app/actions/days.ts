"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./programs";

async function requireInstructor(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return session.user.id;
}

async function requireProgramOwnership(programId: string, instructorId: string) {
  const program = await prisma.trainingProgram.findUnique({
    where: { id: programId },
    select: { instructorId: true },
  });
  if (!program) throw new Error("NOT_FOUND");
  if (program.instructorId !== instructorId) throw new Error("FORBIDDEN");
}

const CreateDaySchema = z.object({
  programId: z.string().uuid(),
  dayNumber: z.coerce.number().int().min(1).max(10),
  title: z.string().min(2).max(200),
  objectives: z.string().optional(),
  contentSummary: z.string().max(2000).optional(),
});

const UpdateDaySchema = z.object({
  title: z.string().min(2).max(200).optional(),
  objectives: z.string().optional(),
  contentSummary: z.string().max(2000).optional(),
  status: z.enum(["DRAFT", "APPROVED"]).optional(),
});

export async function createDay(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const instructorId = await requireInstructor();
  const parsed = CreateDaySchema.safeParse({
    programId: formData.get("programId"),
    dayNumber: formData.get("dayNumber"),
    title: formData.get("title"),
    objectives: formData.get("objectives") || undefined,
    contentSummary: formData.get("contentSummary") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  await requireProgramOwnership(parsed.data.programId, instructorId);

  const objectivesList = parsed.data.objectives
    ? parsed.data.objectives.split("\n").map((s) => s.trim()).filter(Boolean)
    : [];

  const day = await prisma.trainingDay.create({
    data: {
      programId: parsed.data.programId,
      dayNumber: parsed.data.dayNumber,
      title: parsed.data.title,
      objectives: objectivesList,
      contentSummary: parsed.data.contentSummary,
    },
  });
  revalidatePath(`/programs/${parsed.data.programId}`);
  return { ok: true, data: { id: day.id } };
}

export async function listDays(programId: string) {
  const instructorId = await requireInstructor();
  await requireProgramOwnership(programId, instructorId);
  return prisma.trainingDay.findMany({
    where: { programId },
    orderBy: { dayNumber: "asc" },
    include: { _count: { select: { questions: true } } },
  });
}

export async function updateDay(dayId: string, formData: FormData): Promise<ActionResult> {
  const instructorId = await requireInstructor();
  const day = await prisma.trainingDay.findUnique({
    where: { id: dayId },
    select: { programId: true },
  });
  if (!day) return { ok: false, error: "NOT_FOUND" };
  await requireProgramOwnership(day.programId, instructorId);

  const parsed = UpdateDaySchema.safeParse({
    title: formData.get("title") || undefined,
    objectives: formData.get("objectives") || undefined,
    contentSummary: formData.get("contentSummary") || undefined,
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { objectives: rawObjectives, ...rest } = parsed.data;
  const updateData: {
    title?: string;
    contentSummary?: string;
    status?: "DRAFT" | "APPROVED";
    objectives?: string[];
  } = rest;

  if (rawObjectives !== undefined) {
    updateData.objectives = rawObjectives.split("\n").map((s) => s.trim()).filter(Boolean);
  }

  await prisma.trainingDay.update({
    where: { id: dayId },
    data: updateData,
  });
  revalidatePath(`/programs/${day.programId}`);
  return { ok: true, data: undefined };
}

export async function deleteDay(dayId: string): Promise<ActionResult> {
  const instructorId = await requireInstructor();
  const day = await prisma.trainingDay.findUnique({
    where: { id: dayId },
    select: { programId: true },
  });
  if (!day) return { ok: false, error: "NOT_FOUND" };
  await requireProgramOwnership(day.programId, instructorId);

  await prisma.trainingDay.delete({ where: { id: dayId } });
  revalidatePath(`/programs/${day.programId}`);
  return { ok: true, data: undefined };
}

export async function getDay(dayId: string) {
  const instructorId = await requireInstructor();

  const day = await prisma.trainingDay.findFirst({
    where: {
      id: dayId,
      program: {
        instructorId,
      },
    },
    include: {
      topics: {
        orderBy: { topicOrder: "asc" },
      },
      document: {
        select: {
          id: true,
          fileName: true,
          pageCount: true,
          extractionStatus: true,
          pages: {
            orderBy: { pageNumber: "asc" },
            select: {
              id: true,
              pageNumber: true,
              title: true,
              extractionStatus: true,
            },
          },
        },
      },
      _count: {
        select: {
          questions: true,
        },
      },
    },
  });

  if (!day) {
    throw new Error("NOT_FOUND");
  }

  return day;
}
