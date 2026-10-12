/** Read-only check of the configured private store; no resources or exam records are created. */
import { readFile, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { issueSignedToken, presignUrl } from "@vercel/blob";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000, max: 1 }) });
const check: Record<string, unknown> = { status: "PENDING", release: process.env.VERCEL_GIT_COMMIT_SHA };
async function run() {
  if (process.env.VERCEL_ENV !== "production" || !process.env.BLOB_READ_WRITE_TOKEN) { check.status = "NOT_CONFIGURED"; return; }
  const docs = await prisma.trainingDocument.findMany({ where: { archivedAt: null, extractionStatus: "COMPLETED", fileName: { contains: "GIS-Part6b", mode: "insensitive" } }, select: { storagePath: true } });
  if (docs.length !== 1) { check.status = "AMBIGUOUS_OR_MISSING_SOURCE"; return; }
  const source = new URL(docs[0].storagePath);
  if (!source.hostname.endsWith(".private.blob.vercel-storage.com")) throw new Error("PRIVATE_SOURCE_REQUIRED");
  const pathname = decodeURIComponent(source.pathname.slice(1));
  const validUntil = Date.now() + 10 * 60_000;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 20000);
  let token;
  try { token = await issueSignedToken({ pathname, operations: ["get"], validUntil, abortSignal: controller.signal }); }
  finally { clearTimeout(deadline); }
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access: "private", validUntil });
  const downloadUrl = new URL(presignedUrl); downloadUrl.searchParams.set("download", "1");
  const response = await fetch(downloadUrl, { headers: { Range: "bytes=0-31" }, signal: AbortSignal.timeout(20000) });
  check.httpStatus = response.status;
  if (!response.ok || !response.body) throw new Error("READ_UNAVAILABLE");
  const reader = response.body.getReader(); const first = await reader.read(); await reader.cancel();
  if (!first.value || !Buffer.from(first.value).subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("READ_UNAVAILABLE");
  check.status = "SIGNED_PRIVATE_READ_READY"; check.rangeSupported = response.status === 206;
}
run().catch(error => { check.status = "SIGNED_PRIVATE_READ_UNAVAILABLE"; check.errorType = /^(Blob\w+Error|Error)$/.test(error?.constructor?.name ?? "") ? error.constructor.name : "STORAGE_CHECK_ERROR"; }).finally(async () => {
  const receipt = JSON.parse(await readFile("public/exam-material-recovery.json", "utf8"));
  await writeFile("public/exam-material-recovery.json", JSON.stringify({ ...receipt, resourceLibraryCheck: check }));
  console.log("[resource-storage-check]", JSON.stringify(check));
  await prisma.$disconnect();
});
