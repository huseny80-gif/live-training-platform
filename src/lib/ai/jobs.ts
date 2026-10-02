import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { contentGenerationService } from "./service";
import type { ContentGenerationService } from "./service";

const PREFIX = "GENERATION_PROCESSING:";
const STALE_MS = 6 * 60 * 1000;
export async function recoverGenerationJobs(instructorId: string, scope: { programId?: string; documentId?: string }, now = new Date()) {
  return prisma.trainingDocument.updateMany({
    where: { ...(scope.documentId ? { id: scope.documentId } : {}), ...(scope.programId ? { programId: scope.programId } : {}), program: { instructorId }, extractionStatus: "COMPLETED", extractionNotes: { startsWith: PREFIX }, updatedAt: { lte: new Date(now.getTime() - STALE_MS) } },
    data: { extractionNotes: "GENERATION_FAILED:PROCESSING_TIMEOUT" },
  });
}

export class GenerationJobs {
  constructor(private readonly generator: Pick<ContentGenerationService, "generateForProgram"> = contentGenerationService) {}

  async claim(documentId: string, programId: string, instructorId: string): Promise<{ status: string; runId?: string }> {
    await recoverGenerationJobs(instructorId, { programId });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await prisma.$transaction(async tx => {
          const document = await tx.trainingDocument.findFirst({ where: { id: documentId, programId, program: { instructorId } } });
          if (!document) return { status: "NOT_FOUND" };
          if (document.extractionStatus !== "COMPLETED") return { status: "EXTRACTION_REQUIRED" };
          const occupied = await tx.trainingProgram.count({ where: { id: programId, OR: [{ days: { some: { questions: { some: {} } } } }, { sessions: { some: {} } }] } });
          if (occupied) return { status: "CONTENT_ALREADY_EXISTS" };
          if (document.extractionNotes?.startsWith(PREFIX)) return { status: "PROCESSING" };
          if (await tx.trainingDocument.count({ where: { programId, extractionNotes: { startsWith: PREFIX } } })) return { status: "PROGRAM_PROCESSING" };
          const realPage = await tx.documentPage.findFirst({ where: { documentId, extractionStatus: "COMPLETED", OR: [{ extractionMethod: null }, { extractionMethod: { not: "MOCK" } }], extractedText: { not: "" } } });
          if (!realPage?.extractedText?.trim()) return { status: "NO_EXTRACTED_PAGES" };
          const runId = randomUUID();
          await tx.trainingDocument.update({ where: { id: documentId }, data: { extractionNotes: `${PREFIX}${runId}:0` } });
          return { status: "STARTED", runId };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
      }
    }
    throw new Error("CLAIM_FAILED");
  }

  async run(documentId: string, programId: string, instructorId: string, runId: string) {
    const lease = `${PREFIX}${runId}:`;
    const update = async (notes: string) => prisma.trainingDocument.updateMany({
      where: { id: documentId, programId, program: { instructorId }, extractionStatus: "COMPLETED", extractionNotes: { startsWith: lease } },
      data: { extractionNotes: notes },
    });
    try {
      const owned = await prisma.trainingDocument.count({ where: { id: documentId, extractionNotes: { startsWith: lease }, program: { instructorId } } });
      if (!owned) return;
      const result = await this.generator.generateForProgram(programId, documentId, instructorId, {
        onProgress: async completedDays => {
          const updated = await update(`${lease}${completedDays}`);
          if (!updated.count) throw new Error("GENERATION_LEASE_LOST");
        },
      });
      await update(result.status === "COMPLETED"
        ? `GENERATION_COMPLETED:${result.daysGenerated}:${result.questionsGenerated}`
        : `GENERATION_FAILED:${result.errorMessage ?? "GENERATION_FAILED"}`);
      console.info("[generation] finished", { documentId, status: result.status, questions: result.questionsGenerated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "GENERATION_FAILED";
      await update(`GENERATION_FAILED:${message}`);
      console.error("[generation] failed", { documentId, code: "GENERATION_FAILED" });
    }
  }
}
export const generationJobs = new GenerationJobs();
