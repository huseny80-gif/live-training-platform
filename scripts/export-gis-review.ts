/** Temporary encrypted, read-only export for owner-authorized source review. */
import { randomBytes, createCipheriv, publicEncrypt, constants } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { storage } from "../src/lib/storage";
const publicKey = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAymlv3Ly93KCtwGk2v0qY
0kV9d62SuNaLujKtYk3F/gaer+Cc3GM548I2aPTuesr8qRkWPRmSuIL7qVgptjR5
vQybBNW9x2bhMyIKdYilKdEEVV/els/WNILOQEjvN9efSjNp8MUQqylwyd7dMTLO
1SOmQqUP5xxCPEwnVLWoTNtM6NzLxPsYpo3O8fx8FJ/hWZI5kalg8SEhdh4DEf6/
LYv9+95szKqcB6bXkoAl2fBSCn6aUmSqiGtydZg/NXaizJroYhx6eMG1APDlzayh
4qw5H4XmKVTGhTa0MXO18tEDzF9F3hZDkozDn330maAgqE27FOxcN5r25K4LbLmq
Cy58mhgJxICwDQoNtcKh41VR55M4RzMMjcLLOiMtK+K6+26124o2uMFCCnvzO3Z3
C+jzYKRfKYlPY6K/GyUNJIhbpooejgQ2BT/ChljF4uDcdNEXu/zafARL1exOgZmC
MNbPtbRTkG/PbgjPSmB96kilFom7AVX5SR/okNw9cq+pAgMBAAE=
-----END PUBLIC KEY-----
`;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000, max: 1 }) });
async function run() {
  if (process.env.VERCEL_ENV !== "production") return;
  const docs = await prisma.trainingDocument.findMany({ where: { archivedAt: null, extractionStatus: "COMPLETED", fileName: { contains: "GIS-Part6b", mode: "insensitive" } }, include: { pages: { orderBy: { pageNumber: "asc" } } } });
  if (docs.length !== 1) throw new Error("AMBIGUOUS_TARGET");
  const doc = docs[0];
  const batches = await prisma.examMaterialBatch.findMany({ where: { programId: doc.programId, status: "READY", deletedAt: null }, orderBy: { createdAt: "desc" }, take: 30 });
  const batch = batches.find(b => (b.sources as {documentId:string}[]).every(p => p.documentId === doc.id));
  const bytes = Buffer.from(JSON.stringify({ pdf: (await storage.read(doc.storagePath)).toString("base64"), native: doc.pages.map(p => ({ pageNumber:p.pageNumber, text:p.extractedText })), sources:batch?.sources, content:batch?.content, guide:batch?.instructorGuide }));
  const key = randomBytes(32), iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = Buffer.concat([cipher.update(bytes), cipher.final()]);
  await writeFile("public/gis-review-encrypted.json", JSON.stringify({ key: publicEncrypt({key:publicKey, padding:constants.RSA_PKCS1_OAEP_PADDING, oaepHash:"sha256"}, key).toString("base64"), iv:iv.toString("base64"), tag:cipher.getAuthTag().toString("base64"), payload:payload.toString("base64") }));
  console.log("[gis-review] encrypted read-only export completed");
}
run().catch(() => { console.error("[gis-review] export unavailable"); }).finally(() => prisma.$disconnect());
