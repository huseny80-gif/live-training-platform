import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
async function run() {
  const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{GenerationControls}from'./src/app/exam-material/AdminControls';import ArchiveControls from'./src/app/exam-material/ArchiveControls';createRoot(document.getElementById('app')).render(<main className="em-page"><div className="em-container em-stack"><GenerationControls programId="program" generating={false} lectures={[{id:'lecture',fileName:'محاضرة مختارة.pdf',eligible:true,pages:24}]}/><ArchiveControls batch={{id:'old',programId:'program',title:'مادة سابقة',questionCount:10,deleted:location.pathname==='/trash',generating:false}}/></div></main>);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, plugins: [{ name: "router", setup(builder) { builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "mock" })); builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: `export function useRouter(){return{refresh(){},push(url){window.__trainingTestNavigation=url},replace(url){window.__trainingTestNavigation=url}}}`, loader: "js" })); } }] });
  const css = await fs.readFile("src/app/exam-material/exam-material.css", "utf8");
  const calls: Record<string, unknown>[] = [];
  const server = http.createServer(async (request, response) => {
    if (request.url === "/bundle.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].text); return; }
    if (request.url === "/api/exam-material") {
      let body = ""; for await (const chunk of request) body += chunk;
      const data = JSON.parse(body); calls.push(data); response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(data.mode === "generate" || data.mode === "regenerate" ? { id: "new" } : { ok: true })); return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(`<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}${css}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole("checkbox").check();
    const count = page.getByRole("spinbutton", { name: "عدد الأسئلة", exact: true });
    await count.fill(""); assert.equal(await count.inputValue(), "");
    await count.fill("25");
    await page.getByRole("button", { name: "توليد المحتوى الامتحاني", exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { __trainingTestNavigation: string }).__trainingTestNavigation?.includes("batchId=new"));
    assert.equal(calls.find(c => c.mode === "generate")?.count, 25);
    await page.getByRole("button", { name: "إعادة توليد المحتوى", exact: true }).click();
    await page.getByLabel("عدد أسئلة النسخة الجديدة").fill("35");
    await page.getByRole("button", { name: "بدء إعادة التوليد" }).click();
    await page.getByRole("button", { name: "إعادة توليد المحتوى", exact: true }).waitFor();
    assert.equal(calls.find(c => c.mode === "regenerate")?.count, 35);
    await page.getByRole("button", { name: "تعديل عنوان المادة" }).click();
    await page.getByLabel("عنوان المادة", { exact: true }).fill("مراجعة المحاضرة الأولى");
    await page.getByRole("button", { name: "حفظ العنوان" }).click();
    await page.getByRole("button", { name: "تعديل عنوان المادة" }).waitFor();
    assert.equal(calls.find(c => c.action === "rename")?.title, "مراجعة المحاضرة الأولى");
    await page.getByRole("button", { name: "حذف عملية التوليد", exact: true }).click();
    assert.equal(calls.filter(c => c.action === "delete").length, 0);
    await page.getByRole("button", { name: "إلغاء", exact: true }).click();
    await page.getByRole("button", { name: "حذف عملية التوليد", exact: true }).click();
    await page.getByRole("button", { name: "تأكيد حذف العملية" }).click();
    await page.waitForFunction(() => (window as unknown as { __trainingTestNavigation: string }).__trainingTestNavigation?.includes("deleted=true"));
    assert.equal(calls.filter(c => c.action === "delete").length, 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.goto(`http://127.0.0.1:${address.port}/trash`);
    await page.getByRole("button", { name: "استعادة العملية" }).click();
    await page.waitForFunction(() => (window as unknown as { __trainingTestNavigation: string }).__trainingTestNavigation?.includes("batchId=old"));
    assert.equal(calls.filter(c => c.action === "restore").length, 1);
    await page.goto(`http://127.0.0.1:${address.port}/trash`);
    await page.getByRole("button", { name: "حذف نهائي من المحذوفات" }).click();
    assert.equal(calls.filter(c => c.mode === "purge").length, 0);
    await page.getByRole("button", { name: "إلغاء", exact: true }).click();
    await page.getByRole("button", { name: "حذف نهائي من المحذوفات" }).click();
    await page.getByRole("button", { name: "تأكيد الحذف النهائي" }).click();
    await page.waitForFunction(() => (window as unknown as { __trainingTestNavigation: string }).__trainingTestNavigation?.endsWith("deleted=true"));
    assert.equal(calls.filter(c => c.mode === "purge" && c.confirmed === true).length, 1);
    assert.deepEqual(errors, []);
    console.log("PASS: mobile editable count 25; regenerate with 35; archive rename; delete confirmation/cancel; restore; no overflow (real components, fixture API).");
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
