import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFile, writeFile } from "node:fs/promises";
import { head } from "@vercel/blob";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 20000, max: 2 }) });
Object.assign(globalThis, { prisma });
const report: Record<string, unknown> = { release: process.env.VERCEL_GIT_COMMIT_SHA, status: "PENDING" };
async function run() {
  if (process.env.VERCEL_ENV !== "production") return;
  const docs = await prisma.trainingDocument.findMany({ where: { archivedAt: null, extractionStatus: "COMPLETED", fileName: { contains: "GIS-Part6b", mode: "insensitive" } }, select: { programId: true, program: { select: { instructorId: true } } } });
  if (docs.length !== 1) { report.status = "AMBIGUOUS_TARGET"; return; }
  const owner = docs[0].program.instructorId;
  const { reserveResource, completeResource } = await import("../src/lib/resources/service");
  const { resourceErrorCode } = await import("../src/lib/resources/errors");
  const rows = await prisma.resourceFile.findMany({ where: { program: { instructorId: owner }, title: { equals: "GIS-Part1", mode: "insensitive" }, archivedAt: null }, orderBy: { createdAt: "desc" }, take: 10 });
  report.matchingPending = rows.filter(r => r.status === "PENDING").length;
  report.matchingReady = rows.filter(r => r.status === "READY").length;
  const native = prisma.$transaction.bind(prisma);
  const rollback = new Error("ROLLBACK_CHECK");
  // Exercise the actual reservation implementation against production schema,
  // always rolling back: no test resource/category or quota record is retained.
  Object.assign(prisma, { $transaction: (fn: (tx: unknown) => Promise<unknown>, options: object) => native(async tx => { await fn(tx); throw rollback; }, options) });
  try {
    await reserveResource(owner, { programId: rows[0]?.programId ?? docs[0].programId, categoryKey: "videos", title: "تحقق داخلي مؤقت", fileName: "rollback-check.mp4", sizeBytes: 3 * 1024 * 1024 * 1024 });
  } catch(error) { report.reservationCheck = error === rollback ? "ROLLED_BACK_OK" : resourceErrorCode(error); }
  finally { Object.assign(prisma, { $transaction: native }); }
  report.recovered = 0;
  for (const file of rows.filter(r => r.status === "PENDING").slice(0, 2)) {
    if (file.createdAt.getTime() < Date.now() - 60 * 60_000) continue;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const info = await head(file.blobPath, { abortSignal: controller.signal });
      if (info.size !== Number(file.sizeBytes) || info.contentType !== file.mimeType) { report.registrationCheck = "METADATA_MISMATCH"; continue; }
      await completeResource(file.id, owner, info.url);
      report.recovered = Number(report.recovered) + 1;
    } catch(error) { report.registrationCheck = resourceErrorCode(error); }
    finally { clearTimeout(timer); }
  }
  report.status = "COMPLETE";
}
run().catch(() => { report.status = "DIAGNOSTIC_UNAVAILABLE"; }).finally(async () => {
  const receipt = JSON.parse(await readFile("public/exam-material-recovery.json", "utf8"));
  await writeFile("public/exam-material-recovery.json", JSON.stringify({ ...receipt, resourceUploadCheck: report }));
  console.log("[resource-upload-check]", JSON.stringify(report)); await prisma.$disconnect();
});
