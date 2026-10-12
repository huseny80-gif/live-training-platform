import assert from "node:assert/strict";
import { compileGroundedMaterial } from "../src/lib/exam-material/grounding";
import { pages, plan } from "./fixtures/exam-material";
async function run() {
  const generated = compileGroundedMaterial(plan, pages.map(p => ({ ...p, extractionMethod: "TESSERACT_OCR", documentHash: "hash" })), 5, "SOURCE_ONLY");
  const batch = { id: "batch", content: generated.content, publishedAt: new Date() as Date | null, shareToken: "a".repeat(48) as string | null };
  let writes = 0;
  Object.assign(globalThis, { prisma: { examMaterialBatch: {
    findFirst: async ({ where }: { where: { program?: { instructorId: string } } }) => where.program && where.program.instructorId !== "owner" ? null : batch,
    updateMany: async ({ data }: { data: typeof batch }) => { writes++; Object.assign(batch, data); return { count: 1 }; },
  } } });
  const { publishMaterial, publicMaterial } = await import("../src/lib/exam-material/service");
  assert.equal(batch.content.requiresSourceReview, true);
  assert.equal(await publicMaterial("a".repeat(48)), null);
  await assert.rejects(publishMaterial("batch", "owner", true), /OCR_REVIEW_REQUIRED/);
  await assert.rejects(publishMaterial("batch", "other", true, true), /NOT_FOUND/);
  assert.equal(writes, 0);
  await publishMaterial("batch", "owner", true, true);
  assert.equal(batch.content.sourceReviewed, true);
  const student = await publicMaterial(batch.shareToken!);
  assert.ok(student); assert.ok(!JSON.stringify(student.content.questions).includes("correctIndex"));
  assert.equal(writes, 1);
  console.log("PASS: OCR derives mandatory review flag; unreviewed content not public; owner confirmation required; reviewed publication preserves student answer privacy (mock DB).");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
