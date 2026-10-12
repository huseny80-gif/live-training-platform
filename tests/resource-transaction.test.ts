import assert from "node:assert/strict";
async function run() {
  let attempts = 0; const optionsSeen: any[] = [];
  const mock = { $transaction: async (fn: any, options: any) => { attempts++; optionsSeen.push(options); if (attempts < 3) throw { code: "P2034" }; return fn({ marker: true }); } };
  Object.assign(globalThis, { prisma: mock });
  const { resourceTransaction } = await import("../src/lib/resources/transaction");
  const result = await resourceTransaction(async tx => (tx as any).marker);
  assert.equal(result, true); assert.equal(attempts, 3); assert.ok(optionsSeen.every(o => o.timeout === 20000 && o.maxWait === 10000));
  attempts = 0; mock.$transaction = async () => { attempts++; throw { code: "P2028" }; };
  await assert.rejects(resourceTransaction(async () => true), (e: any) => e.code === "P2028"); assert.equal(attempts, 1);
  attempts = 0; mock.$transaction = async () => { attempts++; throw { code: "P2034" }; };
  await assert.rejects(resourceTransaction(async () => true), (e: any) => e.code === "P2034"); assert.equal(attempts, 3);
  console.log("PASS: serialization conflicts retry at most 3 times with extended transaction deadline; timeout and ambiguous failures not replayed (mock DB).");
}
run().catch(e => { console.error(e); process.exitCode = 1; });
