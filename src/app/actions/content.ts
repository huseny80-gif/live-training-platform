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
    const arabicPattern = /[\u0600-\u06FF]/;
    const texts = [
      parsed.data.questionText,
      parsed.data.optionA,
      parsed.data.optionB,
      parsed.data.optionC,
      parsed.data.optionD,
    ].filter((value): value is string => Boolean(value));

    if (texts.some((value) => !arabicPattern.test(value))) {
      return {
        ok: false,
        error: "البرنامج مضبوط على العربية؛ يجب أن يكون نص السؤال وجميع الخيارات باللغة العربية.",
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

export async function updateQuestionAction(questionId: string, formData: FormData): Promise<ActionResult> {
  const instructorId = await requireInstructor();
  const parsed = z.object({
    questionText: z.string().trim().min(5).max(1000),
    explanation: z.string().trim().max(2000),
    topic: z.string().trim().max(200),
    correctOptionId: z.string().min(1),
  }).safeParse(Object.fromEntries(["questionText", "explanation", "topic", "correctOptionId"].map(key => [key, formData.get(key) ?? ""])));
  if (!parsed.success) return { ok: false, error: "أدخل نص السؤال والإجابة الصحيحة؛ الحد الأقصى للسؤال 1000 حرف وللتفسير 2000 حرف." };
  const result = await prisma.$transaction(async tx => {
    const question = await tx.question.findFirst({ where: { id: questionId, day: { program: { instructorId } } }, include: { options: true, day: { select: { program: { select: { language: true } } } } } });
    if (!question) return { ok: false as const, error: "السؤال غير موجود أو لا تملك صلاحية تعديله." };
    if (await tx.sessionQuestion.count({ where: { questionId, session: { status: { not: "DRAFT" } } } })) return { ok: false as const, error: "استُخدم هذا السؤال في جلسة بدأت بالفعل؛ لا يمكن تغيير إجاباته حفاظاً على نتائج المتدربين." };
    if (!question.options.some(o => o.id === parsed.data.correctOptionId)) return { ok: false as const, error: "اختر إجابة صحيحة من خيارات هذا السؤال." };
    const options = question.options.map(o => ({ id: o.id, text: String(formData.get(`option-${o.id}`) ?? "").trim() }));
    if (options.length < 2 || options.some(o => !o.text || o.text.length > 500)) return { ok: false as const, error: "أدخل جميع خيارات الإجابة، بحد أقصى 500 حرف لكل خيار." };
    const arabic = /[\u0600-\u06FF]/;
    if (question.day.program.language === "AR" && [parsed.data.questionText, ...options.map(o => o.text)].some(text => !arabic.test(text))) return { ok: false as const, error: "البرنامج مضبوط على العربية؛ يجب أن يكون نص السؤال وجميع الخيارات باللغة العربية." };
    for (const option of options) await tx.questionOption.update({ where: { id: option.id }, data: { optionText: option.text } });
    await tx.question.update({ where: { id: question.id }, data: { ...parsed.data, topic: parsed.data.topic || null, explanation: parsed.data.explanation || null, status: "DRAFT" } });
    return { ok: true as const, programId: question.programId, dayId: question.dayId };
  }, { isolationLevel: "Serializable" });
  if (!result.ok) return result;
  revalidatePath("/questions"); revalidatePath("/google-forms"); revalidatePath("/final-exam");
  revalidatePath(`/programs/${result.programId}/manage`); revalidatePath(`/programs/${result.programId}/days/${result.dayId}`);
  return { ok: true, data: undefined };
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
    select: { programId: true, status: true },
  });
  if (!session) return { ok: false, error: "NOT_FOUND" };
  if (session.status === "ACTIVE") return { ok: false, error: "CANNOT_DELETE_ACTIVE" };

  await prisma.liveSession.delete({ where: { id: sessionId } });
  revalidatePath(`/programs/${session.programId}/manage`);
  return { ok: true, data: undefined };
}
