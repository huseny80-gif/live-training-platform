"use server";

import { auth } from "@/lib/auth";
import { contentGenerationService } from "@/lib/ai/service";
import { prisma } from "@/lib/prisma";

async function requireInstructor(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session.user.id;
}

/** Trigger AI content generation for a program from a document */
export async function generateProgramContent(programId: string, documentId: string) {
  const instructorId = await requireInstructor();
  return contentGenerationService.generateForProgram(programId, documentId, instructorId);
}

/** Get questions for a day — participant-safe (no correct answer) */
export async function getDayQuestionsForParticipant(dayId: string) {
  // No auth required — participants access by session code, handled at session layer
  return contentGenerationService.getDayQuestionsForParticipant(dayId);
}

/** Get questions with correct answers — instructor only */
export async function getDayQuestionsForInstructor(dayId: string) {
  const instructorId = await requireInstructor();
  return contentGenerationService.getDayQuestionsForInstructor(dayId, instructorId);
}

/** List training days for a program (ownership enforced) */
export async function listProgramDays(programId: string) {
  const instructorId = await requireInstructor();

  const program = await prisma.trainingProgram.findFirst({
    where: { id: programId, instructorId },
  });
  if (!program) throw new Error("PROGRAM_NOT_FOUND");

  return prisma.trainingDay.findMany({
    where: { programId },
    orderBy: { dayNumber: "asc" },
    include: {
      topics: { orderBy: { topicOrder: "asc" } },
      _count: { select: { questions: true } },
    },
  });
}

/** Get question count stats for a program */
export async function getProgramQuestionStats(programId: string) {
  const instructorId = await requireInstructor();

  const program = await prisma.trainingProgram.findFirst({
    where: { id: programId, instructorId },
  });
  if (!program) throw new Error("PROGRAM_NOT_FOUND");

  const days = await prisma.trainingDay.findMany({
    where: { programId },
    select: {
      dayNumber: true,
      _count: { select: { questions: true } },
    },
  });

  return {
    totalDays: days.length,
    totalQuestions: days.reduce((sum, d) => sum + d._count.questions, 0),
    byDay: days.map((d) => ({ dayNumber: d.dayNumber, questionCount: d._count.questions })),
  };
}


/** Recreate the 10-day / 50-question bank in Arabic from the latest extracted source document. */
export async function regenerateProgramQuestionsArabic(programId: string) {
  const instructorId = await requireInstructor();
  const program = await prisma.trainingProgram.findFirst({
    where: { id: programId, instructorId },
    include: {
      documents: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { sessions: true } },
    },
  });
  if (!program) throw new Error("PROGRAM_NOT_FOUND");
  if (program._count.sessions > 0) {
    return { ok: false as const, error: "DELETE_SESSIONS_FIRST" };
  }
  const document = program.documents[0];
  if (!document) return { ok: false as const, error: "NO_DOCUMENT" };
  if (document.extractionStatus !== "COMPLETED") {
    return { ok: false as const, error: "DOCUMENT_NOT_EXTRACTED" };
  }
  const result = await contentGenerationService.generateForProgram(programId, document.id, instructorId, "AR");
  if (result.status !== "COMPLETED") {
    return { ok: false as const, error: result.errorMessage ?? "GENERATION_FAILED" };
  }
  return { ok: true as const, daysGenerated: result.daysGenerated, questionsGenerated: result.questionsGenerated, modelUsed: result.modelUsed };
}
