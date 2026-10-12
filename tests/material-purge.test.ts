import assert from "node:assert/strict";
async function run() {
  let deleted = false; let shared = false; let busy = false; let removed = false;
  const attempts = ["attempt-one", "attempt-two"];
  Object.assign(globalThis, { prisma: { examMaterialBatch: {
    deleteMany: async ({ where }: { where: { id: string; program: { instructorId: string }; deletedAt: { not: null }; status: { not: string }; publishedAt: null; shareToken: null } }) => {
      assert.deepEqual(where.deletedAt, { not: null }); assert.deepEqual(where.status, { not: "GENERATING" });
      assert.equal(where.publishedAt, null); assert.equal(where.shareToken, null);
      if (where.id !== "batch" || where.program.instructorId !== "owner" || !deleted || shared || busy || removed) return { count: 0 };
      removed = true; attempts.length = 0; return { count: 1 };
    },
  } } });
  const { permanentlyDeleteMaterial } = await import("../src/lib/exam-material/service");
  await assert.rejects(permanentlyDeleteMaterial("batch", "owner"), /ARCHIVE_UNAVAILABLE/);
  deleted = true;
  await assert.rejects(permanentlyDeleteMaterial("batch", "stranger"), /ARCHIVE_UNAVAILABLE/);
  shared = true; await assert.rejects(permanentlyDeleteMaterial("batch", "owner"), /ARCHIVE_UNAVAILABLE/);
  shared = false; busy = true; await assert.rejects(permanentlyDeleteMaterial("batch", "owner"), /ARCHIVE_UNAVAILABLE/);
  busy = false;
  assert.equal(attempts.length, 2); assert.equal(removed, false);
  await permanentlyDeleteMaterial("batch", "owner");
  assert.equal(removed, true); assert.equal(attempts.length, 0);
  await assert.rejects(permanentlyDeleteMaterial("batch", "owner"), /ARCHIVE_UNAVAILABLE/);
  console.log("PASS: permanent delete limited to owner's unpublished trash; active/shared/generating/foreign records blocked; cascade represented; duplicate purge rejected (mock DB).");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
