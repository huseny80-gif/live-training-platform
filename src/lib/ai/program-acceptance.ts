import { prisma } from "@/lib/prisma";
import { isArabicQuestionContent, isPredominantlyArabic } from "@/lib/language";

export type ProgramAcceptance =
  | {
      ok: true;
      days: number;
      questions: number;
      questionsPerDay: number[];
    }
  | {
      ok: false;
      reason: string;
      days: number;
      questions: number;
      questionsPerDay: number[];
    };

export async function verifyArabicProgramBank(programId: string): Promise<ProgramAcceptance> {
  const days = await prisma.trainingDay.findMany({
    where: { programId },
    orderBy: { dayNumber: "asc" },
    select: {
      dayNumber: true,
      title: true,
      objectives: true,
      contentSummary: true,
      topics: { select: { title: true } },
      questions: {
        orderBy: { questionOrder: "asc" },
        select: {
          questionText: true,
          options: { select: { optionText: true } },
        },
      },
    },
  });

  const questionsPerDay = days.map((day) => day.questions.length);
  const questionCount = questionsPerDay.reduce((sum, count) => sum + count, 0);

  if (days.length !== 10) {
    return {
      ok: false,
      reason: `EXPECTED_10_DAYS_GOT_${days.length}`,
      days: days.length,
      questions: questionCount,
      questionsPerDay,
    };
  }

  const quotaMismatch = questionsPerDay.findIndex((count) => count !== 5);
  if (quotaMismatch >= 0 || questionCount !== 50) {
    return {
      ok: false,
      reason:
        quotaMismatch >= 0
          ? `DAY_${days[quotaMismatch].dayNumber}_EXPECTED_5_QUESTIONS_GOT_${questionsPerDay[quotaMismatch]}`
          : `EXPECTED_50_QUESTIONS_GOT_${questionCount}`,
      days: days.length,
      questions: questionCount,
      questionsPerDay,
    };
  }

  for (const day of days) {
    if (
      !isPredominantlyArabic(day.title) ||
      !isPredominantlyArabic(day.contentSummary) ||
      day.objectives.length === 0 ||
      day.objectives.some((value) => !isPredominantlyArabic(value)) ||
      day.topics.length === 0 ||
      day.topics.some((topic) => !isPredominantlyArabic(topic.title))
    ) {
      return {
        ok: false,
        reason: `DAY_${day.dayNumber}_ARABIC_CONTENT_VALIDATION_FAILED`,
        days: days.length,
        questions: questionCount,
        questionsPerDay,
      };
    }

    for (const question of day.questions) {
      if (
        !isArabicQuestionContent(
          question.questionText,
          question.options.map((option) => ({ text: option.optionText })),
        )
      ) {
        return {
          ok: false,
          reason: `DAY_${day.dayNumber}_ARABIC_QUESTION_VALIDATION_FAILED`,
          days: days.length,
          questions: questionCount,
          questionsPerDay,
        };
      }
    }
  }

  return {
    ok: true,
    days: days.length,
    questions: questionCount,
    questionsPerDay,
  };
}
