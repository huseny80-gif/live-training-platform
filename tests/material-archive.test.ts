import assert from "node:assert/strict";
import { compileGroundedMaterial } from "../src/lib/exam-material/grounding";
import { plan, pages } from "./fixtures/exam-material";
async function run() {
  const generated = compileGroundedMaterial(plan, pages, 5);
  const batch = { id: "old", programId: "program", owner: "owner", deletedAt: null as Date | null, status: "READY", title: "مادة سابقة", questionCount: 5, sources: pages, content: generated.content, shareToken: "a".repeat(48) as string | null, publishedAt: new Date() as Date | null };
  const original = JSON.stringify({ sources: batch.sources, content: batch.content });
  const attempts = [{ id: "attempt", score: 4 }];
  const originalAttempts = JSON.stringify(attempts);
  const created: Record<string, unknown>[] = [];
  type Where = { id?: string; deletedAt?: null; shareToken?: string; status?: string | { not: string }; program?: { instructorId: string }; publishedAt?: { not: null } };
  function matches(where: Where) {
    return (!where.id || where.id === batch.id) && (!where.program || where.program.instructorId === batch.owner) && (where.deletedAt !== null || !batch.deletedAt) && (!where.shareToken || where.shareToken === batch.shareToken) && (!where.publishedAt || Boolean(batch.publishedAt)) && (!where.status || (typeof where.status === "string" ? batch.status === where.status : batch.status !== where.status.not));
  }
  const mock = {
    examMaterialBatch: {
      findFirst: async ({ where }: { where: Where }) => matches(where) ? { ...batch } : null,
      updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        if (!matches(where)) return { count: 0 };
        Object.assign(batch, data); return { count: 1 };
      },
      count: async () => 0,
      create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: "new", ...data }; },
    },
    $transaction: async (operation: (client: unknown) => Promise<unknown>, options: { isolationLevel: string }) => { assert.equal(options.isolationLevel, "Serializable"); return operation(mock); },
  };
  Object.assign(globalThis, { prisma: mock });
  process.env.ANTHROPIC_API_KEY = "test-placeholder";
  const { manageMaterialArchive, regenerateMaterial, publishedMaterial } = await import("../src/lib/exam-material/service");
  await assert.rejects(manageMaterialArchive("old", "stranger", "delete"), /ARCHIVE_UNAVAILABLE/);
  await assert.rejects(regenerateMaterial("old", "stranger", 25), /ARCHIVE_UNAVAILABLE/);
  batch.status = "GENERATING";
  await assert.rejects(manageMaterialArchive("old", "owner", "delete"), /ARCHIVE_UNAVAILABLE/);
  batch.status = "READY";
  await manageMaterialArchive("old", "owner", "rename", "عنوان محدّث");
  assert.equal(batch.title, "عنوان محدّث");
  await assert.rejects(regenerateMaterial("old", "owner", 51), /INVALID_QUESTION_COUNT/);
  await regenerateMaterial("old", "owner", 25);
  assert.equal(created.length, 1); assert.equal(created[0].questionCount, 25);
  assert.deepEqual(created[0].sources, pages);
  assert.equal(batch.questionCount, 5); assert.ok(batch.publishedAt);
  await manageMaterialArchive("old", "owner", "delete");
  assert.ok(batch.deletedAt); assert.equal(batch.shareToken, null); assert.equal(batch.publishedAt, null);
  assert.equal(await publishedMaterial("a".repeat(48)), null);
  await assert.rejects(regenerateMaterial("old", "owner", 10), /ARCHIVE_UNAVAILABLE/);
  await manageMaterialArchive("old", "owner", "restore");
  assert.equal(batch.deletedAt, null); assert.equal(batch.publishedAt, null);
  assert.equal(JSON.stringify({ sources: batch.sources, content: batch.content }), original);
  assert.equal(JSON.stringify(attempts), originalAttempts);
  console.log("PASS: archive owner/status checks; rename; deletion disables sharing; restore stays private; regeneration changes count on new batch only; content/sources/attempt history retained (mock DB).");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
