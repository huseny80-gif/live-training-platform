import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { extractPdfOcr } from "../src/lib/exam-material/pdf-ocr";
import { storage } from "../src/lib/storage";
import { selectFromSource } from "../src/lib/exam-material/source-selection";
import { buildGroundedCatalog } from "../src/lib/exam-material/catalog";
import { sha, type SourcePage, type Material } from "../src/lib/exam-material/grounding";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000, statement_timeout: 15000, query_timeout: 15000, max: 2 }) });
const result: Record<string, unknown> = { release: process.env.VERCEL_GIT_COMMIT_SHA ?? "local", status: "PENDING", jobsAttempted: 0 };
const fingerprint = (pages: SourcePage[]) => sha(pages.map(p => `${p.documentId}:${p.id}:${p.pageNumber}:${sha(p.text)}`).sort().join("\n"));

/** Owner-requested maintenance for one uniquely identified lecture; no unrelated course is modified. */
async function recover() {
  if (process.env.VERCEL_ENV !== "production") return;
  const documents = await prisma.trainingDocument.findMany({ where: {
    archivedAt: null, extractionStatus: "COMPLETED", fileName: { contains: "GIS-Part6b", mode: "insensitive" },
  }, include: { pages: { orderBy: { pageNumber: "asc" } } } });
  const courses = [...new Set(documents.map(d => d.programId))];
  result.matchingDocuments = documents.length; result.matchingCourses = courses.length;
  if (documents.length !== 1 || courses.length !== 1) { result.status = "AMBIGUOUS_OR_MISSING_TARGET"; return; }
  const document = documents[0];
  if (!document.pages.length || document.pages.some(p => p.extractionMethod !== "NATIVE_TEXT" || p.extractionStatus !== "COMPLETED")) {
    result.status = "NATIVE_TEXT_REQUIRED"; return;
  }
  let pages: SourcePage[] = document.pages.filter(p => p.extractedText?.trim()).map(p => ({ id: p.id, documentId: document.id,
    fileName: document.fileName, pageNumber: p.pageNumber, text: p.extractedText! }));
  const candidates = await prisma.examMaterialBatch.findMany({ where: { programId: document.programId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50 });
  const related = candidates.filter(b => (b.sources as unknown as SourcePage[]).every(p => p.documentId === document.id));
  const requested = related.find(b => b.status === "FAILED" && b.errorCode !== "RECOVERED")?.questionCount ?? 10;
  result.requestedCount = requested; result.extractedPages = pages.length;
  let sourceHash = fingerprint(pages);
  const existing = related.find(b => b.status === "READY" && b.questionCount === requested && fingerprint(b.sources as unknown as SourcePage[]) === sourceHash);
  if (existing?.content) {
    result.status = "READY"; result.questionCount = (existing.content as unknown as Material).questions.length;
    result.selectionMethod = (existing.content as unknown as Material).selectionMethod ?? "AI_CURATED"; return;
  }
  let catalog = buildGroundedCatalog(pages);
  if (catalog.questions.length < requested) {
    result.ocrAttempted = true; result.stage = "READ_ORIGINAL_PDF";
    result.storageBackend = process.env.BLOB_READ_WRITE_TOKEN ? "BLOB" : "LOCAL";
    const bytes = await storage.read(document.storagePath);
    const previousOcr = related.find(b => b.status === "READY" && b.questionCount === requested &&
      (b.sources as unknown as SourcePage[]).some(p => p.extractionMethod === "TESSERACT_OCR") &&
      (b.sources as unknown as SourcePage[]).every(p => p.documentHash === sha(bytes)));
    if (previousOcr?.content) {
      result.status = "READY"; result.questionCount = (previousOcr.content as unknown as Material).questions.length;
      result.selectionMethod = (previousOcr.content as unknown as Material).selectionMethod;
      result.requiresSourceReview = (previousOcr.content as unknown as Material).requiresSourceReview; return;
    }
    result.stage = "OCR";
    const ocr = await extractPdfOcr(bytes, pages);
    result.stage = "VALIDATE_SOURCE";
    if (ocr.length > 0) { pages = ocr; catalog = buildGroundedCatalog(pages); sourceHash = fingerprint(pages); }
    result.ocrPages = ocr.filter(p => p.extractionMethod === "TESSERACT_OCR").length;
  }
  result.availableCandidates = catalog.questions.length;
  const available = Math.min(new Set(catalog.questions.map(q => q.answer.toLowerCase())).size, new Set(catalog.questions.map(q => q.span.id)).size);
  const counts = [requested];
  if (Math.min(requested - 1, available) >= 1) counts.push(Math.min(requested - 1, available));
  for (const count of counts) {
    result.jobsAttempted = Number(result.jobsAttempted) + 1;
    let extracted;
    try { extracted = selectFromSource(pages, catalog, count); }
    catch { result.status = "INSUFFICIENT_SOURCE"; continue; }
    const batch = await prisma.$transaction(async tx => {
      if (await tx.examMaterialBatch.count({ where: { programId: document.programId, status: "GENERATING", deletedAt: null } })) return null;
      return tx.examMaterialBatch.create({ data: { programId: document.programId, sources: JSON.parse(JSON.stringify(pages)), questionCount: count,
        title: count === requested ? "استعادة التوليد — GIS-Part6b" : `استعادة التوليد — ${count} سؤالًا بدل ${requested} وفق كفاية النص`,
        content: JSON.parse(JSON.stringify(extracted.content)), instructorGuide: JSON.parse(JSON.stringify(extracted.instructorGuide)),
        status: "READY", completedAt: new Date(),
      } });
    }, { isolationLevel: "Serializable" });
    if (!batch) { result.status = "GENERATION_BUSY"; return; }
    result.stage = "COMPLETE"; result.status = "READY"; result.questionCount = extracted.content.questions.length; result.selectionMethod = extracted.content.selectionMethod; result.requiresSourceReview = extracted.content.requiresSourceReview;
    const failedIds = related.filter(b => b.status === "FAILED").map(b => b.id);
    if (failedIds.length) await prisma.examMaterialBatch.updateMany({ where: { id: { in: failedIds }, programId: document.programId, status: "FAILED", deletedAt: null }, data: { errorCode: "RECOVERED" } });
    return;
  }
}
recover().catch(error => {
  result.status = "RECOVERY_UNAVAILABLE";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  result.errorCode = /^(P\d{4}|ECONNRESET|ECONNREFUSED|ETIMEDOUT|57014)$/.test(code) ? code : "RECOVERY_ERROR";
}).finally(async () => {
  await writeFile("public/exam-material-recovery.json", JSON.stringify(result));
  console.log("[exam-material-recovery]", JSON.stringify(result));
  await prisma.$disconnect();
});
