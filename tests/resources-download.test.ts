import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
async function run() {
  const filename = "مادة تدريبية.pdf", pathname = "resources/program/owned.pdf";
  const file: Record<string, unknown> = { id: "file", blobPath: pathname, fileName: filename, mimeType: "application/pdf", sizeBytes: 20, storagePath: "private-key", status: "READY", archivedAt: null };
  const signingCalls: Record<string, unknown>[] = [];
  const state = { owner: "owner" as string | null };
  Object.assign(globalThis, {
    __resourceAuth: async () => state.owner ? { user: { id: state.owner } } : null,
    __resourceDb: { resourceFile: { findFirst: async ({ where }: any) => where.id === "file" && where.program.instructorId === "owner" ? file : null } },
    __resourceStorage: { read: async () => Buffer.from("original-private-bytes") },
    __resourceBlob: { issueSignedToken: async (options: Record<string, unknown>) => { signingCalls.push(options); return { clientSigningToken: "fixture", delegationToken: "fixture" }; }, presignUrl: async (_token: unknown, options: Record<string, unknown>) => { signingCalls.push(options); return { presignedUrl: "https://fixture.private.blob.vercel-storage.com/owned.pdf?signed=fixture" }; } },
  });
  const bundle = await build({ entryPoints: ["src/app/api/resources/[id]/file/route.ts"], bundle: true, platform: "node", format: "cjs", write: false, plugins: [{ name: "deps", setup(b) {
    b.onResolve({ filter: /^(@\/lib\/(auth|prisma|storage)|@vercel\/blob)$/ }, args => ({ path: args.path, namespace: "mock" }));
    b.onLoad({ filter: /./, namespace: "mock" }, args => ({ loader: "js", contents: args.path.endsWith("auth") ? "export const auth=globalThis.__resourceAuth" : args.path.endsWith("prisma") ? "export const prisma=globalThis.__resourceDb" : args.path.endsWith("storage") ? "export const storage=globalThis.__resourceStorage" : "export const {issueSignedToken,presignUrl}=globalThis.__resourceBlob" }));
  } }] });
  const module = { exports: {} as { GET: (req: Request, ctx: any) => Promise<Response> } };
  new Function("module", "exports", "require", bundle.outputFiles[0].text)(module, module.exports, createRequire(`${process.cwd()}/tests/resources-download.test.ts`));
  const old = process.env.BLOB_READ_WRITE_TOKEN; delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    const ctx = { params: Promise.resolve({ id: "file" }) }; const request = new Request("https://platform.test/api/resources/file/file?download=1");
    state.owner = null; assert.equal((await module.exports.GET(request, ctx)).status, 401);
    state.owner = "other"; assert.equal((await module.exports.GET(request, ctx)).status, 404);
    state.owner = "owner"; file.status = "PENDING"; assert.equal((await module.exports.GET(request, ctx)).status, 404);
    file.status = "READY"; file.archivedAt = new Date(); assert.equal((await module.exports.GET(request, ctx)).status, 404); file.archivedAt = null;
    const local = await module.exports.GET(request, ctx); assert.equal(local.status, 200); assert.equal(await local.text(), "original-private-bytes");
    assert.equal(local.headers.get("cache-control"), "private, no-store"); assert.ok(local.headers.get("content-disposition")?.includes(encodeURIComponent(filename))); assert.ok(local.headers.get("content-disposition")?.startsWith("attachment"));
    process.env.BLOB_READ_WRITE_TOKEN = "test-binding-only";
    const signed = await module.exports.GET(request, ctx); assert.equal(signed.status, 302); assert.ok(signed.headers.get("location")?.includes("download=1"));
    assert.deepEqual(signingCalls[0].operations, ["get"]); assert.equal(signingCalls[0].pathname, pathname); assert.ok(Number(signingCalls[0].validUntil) <= Date.now() + 10 * 60_000); assert.equal(signingCalls[1].access, "private");
    state.owner = "other"; await module.exports.GET(request, ctx); assert.equal(signingCalls.length, 2);
    console.log("PASS: actual download handler blocks anonymous/foreign/pending/trash access; local bytes and filename unchanged; production issues only scoped expiring private GET URLs, no store-wide token (mock Blob/DB/auth).");
  } finally { if (old === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = old; }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
