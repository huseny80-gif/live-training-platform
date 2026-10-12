import { z } from "zod";
import { prisma } from "@/lib/prisma";

const nameSchema = z.string().trim().min(3).max(200).refine(name => !/[\u0000-\u001f\u007f/\\]/.test(name), "INVALID_NAME");
function requireIdle(doc: { extractionStatus: string; extractionNotes: string | null }) {
  if (doc.extractionStatus === "PROCESSING" || doc.extractionNotes?.startsWith("GENERATION_PROCESSING:")) throw new Error("LECTURE_BUSY");
}
export async function renameLecture(documentId: string, instructorId: string, name: string) {
  const fileName = nameSchema.parse(name);
  return prisma.$transaction(async tx => {
    const doc = await tx.trainingDocument.findFirst({ where: { id: documentId, program: { instructorId } } });
    if (!doc) throw new Error("NOT_FOUND");
    requireIdle(doc);
    await tx.trainingDocument.update({ where: { id: doc.id }, data: { fileName } });
    return doc.programId;
  }, { isolationLevel: "Serializable" });
}
export async function archiveLecture(documentId: string, instructorId: string, archived: boolean) {
  return prisma.$transaction(async tx => {
    const doc = await tx.trainingDocument.findFirst({ where: { id: documentId, program: { instructorId } } });
    if (!doc) throw new Error("NOT_FOUND");
    requireIdle(doc);
    await tx.trainingDocument.update({ where: { id: doc.id }, data: { archivedAt: archived ? (doc.archivedAt ?? new Date()) : null } });
    return doc.programId;
  }, { isolationLevel: "Serializable" });
}
export async function replaceLecture(oldId: string, newId: string, instructorId: string) {
  if (oldId === newId) throw new Error("INVALID_REPLACEMENT");
  return prisma.$transaction(async tx => {
    const old = await tx.trainingDocument.findFirst({ where: { id: oldId, archivedAt: null, program: { instructorId } } });
    if (!old) throw new Error("NOT_FOUND");
    requireIdle(old);
    const replacement = await tx.trainingDocument.findFirst({ where: { id: newId, archivedAt: null, programId: old.programId, program: { instructorId } } });
    if (!replacement || replacement.extractionStatus !== "COMPLETED") throw new Error("REPLACEMENT_NOT_READY");
    requireIdle(replacement);
    // The replacement already owns its file/pages. Keep all old pages and their FK references intact.
    await tx.trainingDocument.update({ where: { id: old.id }, data: { archivedAt: new Date() } });
    return old.programId;
  }, { isolationLevel: "Serializable" });
}
