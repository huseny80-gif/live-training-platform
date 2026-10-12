import assert from "node:assert/strict";
import { defaultCategories } from "../src/lib/resources/types";
async function run() {
  const programId = "10000000-0000-4000-8000-000000000001";
  const categories: Record<string, any>[] = [], files: Record<string, any>[] = [];
  const tx = {
    trainingProgram: { findFirst: async ({ where }: any) => where.id === programId && where.instructorId === "owner" ? { id: programId } : null },
    resourceCategory: {
      upsert: async ({ create }: any) => { if (!categories.some(c => c.key === create.key)) categories.push(create); return create; },
      findFirst: async ({ where }: any) => categories.find(c => c.key === where.key && c.programId === where.programId), count: async () => categories.length,
      create: async ({ data }: any) => { categories.push(data); return data; },
    },
    resourceFile: {
      count: async () => files.length,
      create: async ({ data }: any) => { const row = { ...data, status: "PENDING", archivedAt: null, createdAt: new Date() }; files.push(row); return row; },
      findFirst: async ({ where }: any) => where.program.instructorId === "owner" ? files.find(f => f.id === where.id) : null,
      updateMany: async ({ where, data }: any) => { const f = files.find(f => f.id === where.id && f.status === where.status); if (!f || where.program.instructorId !== "owner") return { count: 0 }; Object.assign(f, data); return { count: 1 }; },
    },
  };
  Object.assign(globalThis, { prisma: { ...tx, $transaction: async (fn: any) => fn(tx) } });
  const { reserveResource, resourceForOwner, manageResource, addCategory, validateResourceBlob } = await import("../src/lib/resources/service");
  const input = { programId, categoryKey: "docs", title: "دليل المتدرب", fileName: "الدليل.docx", sizeBytes: 500 };
  await assert.rejects(reserveResource("other", input), /NOT_FOUND/); assert.equal(files.length, 0);
  await assert.rejects(reserveResource("owner", { ...input, fileName: "../../file.docx" }));
  await assert.rejects(reserveResource("owner", { ...input, fileName: "page.html" }), /UNSUPPORTED_FILE/);
  await assert.rejects(reserveResource("owner", { ...input, sizeBytes: 31 * 1024 * 1024 }), /FILE_TOO_LARGE/);
  const reserved = await reserveResource("owner", input); assert.equal(files.length, 1); assert.ok(reserved.pathname.startsWith(`resources/${programId}/${reserved.id}`));
  assert.equal(categories[0].name, defaultCategories.find(c => c.key === "docs")!.name);
  await assert.rejects(resourceForOwner(reserved.id, "other"), /NOT_FOUND/);
  await assert.rejects(manageResource(reserved.id, "owner", "rename", "عنوان جديد"), /NOT_FOUND/);
  files[0].status = "READY";
  await manageResource(reserved.id, "owner", "rename", "عنوان جديد"); assert.equal(files[0].title, "عنوان جديد");
  await manageResource(reserved.id, "owner", "delete"); assert.ok(files[0].archivedAt);
  await manageResource(reserved.id, "owner", "restore"); assert.equal(files[0].archivedAt, null);
  await assert.rejects(addCategory("other", programId, "خرائط تطبيقية"), /NOT_FOUND/);
  const custom = await addCategory("owner", programId, "خرائط تطبيقية");
  await reserveResource("owner", { ...input, categoryKey: custom.key });
  await assert.rejects(reserveResource("owner", { ...input, categoryKey: "foreign-category" }), /INVALID_CATEGORY/);
  const good = `https://teststore.private.blob.vercel-storage.com/${reserved.pathname}`;
  validateResourceBlob(good, reserved.pathname);
  for (const url of [good.replace("https:", "http:"), good + "?token=x", good.replace("teststore.private", "teststore.public"), "https://127.0.0.1/" + reserved.pathname, good.replace(programId, "another-program"), good.replace("https://", "https://user:pass@")]) assert.throws(() => validateResourceBlob(url, reserved.pathname));
  console.log("PASS: persistent scoped upload intents/categories; original names/sizes; unsupported and oversized files rejected; foreign/unfinished resources blocked; rename/trash/restore and exact private Blob scope (mock DB).");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
