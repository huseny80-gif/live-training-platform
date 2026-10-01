// ContentGenerationService — orchestrates:
//   DocumentPage[] → AI generation → TrainingDay[] + Question[] + Option[] persistence
//
// Security: correct answer (correctOptionId) is stored in DB but NEVER
// returned by any method that will reach participant/client APIs.
// All methods here are server-only (called from Server Actions).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AIAdapter, ContentGenerationRequest, SourcePageRef } from "./types";
import { ClaudeAIAdapter } from "./adapters/claude";

const TOTAL_DAYS = 10;
const QUESTIONS_PER_DAY = 5;

// Adapter registry — swap here to change provider
function getAdapter(): AIAdapter {
  return new ClaudeAIAdapter();
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
  constructor(private readonly adapter?: AIAdapter) {}
  /**
   * Full pipeline:
   * 1. Load COMPLETED DocumentPage rows for the document
   * 2. Validate source pages are real (not Mock/empty)
   * 3. Call AI adapter
   * 4. Persist TrainingDays, TrainingTopics, Questions, QuestionOptions
   * 5. Validate first; fill empty days atomically while preserving existing content.
   */
  async generateForProgram(
    programId: string,
    documentId: string,
    instructorId: string
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
      where: {
        documentId,
        extractionStatus: "COMPLETED",
        ...(process.env.NODE_ENV === "production" ? {
          OR: [{ extractionMethod: null }, { extractionMethod: { not: "MOCK" } }],
        } : {}),
      },
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

    // Production excludes synthetic pages and requires usable real content.
    // Development can use mock extraction when LlamaParse is not configured.
    const hasRealContent = pages.some(
      (p) => p.extractionMethod !== "MOCK" && (p.extractedText?.trim().length ?? 0) > 50
    );
    const llamaConfigured = !!process.env.LLAMA_CLOUD_API_KEY;
    if ((process.env.NODE_ENV === "production" || llamaConfigured) && !hasRealContent) {
      return {
        programId, documentId,
        status: "FAILED",
        daysGenerated: 0, questionsGenerated: 0,
        errorMessage: "MOCK_ONLY_CONTENT — real extraction (LlamaParse) required before generating questions",
      };
    }

    // Build source page refs
    const sourcePages: SourcePageRef[] = pages.filter(p => p.extractedText?.trim()).map((p) => ({
      pageId: p.id,
      pageNumber: p.pageNumber,
      extractedText: p.extractedText ?? "",
      title: p.title,
    }));

    const req: ContentGenerationRequest = {
      pages: sourcePages,
      language: (program.language as "AR" | "EN") ?? "AR",
      programTitle: program.title,
      totalDays: TOTAL_DAYS,
      questionsPerDay: QUESTIONS_PER_DAY,
    };

    try {
      // Regeneration must never cascade-delete questions or session history.
      const occupied = await prisma.trainingProgram.count({
        where: { id: programId, OR: [{ days: { some: { questions: { some: {} } } } }, { sessions: { some: {} } }] },
      });
      if (occupied) throw new Error("CONTENT_ALREADY_EXISTS");
      const adapter = this.adapter ?? getAdapter();
      const result = await adapter.generate(req);

      // Validate the whole response BEFORE writing even one day or question.
      const expectedDays = Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1);
      if (result.days.length !== TOTAL_DAYS ||
          expectedDays.some(n => result.days.filter(d => d.dayNumber === n).length !== 1) ||
          result.questions.length !== TOTAL_DAYS * QUESTIONS_PER_DAY ||
          expectedDays.some(n => result.questions.filter(q => q.dayNumber === n).length !== QUESTIONS_PER_DAY)) {
        throw new Error("AI_INCOMPLETE_CONTENT");
      }
      const pageNumbers = new Set(sourcePages.map(p => p.pageNumber));
      const arabic = /[\u0600-\u06FF]/;
      for (const day of result.days) {
        const questions = result.questions.filter(q => q.dayNumber === day.dayNumber);
        if (!day.title.trim() || !day.sourcePages.length || day.sourcePages.some(n => !pageNumbers.has(n)) ||
            new Set(questions.map(q => q.questionOrder)).size !== QUESTIONS_PER_DAY) {
          throw new Error("AI_INVALID_CONTENT");
        }
        for (const q of questions) {
          if (!q.questionText.trim() || !q.explanation.trim() || !day.sourcePages.includes(q.sourcePageNumber) ||
              q.options.length !== 4 || ["A", "B", "C", "D"].some(label => q.options.filter(o => o.label === label && o.text.trim()).length !== 1) ||
              !q.options.some(o => o.label === q.correctLabel) || !Number.isInteger(q.questionOrder) ||
              q.questionOrder < 1 || q.questionOrder > QUESTIONS_PER_DAY) {
            throw new Error("AI_INVALID_CONTENT");
          }
          if (program.language === "AR" && (!arabic.test(q.questionText) || q.options.some(o => !arabic.test(o.text)))) {
            throw new Error("AI_LANGUAGE_MISMATCH_AR");
          }
        }
      }

      // Build pageId lookup
      const pageIdByNumber = new Map(pages.map((p) => [p.pageNumber, p.id]));

      let totalQuestions = 0;
      await prisma.$transaction(async tx => {
        const occupied = await tx.trainingProgram.count({
          where: { id: programId, OR: [{ days: { some: { questions: { some: {} } } } }, { sessions: { some: {} } }] },
        });
        if (occupied) throw new Error("CONTENT_ALREADY_EXISTS");

        // Persist days → topics → questions → options
        for (const day of result.days) {
          const existingDay = await tx.trainingDay.findUnique({ where: { programId_dayNumber: { programId, dayNumber: day.dayNumber } } });
          const dbDay = await tx.trainingDay.upsert({
            where: { programId_dayNumber: { programId, dayNumber: day.dayNumber } },
            update: {
            documentId,
            objectives: existingDay?.objectives.length ? existingDay.objectives : day.objectives,
              contentSummary: existingDay?.contentSummary || day.contentSummary,
              pageRangeStart: existingDay?.pageRangeStart ?? day.pageRangeStart,
              pageRangeEnd: existingDay?.pageRangeEnd ?? day.pageRangeEnd,
            },
            create: {
              programId,
              documentId,
              dayNumber: day.dayNumber,
              title: day.title,
              objectives: day.objectives,
              contentSummary: day.contentSummary,
              pageRangeStart: day.pageRangeStart,
              pageRangeEnd: day.pageRangeEnd,
              status: "DRAFT",
            },
          });

          // Preserve any existing instructor topics.
          const topicCount = await tx.trainingTopic.count({ where: { dayId: dbDay.id } });
          for (let ti = 0; topicCount === 0 && ti < day.topics.length; ti++) {
            await tx.trainingTopic.create({
              data: { dayId: dbDay.id, title: day.topics[ti], topicOrder: ti + 1 },
            });
          }

          // Questions for this day
          const dayQuestions = result.questions.filter((q) => q.dayNumber === day.dayNumber);

          for (const q of dayQuestions) {
            const sourcePageId = pageIdByNumber.get(q.sourcePageNumber) ?? null;

            // Create question WITHOUT correctOptionId first (circular FK: question → option)
            const dbQuestion = await tx.question.create({
              data: {
                dayId: dbDay.id,
                programId,
                questionText: q.questionText,
                questionOrder: q.questionOrder,
                questionType: "MULTIPLE_CHOICE",
                difficulty: q.difficulty ?? "MEDIUM",
                explanation: q.explanation,
                sourcePageId,
                sourcePageStart: q.sourcePageNumber,
                topic: q.topic,
                language: program.language as "AR" | "EN",
                status: "DRAFT",
                generatedBy: "AI",
                aiModel: result.modelUsed,
                aiPromptVersion: result.promptVersion,
              },
            });

            // Create options
            const optionIds: Record<string, string> = {};
            for (const opt of q.options) {
              const dbOpt = await tx.questionOption.create({
                data: {
                  questionId: dbQuestion.id,
                  optionLabel: opt.label,
                  optionText: opt.text,
                  displayOrder: ["A", "B", "C", "D"].indexOf(opt.label) + 1,
                },
              });
              optionIds[opt.label] = dbOpt.id;
            }

            // Set correctOptionId — stored in DB, never returned to participants
            await tx.question.update({
              where: { id: dbQuestion.id },
              data: { correctOptionId: optionIds[q.correctLabel] },
            });

            totalQuestions++;
          }

        }

      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });

      return {
        programId, documentId,
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
