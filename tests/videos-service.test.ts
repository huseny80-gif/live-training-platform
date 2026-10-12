import assert from "node:assert/strict";
import { pages } from "./fixtures/exam-material";
async function run() {
  const programId = "10000000-0000-4000-8000-000000000001", videoId = "10000000-0000-4000-8000-000000000002";
  const state: { video?: Record<string, unknown>; snapshots: Record<string, unknown>[] } = { snapshots: [] };
  const tx = {
    trainingProgram: { findFirst: async ({ where }: { where: { id: string; instructorId: string } }) => where.id === programId && where.instructorId === "owner" ? { id: programId } : null },
    trainingDocument: { findMany: async () => [] },
    trainingVideo: {
      count: async () => state.video ? 1 : 0,
      create: async ({ data }: { data: Record<string, unknown> }) => { state.video = { id: videoId, archivedAt: null, ...data }; return { id: videoId }; },
      findMany: async ({ where }: { where: { id: { in: string[] }; programId: string } }) => state.video && where.id.in.includes(videoId) && where.programId === state.video.programId && !state.video.archivedAt ? [state.video] : [],
      updateMany: async ({ where, data }: { where: { id: string; programId?: string; archivedAt?: null; program?: { instructorId: string } }; data: Record<string, unknown> }) => {
        if (!state.video || where.id !== videoId || (where.programId && where.programId !== state.video.programId) || (where.program && where.program.instructorId !== "owner") || (where.archivedAt === null && state.video.archivedAt)) return { count: 0 };
        Object.assign(state.video, data); return { count: 1 };
      },
    },
    examMaterialBatch: { count: async () => 0, create: async ({ data }: { data: Record<string, unknown> }) => { state.snapshots.push(structuredClone(data)); return { id: "batch", ...data }; } },
  };
  Object.assign(globalThis, { prisma: { ...tx, $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } });
  const { saveVideo, archiveVideo } = await import("../src/lib/exam-material/videos");
  const { reserveMaterial } = await import("../src/lib/exam-material/service");
  const transcript = pages[0].text.split("\n").map((text, i) => `${i + 1}\n00:0${i}:00,000 --> 00:0${i}:20,000\n${text}`).join("\n\n");
  const input = { programId, title: "فيديو تدريبي", mediaUrl: "https://youtu.be/abcdefghijk", transcript, sourceReviewed: true };
  await assert.rejects(saveVideo("other", input), /NOT_FOUND/);
  await assert.rejects(saveVideo("owner", { ...input, sourceReviewed: false }));
  assert.equal(state.video, undefined);
  await saveVideo("owner", input);
  await reserveMaterial("owner", programId, [], 3, [videoId]);
  const snapshot = structuredClone(state.snapshots[0].sources) as { text: string; startSeconds: number }[];
  assert.equal(snapshot[0].startSeconds, 0); assert.equal(snapshot[0].text, pages[0].text.split("\n")[0]);
  await assert.rejects(reserveMaterial("other", programId, [], 3, [videoId]), /NOT_FOUND/);
  await assert.rejects(reserveMaterial("owner", programId, [], 3, ["unknown"]), /INVALID_LECTURES/);
  await saveVideo("owner", { ...input, id: videoId, transcript: transcript.replace("المحاضرة", "المادة") });
  assert.deepEqual(state.snapshots[0].sources, snapshot, "Updating the video cannot rewrite an existing exam snapshot");
  await assert.rejects(archiveVideo("other", videoId, true), /NOT_FOUND/);
  await archiveVideo("owner", videoId, true);
  await assert.rejects(reserveMaterial("owner", programId, [], 3, [videoId]), /INVALID_LECTURES/);
  assert.deepEqual(state.snapshots[0].sources, snapshot);
  await archiveVideo("owner", videoId, false);
  await reserveMaterial("owner", programId, [], 3, [videoId]);
  assert.equal(state.snapshots.length, 2);
  console.log("PASS: video ownership and transcript attestation enforced; foreign/archived IDs rejected; edit and soft deletion preserve prior exam snapshots; restore enables selection (mock DB).");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
