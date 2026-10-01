"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./programs";
import { isArabicQuestionContent } from "@/lib/language";

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

async function requireDayOwnership(dayId: string, instructorId: string) {
  const day = await prisma.trainingDay.findFirst({
    where: { id: dayId, program: { instructorId } },
    select: { programId: true },
  });
  if (!day) throw new Error("NOT_FOUND");
  return day.programId;
}

// ── Program content overview ───────────────────────────────────────────────

export async function getProgramContent(programId: string) {
  const instructorId = await requireInstructor();
  await requireProgramOwnership(programId, instructorId);

  return prisma.trainingProgram.findUnique({
    where: { id: programId },
    include: {
      days: {
        orderBy: { dayNumber: "asc" },
        include: {
          topics: { orderBy: { topicOrder: "asc" } },
          questions: {
            orderBy: { questionOrder: "asc" },
            include: {
              options: { orderBy: { displayOrder: "asc" } },
            },
          },
          _count: { select: { questions: true } },
        },
      },
      sessions: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { participants: true } } },
      },
    },
  });
}

// ── Day CRUD ───────────────────────────────────────────────────────────────

const DaySchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(30),
  title: z.string().min(2).max(200),
  objectives: z.string().optional(),
  contentSummary: z.string().max(2000).optional(),
});

export async function createDayAction(
  programId: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const instructorId = await requireInstructor();
  await requireProgramOwnership(programId, instructorId);

  const parsed = DaySchema.safeParse({
    dayNumber: formData.get("dayNumber"),
    title: formData.get("title"),
    objectives: formData.get("objectives") || undefined,
    contentSummary: formData.get("contentSummary") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const objectives = parsed.data.objectives
    ? parsed.data.objectives.split("\n").map((s) => s.trim()).filter(Boolean)
    : [];

  const day = await prisma.trainingDay.create({
    data: { programId, ...parsed.data, objectives },
  });
  revalidatePath(`/programs/${programId}/manage`);
  return { ok: true, data: { id: day.id } };
}

export async function updateDayAction(
  dayId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const instructorId = await requireInstructor();
  const programId = await requireDayOwnership(dayId, instructorId);

  const parsed = DaySchema.partial().safeParse({
    dayNumber: formData.get("dayNumber") || undefined,
    title: formData.get("title") || undefined,
    objectives: formData.get("objectives") || undefined,
    contentSummary: formData.get("contentSummary") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { objectives: rawObj, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (rawObj !== undefined) {
    data.objectives = rawObj.split("\n").map((s) => s.trim()).filter(Boolean);
  }

  await prisma.trainingDay.update({ where: { id: dayId }, data });
  revalidatePath(`/programs/${programId}/manage`);
  return { ok: true, data: undefined };
}

export async function deleteDayAction(dayId: string): Promise<ActionResult> {
  const instructorId = await requireInstructor();
  const programId = await requireDayOwnership(dayId, instructorId);
  await prisma.trainingDay.delete({ where: { id: dayId } });
  revalidatePath(`/programs/${programId}/manage`);
  return { ok: true, data: undefined };
}

// ── Topic CRUD ─────────────────────────────────────────────────────────────

export async function createTopicAction(
  dayId: string,
  title: string
): Promise<ActionResult<{ id: string }>> {
  const instructorId = await requireInstructor();
  const programId = await requireDayOwnership(dayId, instructorId);

  const count = await prisma.trainingTopic.count({ where: { dayId } });
  const topic = await prisma.trainingTopic.create({
    data: { dayId, title: title.trim(), topicOrder: count + 1 },
  });
  revalidatePath(`/programs/${programId}/manage`);
  return { ok: true, data: { id: topic.id } };
}

export async function updateTopicAction(
  topicId: string,
  title: string
): Promise<ActionResult> {
  const instructorId = await requireInstructor();
  const topic = await prisma.trainingTopic.findFirst({
    where: { id: topicId, day: { program: { instructorId } } },
    select: { day: { select: { programId: true } } },
  });
  if (!topic) return { ok: false, error: "NOT_FOUND" };
  await prisma.trainingTopic.update({ where: { id: topicId }, data: { title: title.trim() } });
  revalidatePath(`/programs/${topic.day.programId}/manage`);
  return { ok: true, data: undefined };
}

export async function deleteTopicAction(topicId: string): Promise<ActionResult> {
  const instructorId = await requireInstructor();
  const topic = await prisma.trainingTopic.findFirst({
    where: { id: topicId, day: { program: { instructorId } } },
    select: { day: { select: { programId: true } } },
  });
  if (!topic) return { ok: false, error: "NOT_FOUND" };
  await prisma.trainingTopic.delete({ where: { id: topicId } });
  revalidatePath(`/programs/${topic.day.programId}/manage`);
  return { ok: true, data: undefined };
}

// ── Question CRUD ──────────────────────────────────────────────────────────

const QuestionSchema = z.object({
  questionText: z.string().min(5).max(1000),
  optionA: z.string().min(1).max(500),
  optionB: z.string().min(1).max(500),
  optionC: z.string().max(500).optional(),
  optionD: z.string().max(500).optional(),
  correctLabel: z.enum(["A", "B", "C", "D"]),
  topic: z.string().max(200).optional(),
});

export async function createQuestionAction(
  dayId: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const instructorId = await requireInstructor();
  const programId = await requireDayOwnership(dayId, instructorId);

  const parsed = QuestionSchema.safeParse({
    questionText: formData.get("questionText"),
    optionA: formData.get("optionA"),
    optionB: formData.get("optionB"),
    optionC: formData.get("optionC") || undefined,
    optionD: formData.get("optionD") || undefined,
    correctLabel: formData.get("correctLabel"),
    topic: formData.get("topic") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const program = await prisma.trainingProgram.findUnique({
    where: { id: programId },
    select: { language: true },
  });
  if (!program) return { ok: false, error: "NOT_FOUND" };

  if (program.language === "AR") {
    const optionTexts = [
      parsed.data.optionA,
      parsed.data.optionB,
      parsed.data.optionC,
      parsed.data.optionD,
    ]
      .filter((value): value is string => Boolean(value))
      .map((text) => ({ text }));

    if (!isArabicQuestionContent(parsed.data.questionText, optionTexts)) {
      return {
        ok: false,
        error: "البرنامج عربي؛ يجب أن يكون نص السؤال عربيًا، وتكون الخيارات عربية أو مصطلحات تقنية قصيرة فقط.",
      };
    }
  }

  const count = await prisma.question.count({ where: { dayId } });

  const question = await prisma.question.create({
    data: {
      dayId,
      programId,
      questionText: parsed.data.questionText,
      questionOrder: count + 1,
      topic: parsed.data.topic,
      status: "APPROVED",
      generatedBy: "MANUAL",
    },
  });

  const options: { label: string; text: string }[] = [
    { label: "A", text: parsed.data.optionA },
    { label: "B", text: parsed.data.optionB },
  ];
  if (parsed.data.optionC) options.push({ label: "C", text: parsed.data.optionC });
  if (parsed.data.optionD) options.push({ label: "D", text: parsed.data.optionD });

  let correctOptionId = "";
  for (let i = 0; i < options.length; i++) {
    const opt = await prisma.questionOption.create({
      data: {
        questionId: question.id,
        optionLabel: options[i].label as "A" | "B" | "C" | "D",
        optionText: options[i].text,
        displayOrder: i + 1,
      },
    });
    if (options[i].label === parsed.data.correctLabel) correctOptionId = opt.id;
  }

  await prisma.question.update({
    where: { id: question.id },
    data: { correctOptionId },
  });

  revalidatePath(`/programs/${programId}/manage`);
  return { ok: true, data: { id: question.id } };
}

export async function deleteQuestionAction(questionId: string): Promise<ActionResult> {
  const instructorId = await requireInstructor();
  const question = await prisma.question.findFirst({
    where: { id: questionId, day: { program: { instructorId } } },
    select: { dayId: true, programId: true },
  });
  if (!question) return { ok: false, error: "NOT_FOUND" };
  await prisma.question.delete({ where: { id: questionId } });
  revalidatePath(`/programs/${question.programId}/manage`);
  return { ok: true, data: undefined };
}

// ── Session CRUD ───────────────────────────────────────────────────────────

export async function deleteSessionAction(sessionId: string): Promise<ActionResult> {
  const instructorId = await requireInstructor();
  const session = await prisma.liveSession.findFirst({
    where: { id: sessionId, instructorId },
    select: { programId: true, status: true, sessionCode: true },
  });
  if (!session) return { ok: false, error: "الجلسة غير موجودة أو لا تملك صلاحية حذفها." };

  try {
    await prisma.$transaction(async (tx) => {
      // Delete in explicit dependency order. This intentionally does not rely
      // on database CASCADE definitions, which may differ across old deployments.
      await tx.participantAnswer.deleteMany({ where: { sessionId } });
      await tx.participantDayResult.deleteMany({ where: { sessionId } });
      await tx.dailyResult.deleteMany({ where: { sessionId } });
      await tx.sessionResult.deleteMany({ where: { sessionId } });
      await tx.sessionParticipant.deleteMany({ where: { sessionId } });

      // Clear the pointer before removing SessionQuestion rows. Older database
      // schemas may enforce this reference even though Prisma models it as scalar.
      await tx.liveSession.update({
        where: { id: sessionId },
        data: { currentQuestionId: null },
      });

      await tx.sessionQuestion.deleteMany({ where: { sessionId } });
      await tx.liveSession.delete({ where: { id: sessionId } });
    });
  } catch (error) {
    console.error("DELETE_SESSION_FAILED", {
      sessionId,
      sessionCode: session.sessionCode,
      status: session.status,
      error,
    });
    return {
      ok: false,
      error: `تعذر حذف الجلسة ${session.sessionCode}. لم يتم حذف جزء من بياناتها؛ أعد المحاولة بعد تحديث الصفحة.`,
    };
  }

  revalidatePath(`/programs/${session.programId}/manage`);
  revalidatePath(`/programs/${session.programId}`);
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

export async function deleteNonArabicQuestionsAction(
  programId: string
): Promise<ActionResult<{ deleted: number; blocked: number; blockedSessionCodes: string[] }>> {
  const instructorId = await requireInstructor();
  await requireProgramOwnership(programId, instructorId);

  const program = await prisma.trainingProgram.findUnique({
    where: { id: programId },
    select: { language: true },
  });
  if (!program) return { ok: false, error: "NOT_FOUND" };
  if (program.language !== "AR") {
    return { ok: false, error: "PROGRAM_NOT_ARABIC" };
  }

  const questions = await prisma.question.findMany({
    where: { programId },
    include: {
      options: { orderBy: { displayOrder: "asc" } },
      sessionQuestions: {
        select: {
          session: { select: { sessionCode: true } },
        },
      },
    },
  });

  const invalid = questions.filter(
    (question) =>
      !isArabicQuestionContent(
        question.questionText,
        question.options.map((option) => ({ text: option.optionText }))
      )
  );

  const removable = invalid.filter((question) => question.sessionQuestions.length === 0);
  const blocked = invalid.filter((question) => question.sessionQuestions.length > 0);

  if (removable.length > 0) {
    await prisma.question.deleteMany({
      where: { id: { in: removable.map((question) => question.id) } },
    });
  }

  const blockedSessionCodes = Array.from(
    new Set(
      blocked.flatMap((question) =>
        question.sessionQuestions.map((link) => link.session.sessionCode)
      )
    )
  ).sort();

  revalidatePath(`/programs/${programId}/manage`);
  revalidatePath(`/programs/${programId}`);

  return {
    ok: true,
    data: {
      deleted: removable.length,
      blocked: blocked.length,
      blockedSessionCodes,
    },
  };
}
