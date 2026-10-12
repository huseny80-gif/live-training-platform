import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { generateGroundedMaterial } from "./ai";
import { gradeMaterial, studentMaterial, type Material, type SourcePage } from "./grounding";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const STALE_MS = 10 * 60_000;
export async function recoverMaterialJobs(instructorId: string) {
  await prisma.examMaterialBatch.updateMany({ where: {
    program: { instructorId }, status: "GENERATING", createdAt: { lt: new Date(Date.now() - STALE_MS) },
  }, data: { status: "FAILED", errorCode: "GENERATION_TIMEOUT", completedAt: new Date() } });
}
export async function reserveMaterial(instructorId: string, programId: string, documentIds: string[], count: number) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("AI_NOT_CONFIGURED");
  return prisma.$transaction(async tx => {
    const program = await tx.trainingProgram.findFirst({ where: { id: programId, instructorId } });
    if (!program) throw new Error("NOT_FOUND");
    if (await tx.examMaterialBatch.count({ where: { programId, status: "GENERATING" } })) throw new Error("GENERATION_BUSY");
    if (await tx.examMaterialBatch.count({ where: { program: { instructorId }, createdAt: { gt: new Date(Date.now() - 15 * 60_000) } } }) >= 5) throw new Error("GENERATION_RATE_LIMIT");
    const documents = await tx.trainingDocument.findMany({ where: { id: { in: documentIds }, programId, extractionStatus: "COMPLETED" },
      include: { pages: { orderBy: { pageNumber: "asc" } } } });
    if (documents.length !== documentIds.length || documents.length > count) throw new Error("INVALID_LECTURES");
    // No OCR/vision/mock generated text can satisfy the literal-native-source contract.
    const pages: SourcePage[] = [];
    for (const doc of documents) {
      if (!doc.pages.length || doc.pages.some(p => p.extractionStatus !== "COMPLETED" || p.extractionMethod !== "NATIVE_TEXT")) throw new Error("NATIVE_TEXT_REQUIRED");
      const textPages = doc.pages.filter(p => p.extractedText?.trim());
      if (!textPages.length) throw new Error("INSUFFICIENT_SOURCE");
      pages.push(...textPages.map(p => ({ id: p.id, documentId: doc.id, fileName: doc.fileName, pageNumber: p.pageNumber, text: p.extractedText! })));
    }
    if (pages.reduce((n, p) => n + p.text.length, 0) > 120_000) throw new Error("SOURCE_TOO_LARGE");
    return tx.examMaterialBatch.create({ data: { programId, sources: json(pages) } });
  }, { isolationLevel: "Serializable", timeout: 15000 });
}
export async function runMaterialJob(id: string, count: number) {
  try {
    const batch = await prisma.examMaterialBatch.findFirst({ where: { id, status: "GENERATING" } });
    if (!batch) return;
    const generated = await generateGroundedMaterial(batch.sources as unknown as SourcePage[], count);
    await prisma.examMaterialBatch.updateMany({ where: { id, status: "GENERATING" }, data: {
      content: json(generated.content), instructorGuide: json(generated.instructorGuide), status: "READY", completedAt: new Date(),
    } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "GENERATION_FAILED";
    const known = ["AI_NOT_CONFIGURED", "INSUFFICIENT_SOURCE", "SOURCE_TOO_LARGE", "GROUNDING_REJECTED", "AI_INCOMPLETE"];
    await prisma.examMaterialBatch.updateMany({ where: { id, status: "GENERATING" }, data: {
      status: "FAILED", errorCode: known.includes(code) ? code : "GENERATION_FAILED", completedAt: new Date(),
    } });
  }
}
export async function publishMaterial(id: string, instructorId: string, publish: boolean) {
  const result = await prisma.examMaterialBatch.updateMany({ where: { id, status: "READY", program: { instructorId } },
    data: publish ? { publishedAt: new Date(), shareToken: randomBytes(24).toString("hex") } : { publishedAt: null, shareToken: null } });
  if (!result.count) throw new Error("NOT_FOUND");
}
export async function publishedMaterial(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  return prisma.examMaterialBatch.findFirst({ where: { shareToken: token, publishedAt: { not: null }, status: "READY" } });
}
export async function publicMaterial(token: string) {
  const batch = await publishedMaterial(token);
  if (!batch?.content) return null;
  // Explicit whitelist. Never serialize instructorGuide, source snapshots, or correctIndex here.
  return { id: batch.id, content: studentMaterial(batch.content as unknown as Material) };
}
export async function submitMaterial(token: string, tokenHash: string, answers: Record<string, number>) {
  return prisma.$transaction(async tx => {
    const batch = await tx.examMaterialBatch.findFirst({ where: { shareToken: token, status: "READY", publishedAt: { not: null } } });
    if (!batch?.content) throw new Error("NOT_FOUND");
    const attempt = await tx.examMaterialAttempt.findFirst({ where: { batchId: batch.id, tokenHash, createdAt: { gt: new Date(Date.now() - 12 * 60 * 60_000) } } });
    if (!attempt) throw new Error("UNAUTHORIZED");
    if (attempt.report) return attempt.report;
    const report = gradeMaterial(batch.content as unknown as Material, answers);
    await tx.examMaterialAttempt.update({ where: { id: attempt.id }, data: { answers: json(answers), report: json(report), completedAt: new Date() } });
    return report;
  }, { isolationLevel: "Serializable" });
}
