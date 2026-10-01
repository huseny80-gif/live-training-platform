import { prisma } from "@/lib/prisma";

// The invocation is limited to 300 seconds. A six-minute-old claim cannot still
// belong to a live invocation; conditional ownership/status/date checks prevent
// a poll or concurrent retry from resetting a newer job.
export const PROCESSING_STALE_MS = 6 * 60 * 1000;
export async function recoverStaleDocument(documentId: string, instructorId: string, now = new Date()) {
  return prisma.trainingDocument.updateMany({
    where: {
      id: documentId, program: { instructorId }, extractionStatus: "PROCESSING",
      updatedAt: { lte: new Date(now.getTime() - PROCESSING_STALE_MS) },
    },
    data: { extractionStatus: "FAILED", extractionNotes: "PROCESSING_TIMEOUT" },
  });
}
