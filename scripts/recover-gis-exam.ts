import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000, statement_timeout: 15000, query_timeout: 15000, max: 2 }) });
import { selectFromSource } from "../src/lib/exam-material/source-selection";
import { buildGroundedCatalog } from "../src/lib/exam-material/catalog";
import { sha, type SourcePage, type Material } from "../src/lib/exam-material/grounding";

// A scoped recovery requested by the owner in this session. No other course is touched.
const PROGRAM_ID = "15dda042-1cf0-4143-ba9b-122eeecbbdc4";
let programId = PROGRAM_ID;
const targetDocuments = new Set<string>();
const matchesLecture = (pages: SourcePage[]) => pages.length > 0 && new Set(pages.map(p => p.documentId)).size === 1 && pages.every(p => targetDocuments.size > 0 ? targetDocuments.has(p.documentId) : /gis[-_ ]part6b/i.test(p.fileName));
const result: Record<string, unknown> = { release: process.env.VERCEL_GIT_COMMIT_SHA ?? "local", status: "PENDING", jobsAttempted: 0 };
async function recover() {
  if (process.env.VERCEL_ENV !== "production") return;
  const program = await prisma.trainingProgram.findUnique({ where: { id: PROGRAM_ID }, select: { id: true, instructorId: true } });
  if (!program) { result.status = "NO_MATCHING_PROGRAM"; return; }
  const documents = await prisma.trainingDocument.findMany({ where: {
    program: { instructorId: program.instructorId }, archivedAt: null, extractionStatus: "COMPLETED",
    fileName: { contains: "GIS-Part6b", mode: "insensitive" },
  }, select: { id: true, programId: true } });
  const courses = [...new Set(documents.map(d => d.programId))];
  if (courses.length > 1) { result.status = "AMBIGUOUS_TARGET"; return; }
  if (courses.length === 1) programId = courses[0];
  documents.forEach(d => targetDocuments.add(d.id));
  const candidates = await prisma.examMaterialBatch.findMany({ where: { programId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50 });
  const failed = candidates.find(b => b.status === "FAILED" && b.errorCode !== "RECOVERED" && matchesLecture(b.sources as unknown as SourcePage[]));
  if (!failed) {
    const ready = candidates.find(b => b.status === "READY" && b.questionCount === 10 && matchesLecture(b.sources as unknown as SourcePage[]));
    if (ready?.content) {
      result.status = "READY"; result.questionCount = ready.questionCount;
      result.selectionMethod = (ready.content as unknown as Material).selectionMethod ?? "AI_CURATED";
    } else result.status = "NO_MATCHING_FAILED_JOB";
    return;
  }
  const pages = failed.sources as unknown as SourcePage[];
  const fingerprint = sha(JSON.stringify(pages));
  const requested = failed.questionCount;
  result.requestedCount = requested;
  const existing = candidates.find(b => b.status === "READY" && b.questionCount === requested && sha(JSON.stringify(b.sources)) === fingerprint);
  if (existing?.content) {
    result.status = "READY"; result.questionCount = existing.questionCount;
    result.selectionMethod = (existing.content as unknown as Material).selectionMethod ?? "AI_CURATED";
    return;
  }
  const catalog = buildGroundedCatalog(pages);
  result.extractedPages = pages.length; result.availableCandidates = catalog.questions.length;
  const available = new Set(catalog.questions.map(q => q.answer.toLowerCase())).size;
  const counts = [requested];
  // A smaller count is used only after the requested count fails; it is recorded in the result and title.
  const smaller = Math.min(requested - 1, available);
  if (smaller >= 1) counts.push(smaller);
  const recoverableIds = candidates.filter(b => b.status === "FAILED" && matchesLecture(b.sources as unknown as SourcePage[])).map(b => b.id);
  let tries = 0;
  for (const count of counts) {
    for (let attempt = 0; attempt < (count === requested ? 2 : 1); attempt++) {
      const batch = await prisma.$transaction(async tx => {
        if (await tx.examMaterialBatch.count({ where: { programId, status: "GENERATING", deletedAt: null } })) return null;
        return tx.examMaterialBatch.create({ data: { programId, sources: failed.sources!, questionCount: count,
          title: count === requested ? "استعادة التوليد — GIS-Part6b" : `استعادة التوليد — ${count} سؤالًا بدل ${requested} وفق كفاية النص` } });
      }, { isolationLevel: "Serializable" });
      if (!batch) { result.status = "GENERATION_BUSY"; return; }
      tries++; result.jobsAttempted = tries;
      recoverableIds.push(batch.id);
      try {
        const extracted = selectFromSource(pages, catalog, count);
        await prisma.examMaterialBatch.updateMany({ where: { id: batch.id, status: "GENERATING" }, data: {
          content: JSON.parse(JSON.stringify(extracted.content)), instructorGuide: JSON.parse(JSON.stringify(extracted.instructorGuide)),
          status: "READY", completedAt: new Date(),
        } });
      } catch {
        await prisma.examMaterialBatch.updateMany({ where: { id: batch.id, status: "GENERATING" },
          data: { status: "FAILED", errorCode: "INSUFFICIENT_SOURCE", completedAt: new Date() } });
      }
      const outcome = await prisma.examMaterialBatch.findUniqueOrThrow({ where: { id: batch.id } });
      if (outcome.status === "READY" && outcome.content) {
        result.status = "READY"; result.questionCount = (outcome.content as unknown as Material).questions.length;
        result.selectionMethod = (outcome.content as unknown as Material).selectionMethod;
        await prisma.examMaterialBatch.updateMany({ where: { id: { in: recoverableIds }, programId, status: "FAILED", deletedAt: null }, data: { errorCode: "RECOVERED" } });
        return;
      }
      result.status = "FAILED"; result.errorCode = outcome.errorCode;
      if (outcome.errorCode === "INSUFFICIENT_SOURCE") break;
    }
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
