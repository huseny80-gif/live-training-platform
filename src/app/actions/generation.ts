"use server";

import { auth } from "@/lib/auth";
import { contentGenerationService } from "@/lib/ai/service";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { extractionService } from "@/lib/extraction/service";
import { extractionErrorToArabic } from "@/lib/extraction/errors";

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


/**
 * Rebuild a program's days/questions in Arabic from its most recent successfully
 * extracted document. Existing content is preserved if generation fails.
 * Sessions must be removed first because they intentionally preserve question history.
 */
export async function regenerateProgramInArabic(programId: string) {
  const instructorId = await requireInstructor();

  const program = await prisma.trainingProgram.findFirst({
    where: { id: programId, instructorId },
    select: {
      id: true,
      sessions: { select: { id: true, sessionCode: true, status: true } },
      documents: {
        orderBy: { createdAt: "desc" },
        select: { id: true },
      },
    },
  });

  if (!program) throw new Error("PROGRAM_NOT_FOUND");

  if (program.sessions.length > 0) {
    return {
      programId,
      documentId: program.documents[0]?.id ?? "",
      status: "FAILED" as const,
      daysGenerated: 0,
      questionsGenerated: 0,
      errorMessage:
        "احذف الجلسات القديمة أولًا؛ فهي تحتفظ بنسخة تاريخية من بنك الأسئلة ولا يجوز استبدال الأسئلة أثناء ارتباطها بجلسات.",
    };
  }

  if (program.documents.length === 0) {
    return {
      programId,
      documentId: "",
      status: "FAILED" as const,
      daysGenerated: 0,
      questionsGenerated: 0,
      errorMessage: "لا يوجد ملف تدريبي مرفوع لإعادة توليد المحتوى منه.",
    };
  }

  const source = await extractionService.selectBestRealSourceDocument(
    programId,
    instructorId
  );

  if (!source.ok) {
    return {
      programId,
      documentId: "",
      status: "FAILED" as const,
      daysGenerated: 0,
      questionsGenerated: 0,
      errorMessage: extractionErrorToArabic(source.errorMessage),
    };
  }

  const result = await contentGenerationService.generateForProgram(
    programId,
    source.documentId,
    instructorId,
    "AR"
  );

  if (result.status === "COMPLETED") {
    await prisma.trainingProgram.update({
      where: { id: programId },
      data: { language: "AR" },
    });
    revalidatePath(`/programs/${programId}`);
    revalidatePath(`/programs/${programId}/manage`);
    revalidatePath("/dashboard");
  }

  return result;
}
