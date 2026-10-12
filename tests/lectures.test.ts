import assert from "node:assert/strict";
async function run() {
  const docs = new Map([
    ["old", { id: "old", programId: "program", owner: "owner", fileName: "المحاضرة.pdf", archivedAt: null as Date | null, extractionStatus: "COMPLETED", extractionNotes: null as string | null }],
    ["new", { id: "new", programId: "program", owner: "owner", fileName: "نسخة جديدة.pdf", archivedAt: null as Date | null, extractionStatus: "PENDING", extractionNotes: null as string | null }],
    ["other", { id: "other", programId: "different", owner: "stranger", fileName: "ملف خاص.pdf", archivedAt: null as Date | null, extractionStatus: "COMPLETED", extractionNotes: null as string | null }],
  ]);
  const writes: Record<string, unknown>[] = [];
  const historical = { question: { id: "q", sourcePageId: "original-page", correctOptionId: "correct" }, result: { score: 10 }, snapshot: "النص الأصلي" };
  const original = JSON.stringify(historical);
  const mock = {
    trainingDocument: {
      findFirst: async ({ where }: { where: { id: string; programId?: string; archivedAt?: null; program: { instructorId: string } } }) => {
        const doc = docs.get(where.id);
        if (!doc || doc.owner !== where.program.instructorId || (where.programId && doc.programId !== where.programId) || (where.archivedAt === null && doc.archivedAt)) return null;
        return { ...doc };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        writes.push({ id: where.id, ...data }); Object.assign(docs.get(where.id)!, data);
      },
    },
    $transaction: async (operation: (client: unknown) => Promise<unknown>, options: { isolationLevel: string }) => {
      assert.equal(options.isolationLevel, "Serializable"); return operation(mock);
    },
  };
  Object.assign(globalThis, { prisma: mock });
  const { renameLecture, archiveLecture, replaceLecture } = await import("../src/lib/lectures/service");
  await assert.rejects(renameLecture("old", "stranger", "اسم جديد"), /NOT_FOUND/);
  await assert.rejects(archiveLecture("other", "owner", true), /NOT_FOUND/);
  await assert.rejects(renameLecture("old", "owner", "../bad.pdf"));
  await assert.rejects(renameLecture("old", "owner", "  "));
  assert.equal(writes.length, 0);
  await renameLecture("old", "owner", "محاضرة نظم المعلومات الجغرافية");
  assert.equal(docs.get("old")!.fileName, "محاضرة نظم المعلومات الجغرافية");
  await assert.rejects(replaceLecture("old", "new", "owner"), /REPLACEMENT_NOT_READY/);
  assert.equal(docs.get("old")!.archivedAt, null);
  await assert.rejects(replaceLecture("old", "other", "owner"), /REPLACEMENT_NOT_READY/);
  await assert.rejects(replaceLecture("old", "old", "owner"), /INVALID_REPLACEMENT/);
  docs.get("old")!.extractionStatus = "PROCESSING";
  await assert.rejects(archiveLecture("old", "owner", true), /LECTURE_BUSY/);
  await assert.rejects(renameLecture("old", "owner", "تعديل مرفوض"), /LECTURE_BUSY/);
  docs.get("old")!.extractionStatus = "COMPLETED";
  docs.get("old")!.extractionNotes = "GENERATION_PROCESSING:job:0";
  await assert.rejects(archiveLecture("old", "owner", true), /LECTURE_BUSY/);
  docs.get("old")!.extractionNotes = null;
  docs.get("new")!.extractionStatus = "COMPLETED";
  await replaceLecture("old", "new", "owner");
  assert.ok(docs.get("old")!.archivedAt instanceof Date);
  assert.equal(docs.get("new")!.archivedAt, null);
  await archiveLecture("old", "owner", false);
  assert.equal(docs.get("old")!.archivedAt, null);
  await archiveLecture("old", "owner", true);
  assert.ok(docs.get("old")!.archivedAt instanceof Date);
  assert.equal(JSON.stringify(historical), original);
  assert.ok(writes.every(w => Object.keys(w).every(key => ["id", "fileName", "archivedAt"].includes(key))));
  console.log("PASS: lecture ownership; rename validation; busy-job protection; incomplete/foreign replacement rejected; archive/restore; original pages, files and exam history untouched (mock DB).");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
