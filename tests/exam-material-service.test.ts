import assert from "node:assert/strict";
import { compileGroundedMaterial, type Material, gradeMaterial } from "../src/lib/exam-material/grounding";
import { plan, pages } from "./fixtures/exam-material";
async function run() {
  const generated = compileGroundedMaterial(plan, pages, 5);
  const batch = { id: "batch", programId: "program", status: "READY", publishedAt: new Date(), shareToken: "a".repeat(48), content: generated.content, instructorGuide: generated.instructorGuide, sources: pages };
  let published = true; let report: unknown = null; let correctOwner = true; let busy = false; let native = true;
  let creates = 0; let quota = 0;
  const mock = {
    trainingProgram: { findFirst: async ({ where }: { where: { instructorId: string } }) => where.instructorId === "owner" && correctOwner ? { id: "program" } : null },
    trainingDocument: { findMany: async ({ where }: { where: { programId: string } }) => {
      assert.equal(where.programId, "program"); return [{ id: pages[0].documentId, fileName: pages[0].fileName, pages: [{ id: pages[0].id, pageNumber: 3, extractionStatus: "COMPLETED", extractionMethod: native ? "NATIVE_TEXT" : "VISION_LLM", extractedText: pages[0].text }] }];
    } },
    examMaterialBatch: {
      count: async ({ where }: { where: { status?: string } }) => where.status ? (busy ? 1 : 0) : quota,
      create: async () => { creates++; return { id: "reserved" }; },
      findFirst: async () => published ? batch : null,
      updateMany: async ({ where }: { where: { program: { instructorId: string }; status: string } }) => ({ count: where.program.instructorId === "owner" && where.status === "READY" ? 1 : 0 }),
    },
    examMaterialAttempt: {
      findFirst: async ({ where }: { where: { tokenHash: string; batchId: string } }) => where.tokenHash === "own-attempt" && where.batchId === "batch" ? { id: "attempt", report } : null,
      update: async ({ data }: { data: { report: unknown } }) => { report = data.report; },
    },
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(mock),
  };
  Object.assign(globalThis, { prisma: mock });
  const { publicMaterial, publishMaterial, reserveMaterial, submitMaterial } = await import("../src/lib/exam-material/service");
  assert.equal(await publicMaterial("invalid"), null);
  published = false;
  assert.equal(await publicMaterial("a".repeat(48)), null);
  await assert.rejects(submitMaterial("a".repeat(48), "own-attempt", {}), /NOT_FOUND/);
  published = true;
  const student = await publicMaterial("a".repeat(48));
  assert.ok(student); assert.ok(!("instructorGuide" in student)); assert.ok(!("sources" in student));
  assert.ok(!JSON.stringify(student.content.questions).includes("correctIndex"));
  await assert.rejects(publishMaterial("batch", "other", true), /NOT_FOUND/);
  await publishMaterial("batch", "owner", true);
  const answers = Object.fromEntries(generated.content.questions.map(q => [q.id, q.correctIndex]));
  await assert.rejects(submitMaterial("a".repeat(48), "wrong-attempt", answers), /UNAUTHORIZED/);
  const first = await submitMaterial("a".repeat(48), "own-attempt", answers);
  const duplicate = await submitMaterial("a".repeat(48), "own-attempt", Object.fromEntries(Object.keys(answers).map(id => [id, 3])));
  assert.deepEqual(first, duplicate); assert.deepEqual(first, gradeMaterial(batch.content as Material, answers));
  process.env.ANTHROPIC_API_KEY = "test-placeholder-not-a-real-key";
  await assert.rejects(reserveMaterial("other", "program", [pages[0].documentId], 5), /NOT_FOUND/);
  busy = true;
  await assert.rejects(reserveMaterial("owner", "program", [pages[0].documentId], 5), /GENERATION_BUSY/);
  busy = false; native = false;
  await assert.rejects(reserveMaterial("owner", "program", [pages[0].documentId], 5), /NATIVE_TEXT_REQUIRED/);
  assert.equal(creates, 0); native = true;
  quota = 5;
  await assert.rejects(reserveMaterial("owner", "program", [pages[0].documentId], 5), /GENERATION_RATE_LIMIT/);
  assert.equal(creates, 0); quota = 0;
  await reserveMaterial("owner", "program", [pages[0].documentId], 5); assert.equal(creates, 1);
  console.log("PASS: published-only access; guide/key/source privacy; ownership; attempt identity and idempotent grading; busy-job and native-text constraints (mock DB, no API calls).");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
