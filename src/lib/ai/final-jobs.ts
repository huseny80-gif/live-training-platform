import { randomUUID } from "node:crypto";
import { isTransactionConflict } from "@/lib/transaction-conflict";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ClaudeAIAdapter } from "./adapters/claude";
import type { AIAdapter } from "./types";
import { generationState } from "./generation-state";
// Reserved group 0 stores the final question bank separately from training days 1–10.
const PREFIX = "GENERATION_PROCESSING:";
export async function recoverFinalJob(programId: string, instructorId: string) {
  await prisma.trainingDay.updateMany({ where: { programId, dayNumber: 0, program: { instructorId }, contentSummary: { startsWith: PREFIX }, updatedAt: { lte: new Date(Date.now() - 360_000) } }, data: { contentSummary: "GENERATION_FAILED:PROCESSING_TIMEOUT" } });
}
export async function finalJobStatus(programId: string, instructorId: string) {
  if (!await prisma.trainingProgram.count({ where: { id: programId, instructorId } })) return null;
  await recoverFinalJob(programId, instructorId);
  const day = await prisma.trainingDay.findUnique({ where: { programId_dayNumber: { programId, dayNumber: 0 } }, select: { contentSummary: true, _count: { select: { questions: true } } } });
  return { state: generationState(day?.contentSummary), questions: day?._count.questions ?? 0 };
}
const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export class FinalGenerationJobs {
  constructor(private adapter: AIAdapter = new ClaudeAIAdapter()) {}
  async claim(programId: string, documentId: string, instructorId: string) {
    await recoverFinalJob(programId, instructorId);
    for (let attempt = 0; attempt < 5; attempt++) {
      try { return await prisma.$transaction(async tx => {
        const document = await tx.trainingDocument.findFirst({ where: { id: documentId, programId, program: { instructorId } }, select: { extractionStatus: true } });
        if (!document) return { status: "NOT_FOUND" };
        if (document.extractionStatus !== "COMPLETED") return { status: "EXTRACTION_REQUIRED" };
        const day = await tx.trainingDay.findUnique({ where: { programId_dayNumber: { programId, dayNumber: 0 } }, include: { _count: { select: { questions: true } } } });
        if (day?._count.questions) return { status: "CONTENT_ALREADY_EXISTS" };
        if (day?.contentSummary?.startsWith(PREFIX)) return { status: "PROCESSING" };
        const runId = randomUUID();
        await tx.trainingDay.upsert({ where: { programId_dayNumber: { programId, dayNumber: 0 } },
          create: { programId, documentId, dayNumber: 0, title: "أسئلة الاختبار النهائي", objectives: [], contentSummary: `${PREFIX}${runId}:0` },
          update: { documentId, contentSummary: `${PREFIX}${runId}:0` },
        });
        return { status: "STARTED", runId };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) { if (!isTransactionConflict(error) || attempt === 4) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.min(800, 200 * 2 ** attempt))); }
    }
    throw new Error("CLAIM_FAILED");
  }
  async run(programId: string, documentId: string, instructorId: string, runId: string) {
    const lease = `${PREFIX}${runId}:`;
    const where = { programId, dayNumber: 0, program: { instructorId }, contentSummary: { startsWith: lease } };
    try {
      if (!await prisma.trainingDay.count({ where })) return;
      const program = await prisma.trainingProgram.findFirstOrThrow({ where: { id: programId, instructorId } });
      const pages = await prisma.documentPage.findMany({ where: { documentId, document: { programId, extractionStatus: "COMPLETED" }, extractionStatus: "COMPLETED", OR: [{ extractionMethod: null }, { extractionMethod: { not: "MOCK" } }] }, orderBy: { pageNumber: "asc" } });
      const source = pages.filter(p => (p.extractedText?.trim().length ?? 0) > 0);
      if (!source.some(p => p.extractedText!.trim().length > 50)) throw new Error("NO_EXTRACTED_PAGES");
      const existing = await prisma.question.findMany({ where: { programId }, select: { questionText: true } });
      const result = await this.adapter.generate({ pages: source.map(p => ({ pageId: p.id, pageNumber: p.pageNumber, extractedText: p.extractedText!, title: p.title })), language: program.language, programTitle: program.title,
        totalDays: 7, questionsPerDay: 5, questionTypesByDay: { 1: "MULTIPLE_CHOICE", 2: "MULTIPLE_CHOICE", 3: "MULTIPLE_CHOICE", 4: "TRUE_FALSE", 5: "TRUE_FALSE", 6: "TRUE_FALSE", 7: "TRUE_FALSE" }, assessmentType: "FINAL", existingQuestionTexts: existing.map(q => q.questionText),
        onProgress: async completed => { if (!(await prisma.trainingDay.updateMany({ where, data: { contentSummary: `${lease}${completed}` } })).count) throw new Error("GENERATION_LEASE_LOST"); },
      });
      if (result.days.length !== 7 || result.questions.length !== 35 || [1, 2, 3, 4, 5, 6, 7].some(n => result.days.filter(d => d.dayNumber === n).length !== 1 || result.questions.filter(q => q.dayNumber === n).length !== 5)) throw new Error("AI_INCOMPLETE_CONTENT");
      const pageIds = new Map(source.map(p => [p.pageNumber, p.id])); const seen = new Set(existing.map(q => normalize(q.questionText))); const arabic = /[\u0600-\u06FF]/;
      for (const type of ["MULTIPLE_CHOICE", "TRUE_FALSE"] as const) {
        const sections = result.days.filter(d => (d.dayNumber <= 3 ? "MULTIPLE_CHOICE" : "TRUE_FALSE") === type);
        const covered = new Set(sections.flatMap(d => d.sourcePages));
        if (source.some(p => !covered.has(p.pageNumber)) || sections.some(d => d.sourcePages.some(n => !pageIds.has(n)))) throw new Error("AI_INCOMPLETE_SOURCE_COVERAGE");
      }
      for (const q of result.questions) {
        const day = result.days.find(d => d.dayNumber === q.dayNumber)!;
        const type = q.dayNumber <= 3 ? "MULTIPLE_CHOICE" : "TRUE_FALSE";
        const labels = type === "TRUE_FALSE" ? ["A", "B"] : ["A", "B", "C", "D"];
        if (q.questionType !== type) throw new Error("AI_INVALID_QUESTION_TYPE");
        if (type === "TRUE_FALSE" && (q.options.find(o => o.label === "A")?.text !== (program.language === "AR" ? "صح" : "True") || q.options.find(o => o.label === "B")?.text !== (program.language === "AR" ? "خطأ" : "False"))) throw new Error("AI_INVALID_CONTENT");
        if (!q.questionText.trim() || !q.explanation.trim() || !pageIds.has(q.sourcePageNumber) || !day.sourcePages.includes(q.sourcePageNumber) || q.options.length !== labels.length || labels.some(label => q.options.filter(o => o.label === label && o.text.trim()).length !== 1) || !q.options.some(o => o.label === q.correctLabel)) throw new Error("AI_INVALID_CONTENT");
        if (program.language === "AR" && (!arabic.test(q.questionText) || q.options.some(o => !arabic.test(o.text)))) throw new Error("AI_LANGUAGE_MISMATCH_AR");
        const key = normalize(q.questionText); if (seen.has(key)) throw new Error("AI_DUPLICATE_FINAL_QUESTION"); seen.add(key);
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        try { await prisma.$transaction(async tx => {
        const bank = await tx.trainingDay.findFirst({ where, include: { _count: { select: { questions: true } } } });
        if (!bank || bank._count.questions) throw new Error("GENERATION_LEASE_LOST");
        for (const [index, q] of result.questions.entries()) {
          const question = await tx.question.create({ data: { programId, dayId: bank.id, questionType: q.questionType, questionText: q.questionText, questionOrder: index + 1, explanation: q.explanation, topic: q.topic, difficulty: q.difficulty, language: program.language,
            sourcePageId: pageIds.get(q.sourcePageNumber), sourcePageStart: q.sourcePageNumber, sourcePageEnd: q.sourcePageNumber, aiModel: result.modelUsed, aiPromptVersion: `${result.promptVersion}:FINAL`,
            options: { create: q.options.map((o, i) => ({ optionLabel: o.label, optionText: o.text, displayOrder: i + 1 })) },
          }, include: { options: true } });
          await tx.question.update({ where: { id: question.id }, data: { correctOptionId: question.options.find(o => o.optionLabel === q.correctLabel)!.id } });
        }
        await tx.trainingDay.update({ where: { id: bank.id }, data: { contentSummary: "GENERATION_COMPLETED:7:35" } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
        break;
        } catch (error) {
          if (!isTransactionConflict(error) || attempt === 4) throw error;
          await new Promise(resolve => setTimeout(resolve, Math.min(800, 200 * 2 ** attempt)));
        }
      }
      console.info("[final-generation] completed", { programId, questions: 35 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "GENERATION_FAILED";
      await prisma.trainingDay.updateMany({ where, data: { contentSummary: `GENERATION_FAILED:${message}` } });
      console.error("[final-generation] failed", { programId, code: "GENERATION_FAILED" });
    }
  }
}
export const finalGenerationJobs = new FinalGenerationJobs();
