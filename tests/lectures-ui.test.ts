import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
async function run() {
  const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import LectureControls from './src/app/programs/[id]/lectures/LectureControls'; createRoot(document.getElementById('app')).render(<main className="em-page"><div className="em-container em-stack"><h1>إدارة المحاضرات</h1><LectureControls programId="program" document={{id:'old', fileName:'المحاضرة الأولى.pdf', archived:false, busy:false}}/></div></main>);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, plugins: [{ name: "server-and-router-fixtures", setup(builder) {
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "fixture" }));
    builder.onResolve({ filter: /^@\/app\/actions\/documents$/ }, () => ({ path: "actions", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "router" ? `export function useRouter(){return {refresh(){},replace(url){window.lastNavigation=url;}}}` : `async function action(name,args){const response=await fetch('/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})});return response.json();} export const deleteDocument=(...args)=>action('delete',args); export const restoreDocument=(...args)=>action('restore',args); export const updateDocumentName=(...args)=>action('rename',args); export const replaceDocument=(...args)=>action('replace',args); export const completeBlobUpload=(...args)=>action('complete',args);`, loader: "js" }));
  } }] });
  const css = await fs.readFile("src/app/exam-material/exam-material.css", "utf8") + await fs.readFile("src/app/programs/[id]/lectures/lectures.css", "utf8");
  const base = await fs.readFile("src/app/brand-tokens.css", "utf8") + await fs.readFile("src/app/portfolio-ui.css", "utf8");
  const calls: { name: string; args: string[] }[] = [];
  let successful = false;
  const server = http.createServer(async (request, response) => {
    if (request.url === "/bundle.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].text); return; }
    if (request.url?.startsWith("/api/") || request.url === "/actions") {
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/api/documents/upload-url") { response.end('{"mode":"direct"}'); return; }
      if (request.url === "/api/documents/upload") { for await (const _ of request) {} response.end('{"documentId":"new","fileName":"updated.pdf","pageCount":2}'); return; }
      let raw = ""; for await (const chunk of request) raw += chunk;
      if (request.url === "/api/documents/process") { response.statusCode = successful ? 200 : 400; response.end(successful ? '{"status":"COMPLETED"}' : '{"error":"فشلت معالجة النسخة الجديدة"}'); return; }
      calls.push(JSON.parse(raw)); response.end('{"success":true}'); return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${base}\n${css}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole("button", { name: "تعديل اسم المحاضرة" }).click();
    await page.getByLabel("اسم المحاضرة", { exact: true }).fill("محاضرة معدّلة");
    await page.getByRole("button", { name: "حفظ الاسم" }).click();
    await page.getByText("تم تعديل اسم المحاضرة.", { exact: true }).waitFor();
    assert.deepEqual(calls[0], { name: "rename", args: ["old", "محاضرة معدّلة"] });
    await page.getByRole("button", { name: "حذف المحاضرة", exact: true }).click();
    assert.equal(calls.filter(c => c.name === "delete").length, 0);
    await page.getByRole("button", { name: "إلغاء", exact: true }).click();
    assert.equal(calls.filter(c => c.name === "delete").length, 0);
    await page.getByRole("button", { name: "حذف المحاضرة", exact: true }).click();
    await page.getByRole("button", { name: "تأكيد حذف المحاضرة" }).click();
    await page.getByText("حُذفت المحاضرة من المحتوى النشط وحُفظت في الأرشيف.").waitFor();
    assert.equal(calls.filter(c => c.name === "delete").length, 1);
    await page.reload();
    await page.getByRole("button", { name: "تعديل المحتوى / استبدال PDF" }).click();
    const file = { name: "updated.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 fixture") };
    await page.getByLabel("ملف المحاضرة المحدّث").setInputFiles(file);
    await page.getByText("فشلت معالجة النسخة الجديدة", { exact: true }).waitFor();
    assert.equal(calls.filter(c => c.name === "replace").length, 0);
    successful = true;
    await page.getByLabel("ملف المحاضرة المحدّث").setInputFiles(file);
    await page.getByText("تم قبول النسخة الجديدة واستبدال المحاضرة. النسخة السابقة محفوظة في الأرشيف.").waitFor();
    assert.deepEqual(calls.find(c => c.name === "replace"), { name: "replace", args: ["old", "new"] });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: "/tmp/lecture-management-mobile.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log("PASS: mobile rename; delete confirmation/cancel; failed extraction keeps original; successful replacement only after processing; no overflow/browser errors (real components, fixture actions/upload API).");
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
