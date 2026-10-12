import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { parseVideoTranscript, safeVideoUrl, type VideoCue } from "./video-transcript";
import { sha, type SourcePage } from "./grounding";

export const videoInput = z.object({ programId: z.string().uuid(), title: z.string().trim().min(3).max(120), mediaUrl: z.string().max(500), transcript: z.string().min(10).max(120_000), sourceReviewed: z.literal(true), id: z.string().uuid().optional() }).strict();
export async function saveVideo(instructorId: string, raw: unknown) {
  const data = videoInput.parse(raw);
  const mediaUrl = safeVideoUrl(data.mediaUrl);
  const transcript = parseVideoTranscript(data.transcript);
  return prisma.$transaction(async tx => {
    if (!await tx.trainingProgram.findFirst({ where: { id: data.programId, instructorId } })) throw new Error("NOT_FOUND");
    const values = { title: data.title, mediaUrl, transcript: transcript as unknown as Prisma.InputJsonValue, transcriptHash: sha(data.transcript), sourceReviewedAt: new Date() };
    if (data.id) {
      const updated = await tx.trainingVideo.updateMany({ where: { id: data.id, programId: data.programId, archivedAt: null }, data: values });
      if (!updated.count) throw new Error("NOT_FOUND");
      return { id: data.id };
    }
    if (await tx.trainingVideo.count({ where: { programId: data.programId } }) >= 100) throw new Error("VIDEO_LIMIT");
    return tx.trainingVideo.create({ data: { programId: data.programId, ...values }, select: { id: true } });
  }, { isolationLevel: "Serializable", timeout: 15000 });
}
export async function archiveVideo(instructorId: string, id: string, archived: boolean) {
  const result = await prisma.trainingVideo.updateMany({ where: { id, program: { instructorId } }, data: { archivedAt: archived ? new Date() : null } });
  if (!result.count) throw new Error("NOT_FOUND");
}
export function videoSources(video: { id: string; title: string; mediaUrl: string | null; transcript: unknown; transcriptHash: string }): SourcePage[] {
  return (video.transcript as VideoCue[]).map((cue, i) => ({ id: cue.id, documentId: video.id, fileName: video.title, pageNumber: i + 1, text: cue.text,
    extractionMethod: "VERIFIED_VIDEO_TRANSCRIPT", documentHash: video.transcriptHash, sourceKind: "VIDEO", startSeconds: cue.startSeconds, endSeconds: cue.endSeconds, ...(video.mediaUrl ? { mediaUrl: video.mediaUrl } : {}) }));
}
