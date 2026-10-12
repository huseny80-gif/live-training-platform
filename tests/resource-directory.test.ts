import assert from "node:assert/strict";
async function run() {
  const queries: { where: any }[] = []; const now = new Date("2026-10-12T10:00:00Z");
  const findMany = (rows: any[]) => async (args: any) => { queries.push(args); assert.equal(args.where.program.instructorId, "owner"); return rows.filter(r => !args.where.programId || args.where.programId === r.programId); };
  Object.assign(globalThis, { prisma: {
    trainingProgram: { findFirst: async ({ where }: any) => where.id === "gis" && where.instructorId === "owner" ? { id: "gis" } : null },
    resourceCategory: { findMany: findMany([{ key: "docs", name: "builtin", icon: "📄", programId: "gis" }, { key: "maps", name: "خرائط", icon: "📁", programId: "gis" }]) },
    resourceFile: { findMany: findMany([{ id: "file", programId: "gis", categoryKey: "docs", title: "دليل", fileName: "دليل.docx", sizeBytes: 1234, createdAt: now, storagePath: "SECRET_BLOB_PATH", status: "READY", archivedAt: null }]) },
    trainingDocument: { findMany: findMany([{ id: "lecture", programId: "gis", fileName: "المحاضرة.pdf", pageCount: 24, fileSizeBytes: 5678, createdAt: now, storagePath: "SECRET_BLOB_PATH" }]) },
    trainingVideo: { findMany: findMany([{ id: "video", programId: "other-owned", title: "فيديو", createdAt: now, transcript: [{ endSeconds: 260 }] }]) },
    examMaterialBatch: { findMany: findMany([{ id: "exam", programId: "gis", title: "اختبار", questionCount: 10, status: "READY", createdAt: now }, { id: "failed", programId: "gis", title: "محاولة", questionCount: 10, status: "FAILED", createdAt: now }]) },
    liveSession: { findMany: findMany([{ id: "daily", programId: "gis", dayNumber: 2, title: "يومي", createdAt: now }, { id: "final", programId: "other-owned", dayNumber: 0, title: "نهائي", createdAt: now }]) },
  } });
  const { resourceDirectory } = await import("../src/lib/resources/directory");
  const all = await resourceDirectory(null, "owner"); assert.equal(all.categories.length, 7); assert.equal(all.items.length, 8);
  assert.equal(all.categories.filter(c => c.key === "docs").length, 1);
  assert.equal(all.items.find(i => i.id === "lecture")!.sizeBytes, 5678);
  assert.equal(all.items.find(i => i.id === "failed")!.downloadUrl, undefined);
  assert.equal(all.items.find(i => i.id === "final-final")!.previewUrl, "/programs/other-owned/sessions/final");
  assert.equal(all.items.find(i => i.id === "result-final")!.downloadUrl, "/api/session/final/export");
  assert.ok(!JSON.stringify(all).includes("SECRET_BLOB_PATH"));
  const scoped = await resourceDirectory("gis", "owner"); assert.ok(scoped.items.every(i => i.programId === "gis"));
  const count = queries.length; await assert.rejects(resourceDirectory("foreign", "owner"), /NOT_FOUND/); assert.equal(queries.length, count);
  console.log("PASS: all-library and program scopes preserve ownership; default/custom categories, real sizes and historical daily/final links; failed exams lack download; private storage paths never serialized (mock DB).");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
