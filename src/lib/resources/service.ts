import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defaultCategories, resourceMimeTypes, maxResourceSize } from "./types";
export const titleSchema = z.string().trim().min(3).max(160);
export const reserveSchema = z.object({ programId: z.string().uuid(), categoryKey: z.string().min(1).max(80), title: titleSchema, fileName: z.string().min(1).max(240).refine(v => !/[\u0000-\u001f\u007f/\\]/u.test(v)), sizeBytes: z.number().int().min(1).max(maxResourceSize) }).strict();
export async function reserveResource(owner: string, raw: unknown) {
  const input = reserveSchema.parse(raw);
  const extension = input.fileName.split(".").at(-1)?.toLowerCase() ?? "";
  const mimeType = resourceMimeTypes[extension]; if (!mimeType) throw new Error("UNSUPPORTED_FILE");
  if (!['mp4', 'webm'].includes(extension) && input.sizeBytes > 30 * 1024 * 1024) throw new Error("FILE_TOO_LARGE");
  return prisma.$transaction(async tx => {
    if (!await tx.trainingProgram.findFirst({ where: { id: input.programId, instructorId: owner } })) throw new Error("NOT_FOUND");
    const builtin = defaultCategories.find(c => c.key === input.categoryKey);
    if (builtin) await tx.resourceCategory.upsert({ where: { programId_key: { programId: input.programId, key: builtin.key } }, update: {}, create: { programId: input.programId, ...builtin } });
    else if (!await tx.resourceCategory.findFirst({ where: { programId: input.programId, key: input.categoryKey } })) throw new Error("INVALID_CATEGORY");
    if (await tx.resourceFile.count({ where: { programId: input.programId } }) >= 1000) throw new Error("RESOURCE_LIMIT");
    if (await tx.resourceFile.count({ where: { programId: input.programId, createdAt: { gt: new Date(Date.now() - 15 * 60_000) } } }) >= 20) throw new Error("RESOURCE_RATE_LIMIT");
    const id = randomUUID();
    const file = await tx.resourceFile.create({ data: { ...input, id, mimeType, blobPath: `resources/${input.programId}/${id}.${extension}` } });
    return { id: file.id, pathname: file.blobPath, mimeType: file.mimeType, mode: process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "direct" };
  }, { isolationLevel: "Serializable" });
}
export async function resourceForOwner(id: string, owner: string) {
  const file = await prisma.resourceFile.findFirst({ where: { id, program: { instructorId: owner } } });
  if (!file) throw new Error("NOT_FOUND"); return file;
}
export function validateResourceBlob(url: string, pathname: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/i.test(parsed.hostname) || parsed.pathname !== `/${pathname}`) throw new Error("INVALID_BLOB");
}
export async function completeResource(id: string, owner: string, url: string) {
  const file = await resourceForOwner(id, owner);
  if (file.archivedAt) throw new Error("NOT_FOUND");
  validateResourceBlob(url, file.blobPath);
  if (file.status === "READY") { if (file.storagePath !== url) throw new Error("INVALID_BLOB"); return; }
  if (file.createdAt.getTime() < Date.now() - 60 * 60_000) throw new Error("UPLOAD_EXPIRED");
  const { head } = await import("@vercel/blob");
  // Use the store-scoped pathname, never fetch a client-controlled host.
  const info = await head(file.blobPath);
  if (info.url !== url || info.size !== file.sizeBytes || info.contentType !== file.mimeType) throw new Error("INVALID_BLOB");
  await prisma.resourceFile.updateMany({ where: { id, status: "PENDING", archivedAt: null, program: { instructorId: owner } }, data: { storagePath: info.url, status: "READY" } });
}
export async function manageResource(id: string, owner: string, action: "delete" | "restore" | "rename", title?: string) {
  const file = await resourceForOwner(id, owner);
  if (file.status !== "READY") throw new Error("NOT_FOUND");
  const updated = await prisma.resourceFile.updateMany({ where: { id: file.id, status: "READY", program: { instructorId: owner } }, data: action === "rename" ? { title: titleSchema.parse(title) } : { archivedAt: action === "delete" ? new Date() : null } });
  if (!updated.count) throw new Error("NOT_FOUND");
}
export async function addCategory(owner: string, programId: string, name: string) {
  const title = titleSchema.parse(name);
  return prisma.$transaction(async tx => {
    if (!await tx.trainingProgram.findFirst({ where: { id: programId, instructorId: owner } })) throw new Error("NOT_FOUND");
    if (await tx.resourceCategory.count({ where: { programId } }) >= 30) throw new Error("CATEGORY_LIMIT");
    return tx.resourceCategory.create({ data: { programId, key: randomUUID(), name: title, icon: "📁" } });
  }, { isolationLevel: "Serializable" });
}
