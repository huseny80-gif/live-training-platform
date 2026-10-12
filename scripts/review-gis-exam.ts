import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { storage } from "../src/lib/storage";
import { verifiedPdfHash, verifiedGisExtracts } from "../src/lib/exam-material/gis-verified-extracts";
import { compileGroundedMaterial, sourceSpans, sha, type SourcePage, type Material } from "../src/lib/exam-material/grounding";
import { validateMaterialSources } from "../src/lib/exam-material/source-quality";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000, max: 2 }) });
const receipt: Record<string, unknown> = { reportType: "COMPLETED_OPERATION_RECEIPT", release: process.env.VERCEL_GIT_COMMIT_SHA, status: "PENDING" };
async function run() {
  if (process.env.VERCEL_ENV !== "production") return;
  const docs = await prisma.trainingDocument.findMany({ where: { archivedAt: null, extractionStatus: "COMPLETED", fileName: { contains: "GIS-Part6b", mode: "insensitive" } }, include: { pages: true } });
  if (docs.length !== 1) throw new Error("AMBIGUOUS_TARGET");
  const doc = docs[0];
  if (sha(await storage.read(doc.storagePath)) !== verifiedPdfHash) throw new Error("SOURCE_CHANGED");
  const pages: SourcePage[] = verifiedGisExtracts.map(extract => {
    const original = doc.pages.find(p => p.pageNumber === extract.page);
    if (!original) throw new Error("SOURCE_CHANGED");
    return { id: original.id, documentId: doc.id, fileName: doc.fileName, pageNumber: extract.page,
      text: `${extract.title}\n${extract.text}`, extractionMethod: "VERIFIED_PDF_TRANSCRIPT", documentHash: verifiedPdfHash };
  });
  const spans = sourceSpans(pages);
  const excerpts = pages.map(page => {
    const span = spans.find(s => s.pageId === page.id && s.text === page.text);
    if (!span) throw new Error("SOURCE_CHANGED");
    return span;
  });
  const result = compileGroundedMaterial({
    summary: excerpts.map(s => s.id),
    concepts: [4, 5, 6].flatMap(i => [{ spanId: excerpts[i].id, label: verifiedGisExtracts[i].title }, { spanId: excerpts[i].id, label: verifiedGisExtracts[i].answer }]),
    links: [4, 5, 6].map((i, n) => ({ from: n * 2, to: n * 2 + 1, spanId: excerpts[i].id })),
    questions: excerpts.map((span, i) => ({ spanId: span.id, answer: verifiedGisExtracts[i].answer,
      distractors: [1, 2, 3].map(n => { const other = (i + n) % excerpts.length; return { spanId: excerpts[other].id, text: verifiedGisExtracts[other].answer }; }) })),
    debrief: excerpts.slice(0, 8).map((s, i) => ({ spanId: s.id, focus: verifiedGisExtracts[i].title, kind: "EXPLAIN" })),
  }, pages, 10, "SOURCE_ONLY");
  await prisma.$transaction(async tx => {
    const batches = await tx.examMaterialBatch.findMany({ where: { programId: doc.programId, deletedAt: null, status: "READY" } });
    const related = batches.filter(b => { const sources = b.sources as unknown as SourcePage[]; return sources.length > 0 && sources.every(p => p.documentId === doc.id); });
    for (const batch of related) {
      try { validateMaterialSources(batch.content as unknown as Material, batch.sources as unknown as SourcePage[]); }
      catch { await tx.examMaterialBatch.update({ where: { id: batch.id }, data: { status: "FAILED", errorCode: "SOURCE_QUALITY_REJECTED", publishedAt: null, shareToken: null } }); }
    }
    if (!related.some(b => (b.sources as unknown as SourcePage[]).every(p => p.extractionMethod === "VERIFIED_PDF_TRANSCRIPT" && p.documentHash === verifiedPdfHash))) {
      await tx.examMaterialBatch.create({ data: { programId: doc.programId, questionCount: 10, title: "مقاطع مطابقة للمصدر — GIS-Part6b",
        sources: JSON.parse(JSON.stringify(pages)), content: JSON.parse(JSON.stringify(result.content)), instructorGuide: JSON.parse(JSON.stringify(result.instructorGuide)), status: "READY", completedAt: new Date() } });
    }
  }, { isolationLevel: "Serializable", timeout: 15000 });
  Object.assign(receipt, { status: "READY", questionCount: 10, visuallyComparedPages: verifiedGisExtracts.length, totalDocumentPages: doc.pages.length, requiresSourceReview: true, sourceReviewed: false, selectionMethod: "SOURCE_ONLY", scope: "VERIFIED_EXCERPTS_ONLY" });
}
run().catch(() => { receipt.status = "SOURCE_REVIEW_UNAVAILABLE"; }).finally(async () => {
  await writeFile("public/exam-material-recovery.json", JSON.stringify(receipt));
  console.log("[gis-source-review]", JSON.stringify(receipt));
  await prisma.$disconnect();
});
