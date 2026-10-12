import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { defaultCategories, type ResourceItem } from "../src/lib/resources/types";
async function run() {
  const items: ResourceItem[] = [
    { id: "exam", categoryKey: "exams", title: "مادة GIS", kind: "exam", date: "2026-10-12T10:00:00Z", previewUrl: "/exam-material?batchId=exam", downloadUrl: "/api/resources/exports/exam/exam" },
    { id: "word", categoryKey: "docs", title: "دليل متدرب GIS", kind: "file", date: "2026-10-12T10:00:00Z", sizeBytes: 4096, detail: "دليل.docx", previewUrl: "/resources/word", downloadUrl: "/api/resources/word/file?download=1" },
    { id: "trash", categoryKey: "docs", title: "ملف محذوف", kind: "file", date: "2026-10-12T10:00:00Z", archived: true, previewUrl: "/resources/trash" },
  ];
  items.forEach(i => Object.assign(i, { programId: "program" }));
  items.push({ id: "task", categoryKey: "assignments", title: "المهمة الثانية", kind: "file", date: "2026-10-12T10:00:00Z", previewUrl: "/resources/task", ...{ programId: "second" } });
  const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import ResourceLibrary from'./src/app/resources/ResourceLibrary';createRoot(document.getElementById('app')).render(<main className="em-page"><div className="rl-container"><ResourceLibrary programId={location.pathname==='/all'?null:'program'} programTitle="نظم المعلومات الجغرافية" programs={[{id:'program',title:'نظم المعلومات الجغرافية'},{id:'second',title:'دورة ثانية'}]} categories={${JSON.stringify([...defaultCategories,{key:"maps-second",name:"خرائط تطبيقية",icon:"📁",programId:"second"}])}} items={${JSON.stringify(items)}}/></div></main>);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, plugins: [{ name: "mock", setup(b) { b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "mock" })); b.onLoad({ filter: /./, namespace: "mock" }, () => ({ contents: `export function useRouter(){return{refresh(){window.__refresh=(window.__refresh||0)+1}}}`, loader: "js" })); } }] });
  const css = (await fs.readFile("src/app/exam-material/exam-material.css", "utf8")) + (await fs.readFile("src/app/resources/resources.css", "utf8"));
  const calls: Record<string, unknown>[] = [], uploads: { name: string; size: number }[] = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); return; }
    if (req.url === "/api/resources") { let body = ""; for await (const part of req) body += part; const data = JSON.parse(body); calls.push(data); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data.mode === "reserve" ? { id: "new", mode: "direct" } : { ok: true })); return; }
    if (req.url === "/api/resources/upload") { const parts: Buffer[] = []; for await (const p of req) parts.push(p); const body = Buffer.concat(parts); const form = await new Request("http://localhost/upload", { method: "POST", headers: { "content-type": req.headers["content-type"]! }, body }).formData(); const file = form.get("file") as File; uploads.push({ name: file.name, size: file.size }); res.setHeader("Content-Type", "application/json"); res.end('{"ok":true}'); return; }
    res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(`<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}${css}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    assert.equal(await page.getByRole("heading", { name: "مادة GIS", exact: true }).count(), 1);
    await page.getByRole("searchbox").fill("دليل"); assert.equal(await page.getByRole("heading", { name: "دليل متدرب GIS", exact: true }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "مادة GIS", exact: true }).count(), 0);
    assert.equal(await page.getByRole("link", { name: "تحميل", exact: true }).getAttribute("href"), "/api/resources/word/file?download=1");
    page.once("dialog", d => d.accept("عنوان جديد للمورد")); await page.getByRole("button", { name: "تعديل العنوان" }).click();
    await page.getByRole("status").waitFor(); assert.equal(calls[0].title, "عنوان جديد للمورد");
    page.once("dialog", d => d.dismiss()); await page.getByRole("button", { name: "حذف", exact: true }).click(); assert.equal(calls.length, 1);
    page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "حذف", exact: true }).click();
    await page.waitForFunction(() => (window as any).__refresh === 2); assert.equal(calls[1].action, "delete");
    await page.getByRole("searchbox").fill(""); await page.getByRole("button", { name: /المحذوفات/ }).click();
    await page.getByRole("button", { name: "استعادة" }).click(); await page.waitForFunction(() => (window as any).__refresh === 3); assert.equal(calls[2].action, "restore");
    await page.getByRole("button", { name: "+ إضافة قسم", exact: true }).click(); await page.getByRole("dialog").waitFor();
    await page.getByLabel("العنوان", { exact: true }).fill("خرائط تطبيقية"); await page.getByRole("button", { name: "حفظ وإضافة" }).click(); await page.getByRole("dialog").waitFor({ state: "detached" }); assert.equal(calls[3].mode, "category");
    await page.getByRole("button", { name: "+ إضافة مورد جديد للمكتبة", exact: true }).click();
    await page.getByLabel("العنوان", { exact: true }).fill("الملف الأصلي"); await page.getByLabel("القسم المستهدف").selectOption("docs");
    await page.getByLabel("الملف الأصلي", { exact: true }).setInputFiles({ name: "دليل.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("fixture-original-file") });
    await page.getByRole("button", { name: "حفظ وإضافة" }).click(); await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.deepEqual(calls[4].input, { programId: "program", categoryKey: "docs", title: "الملف الأصلي", fileName: "دليل.docx", sizeBytes: 21 }); assert.deepEqual(uploads, [{ name: "دليل.docx", size: 21 }]);
    await page.getByRole("button", { name: "الموارد النشطة", exact: true }).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: "/tmp/resources-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: "/tmp/resources-desktop.png", fullPage: true });
    await page.getByRole("button", { name: "+ إضافة قسم", exact: true }).click(); await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(await page.getByRole("button", { name: "+ إضافة قسم", exact: true }).evaluate(el => document.activeElement === el), true);
    await page.goto(`http://127.0.0.1:${address.port}/all`);
    await page.getByRole("searchbox").fill("دورة ثانية");
    assert.equal(await page.getByRole("heading", {name:"المهمة الثانية",exact:true}).count(),1);
    assert.equal(await page.getByRole("heading", {name:"مادة GIS",exact:true}).count(),0);
    await page.getByRole("button", {name:"+ إضافة مورد جديد للمكتبة",exact:true}).click();
    await page.getByLabel("العنوان",{exact:true}).fill("ملف الدورة الثانية");
    assert.equal(await page.getByLabel("القسم المستهدف").locator('option[value="maps-second"]').count(),0);
    await page.getByLabel("البرنامج المستهدف").selectOption("second");
    await page.getByLabel("القسم المستهدف").selectOption("maps-second");
    await page.getByLabel("الملف الأصلي",{exact:true}).setInputFiles({name:"task.txt",mimeType:"text/plain",buffer:Buffer.from("source")});
    await page.getByRole("button",{name:"حفظ وإضافة"}).click(); await page.getByRole("dialog").waitFor({state:"detached"});
    assert.equal((calls.at(-1)!.input as any).programId,"second"); assert.equal((calls.at(-1)!.input as any).categoryKey,"maps-second");
    assert.deepEqual(errors, []); console.log("PASS: real library components on mobile/desktop; cross-category search, exact download link, rename/trash/cancel/restore; persisted category request and original file bytes/name/size upload; dialog Escape/focus and no overflow (fixture API).");
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
