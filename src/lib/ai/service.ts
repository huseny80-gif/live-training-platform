// ContentGenerationService — orchestrates:
//   DocumentPage[] → AI generation → TrainingDay[] + Question[] + Option[] persistence
//
// Security: correct answer (correctOptionId) is stored in DB but NEVER
// returned by any method that will reach participant/client APIs.
// All methods here are server-only (called from Server Actions).

import { prisma } from "@/lib/prisma";
import type { AIAdapter, ContentGenerationRequest, SourcePageRef } from "./types";
import { isPredominantlyArabic } from "@/lib/language";
import { ClaudeAIAdapter } from "./adapters/claude";
import { OpenAIAdapter } from "./adapters/openai";

const TOTAL_DAYS = 10;
const QUESTIONS_PER_DAY = 5;

// Provider registry. The explicit provider is tried first, but when both
// providers are configured the second provider is a production fallback.
// This prevents a transient provider/model failure from leaving a 0-question bank.
function getAdapters(): AIAdapter[] {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  const adapters: AIAdapter[] = [];

  const pushOpenAI = () => {
    if (process.env.OPENAI_API_KEY && !adapters.some((item) => item.name === "OPENAI")) {
      adapters.push(new OpenAIAdapter());
    }
  };
  const pushClaude = () => {
    if (process.env.ANTHROPIC_API_KEY && !adapters.some((item) => item.name === "CLAUDE")) {
      adapters.push(new ClaudeAIAdapter());
    }
  };

  if (explicit === "openai") {
    pushOpenAI();
    pushClaude();
  } else if (explicit === "anthropic" || explicit === "claude") {
    pushClaude();
    pushOpenAI();
  } else if (explicit) {
    throw new Error(`UNSUPPORTED_AI_PROVIDER: ${explicit}`);
  } else {
    pushOpenAI();
    pushClaude();
  }

  if (adapters.length === 0) {
    throw new Error(
      "NO_AI_PROVIDER_CONFIGURED — set OPENAI_API_KEY or ANTHROPIC_API_KEY"
    );
  }

  return adapters;
}

export interface GenerationProgress {
  programId: string;
  documentId: string;
  status: "PENDING" | "GENERATING" | "COMPLETED" | "FAILED";
  daysGenerated: number;
  questionsGenerated: number;
  errorMessage?: string;
  modelUsed?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export class ContentGenerationService {
  /**
   * Full pipeline:
   * 1. Load COMPLETED DocumentPage rows for the document
   * 2. Validate source pages are real (not Mock/empty)
   * 3. Call AI adapter
   * 4. Persist TrainingDays, TrainingTopics, Questions, QuestionOptions
   * 5. Idempotent: if days/questions already exist for program, delete and regenerate
   */
  async generateForProgram(
    programId: string,
    documentId: string,
    instructorId: string,
    languageOverride?: "AR" | "EN"
  ): Promise<GenerationProgress> {
    // Ownership check
    const program = await prisma.trainingProgram.findFirst({
      where: { id: programId, instructorId },
    });
    if (!program) throw new Error("PROGRAM_NOT_FOUND");

    const document = await prisma.trainingDocument.findFirst({
      where: { id: documentId, programId },
    });
    if (!document) throw new Error("DOCUMENT_NOT_FOUND");

    // Load extracted pages
    const pages = await prisma.documentPage.findMany({
      where: { documentId, extractionStatus: "COMPLETED" },
      orderBy: { pageNumber: "asc" },
      select: {
        id: true,
        pageNumber: true,
        extractedText: true,
        extractionMethod: true,
        title: true,
      },
    });

    if (pages.length === 0) {
      return {
        programId, documentId,
        status: "FAILED",
        daysGenerated: 0, questionsGenerated: 0,
        errorMessage: "NO_EXTRACTED_PAGES — run document extraction first",
      };
    }

    // Build a source set from real extraction methods only. MOCK content
    // must never leak into production generation even when stale rows remain.
    const realPages = pages.filter(
      (page) =>
        page.extractionMethod !== null &&
        page.extractionMethod !== "MOCK" &&
        (page.extractedText?.trim().length ?? 0) > 50
    );

    if (realPages.length === 0) {
      return {
        programId, documentId,
        status: "FAILED",
        daysGenerated: 0, questionsGenerated: 0,
        errorMessage:
          "REAL_SOURCE_REQUIRED — لم يتم العثور على محتوى حقيقي مستخرج من الملف. أعد تحليل الملف ثم حاول التوليد.",
      };
    }

    // Build source page refs from real pages only.
    const sourcePages: SourcePageRef[] = realPages.map((page) => ({
      pageId: page.id,
      pageNumber: page.pageNumber,
      extractedText: page.extractedText ?? "",
      title: page.title,
    }));

    const req: ContentGenerationRequest = {
      pages: sourcePages,
      language: languageOverride ?? (program.language as "AR" | "EN") ?? "AR",
      programTitle: program.title,
      totalDays: TOTAL_DAYS,
      questionsPerDay: QUESTIONS_PER_DAY,
    };

    try {
      const adapters = getAdapters();
      let result: Awaited<ReturnType<AIAdapter["generate"]>> | null = null;
      const providerErrors: string[] = [];

      for (const adapter of adapters) {
        try {
          result = await adapter.generate(req);
          break;
        } catch (error) {
          providerErrors.push(
            `${adapter.name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (!result) {
        throw new Error(
          `AI_PROVIDERS_FAILED — ${providerErrors.join(" | ")}`
        );
      }

      // Validate the full AI result BEFORE mutating existing program content.
      // A partial/invalid generation must never destroy a previously working bank.
      if (req.language === "AR") {
        const invalidDay = result.days.find((day) => {
          if (!isPredominantlyArabic(day.title)) return true;
          if (!isPredominantlyArabic(day.contentSummary)) return true;
          if (day.objectives.length === 0 || day.objectives.some((objective) => !isPredominantlyArabic(objective))) return true;
          if (day.topics.length === 0 || day.topics.some((topic) => !isPredominantlyArabic(topic))) return true;
          return false;
        });

        if (invalidDay) {
          return {
            programId,
            documentId,
            status: "FAILED",
            daysGenerated: result.days.length,
            questionsGenerated: result.questions.length,
            errorMessage:
              `ARABIC_DAY_CONTENT_MISMATCH — اليوم ${invalidDay.dayNumber} يحتوي عنوانًا أو أهدافًا أو ملخصًا أو مواضيع غير عربية. لم يتم استبدال المحتوى الحالي.`,
          };
        }
      }

      const expectedTotal = TOTAL_DAYS * QUESTIONS_PER_DAY;
      const generatedCounts = new Map<number, number>();
      for (const question of result.questions) {
        generatedCounts.set(
          question.dayNumber,
          (generatedCounts.get(question.dayNumber) ?? 0) + 1
        );
      }
      const invalidQuotaDays = result.days
        .filter((day) => (generatedCounts.get(day.dayNumber) ?? 0) !== QUESTIONS_PER_DAY)
        .map(
          (day) =>
            `day ${day.dayNumber}: got ${generatedCounts.get(day.dayNumber) ?? 0}, want ${QUESTIONS_PER_DAY}`
        );

      if (
        result.days.length !== TOTAL_DAYS ||
        result.questions.length !== expectedTotal ||
        invalidQuotaDays.length > 0
      ) {
        return {
          programId,
          documentId,
          status: "FAILED",
          daysGenerated: result.days.length,
          questionsGenerated: result.questions.length,
          errorMessage: [
            `Expected ${TOTAL_DAYS} days × ${QUESTIONS_PER_DAY} q/day = ${expectedTotal} total.`,
            `Got ${result.days.length} days, ${result.questions.length} questions.`,
            ...(invalidQuotaDays.length > 0
              ? [`Per-day shortfalls: ${invalidQuotaDays.join("; ")}`]
              : []),
          ].join(" "),
        };
      }

      // Only now is it safe to replace the old content. Perform the entire
      // replacement atomically so a database error can never leave 10 days
      // with zero/partial questions.
      const pageIdByNumber = new Map(
        realPages.map((page) => [page.pageNumber, page.id])
      );

      const totalQuestions = await prisma.$transaction(
        async (tx) => {
          await tx.trainingDay.deleteMany({ where: { programId } });

          let persistedQuestions = 0;

          for (const day of result.days) {
            const dbDay = await tx.trainingDay.create({
              data: {
                programId,
                documentId,
                dayNumber: day.dayNumber,
                title: day.title,
                objectives: day.objectives,
                contentSummary: day.contentSummary,
                pageRangeStart: day.pageRangeStart,
                pageRangeEnd: day.pageRangeEnd,
                status: "DRAFT",
                topics: {
                  create: day.topics.map((title, index) => ({
                    title,
                    topicOrder: index + 1,
                  })),
                },
              },
            });

            const dayQuestions = result.questions
              .filter((question) => question.dayNumber === day.dayNumber)
              .sort((a, b) => a.questionOrder - b.questionOrder);

            if (dayQuestions.length !== QUESTIONS_PER_DAY) {
              throw new Error(
                `PERSISTENCE_QUOTA_MISMATCH_DAY_${day.dayNumber}: ${dayQuestions.length}`
              );
            }

            for (const question of dayQuestions) {
              const sourcePageId =
                pageIdByNumber.get(question.sourcePageNumber) ?? null;

              if (!sourcePageId) {
                throw new Error(
                  `SOURCE_PAGE_NOT_FOUND: day ${day.dayNumber}, question ${question.questionOrder}, page ${question.sourcePageNumber}`
                );
              }

              const dbQuestion = await tx.question.create({
                data: {
                  dayId: dbDay.id,
                  programId,
                  questionText: question.questionText,
                  questionOrder: question.questionOrder,
                  questionType: "MULTIPLE_CHOICE",
                  difficulty: question.difficulty ?? "MEDIUM",
                  explanation: question.explanation,
                  sourcePageId,
                  sourcePageStart: question.sourcePageNumber,
                  topic: question.topic,
                  language:
                    languageOverride ??
                    (program.language as "AR" | "EN"),
                  status: "DRAFT",
                  generatedBy: "AI",
                  aiModel: result.modelUsed,
                  aiPromptVersion: result.promptVersion,
                  options: {
                    create: question.options.map((option) => ({
                      optionLabel: option.label,
                      optionText: option.text,
                      displayOrder:
                        ["A", "B", "C", "D"].indexOf(option.label) + 1,
                    })),
                  },
                },
                include: {
                  options: true,
                },
              });

              const correctOption = dbQuestion.options.find(
                (option) => option.optionLabel === question.correctLabel
              );
              if (!correctOption) {
                throw new Error(
                  `CORRECT_OPTION_NOT_FOUND: day ${day.dayNumber}, question ${question.questionOrder}`
                );
              }

              await tx.question.update({
                where: { id: dbQuestion.id },
                data: { correctOptionId: correctOption.id },
              });

              persistedQuestions++;
            }
          }

          if (persistedQuestions !== TOTAL_DAYS * QUESTIONS_PER_DAY) {
            throw new Error(
              `PERSISTED_QUESTION_TOTAL_MISMATCH: ${persistedQuestions}`
            );
          }

          return persistedQuestions;
        },
        {
          maxWait: 10000,
          timeout: 120000,
        }
      );

      return {
        programId,
        documentId,
        status: "COMPLETED",
        daysGenerated: result.days.length,
        questionsGenerated: totalQuestions,
        modelUsed: result.modelUsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return {
        programId, documentId,
        status: "FAILED",
        daysGenerated: 0, questionsGenerated: 0,
        errorMessage: msg,
      };
    }
  }

  /**
   * Returns questions for a day — WITHOUT correctOptionId or correctLabel.
   * Safe to call from participant-facing APIs.
   */
  async getDayQuestionsForParticipant(dayId: string) {
    return prisma.question.findMany({
      where: { dayId, status: { in: ["APPROVED", "DRAFT"] } },
      orderBy: { questionOrder: "asc" },
      select: {
        id: true,
        questionText: true,
        questionOrder: true,
        difficulty: true,
        topic: true,
        // correctOptionId deliberately OMITTED
        options: {
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            optionLabel: true,
            optionText: true,
            displayOrder: true,
          },
        },
      },
    });
  }

  /**
   * Returns questions WITH correct answer — only for instructor/server use.
   */
  async getDayQuestionsForInstructor(dayId: string, instructorId: string) {
    // Verify ownership
    const day = await prisma.trainingDay.findFirst({
      where: { id: dayId, program: { instructorId } },
    });
    if (!day) throw new Error("NOT_FOUND");

    return prisma.question.findMany({
      where: { dayId },
      orderBy: { questionOrder: "asc" },
      include: { options: { orderBy: { displayOrder: "asc" } } },
    });
  }
}

export const contentGenerationService = new ContentGenerationService();
