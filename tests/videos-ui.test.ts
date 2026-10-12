import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
async function run() {
  const transcript = "1\n00:04:20,000 --> 00:04:40,000\nنص المقطع الأصلي.";
  const video = { id: "video", title: "فيديو المراجعة", mediaUrl: "https://youtu.be/abcdefghijk", archived: false, cues: 1, duration: "04:40", transcript };
  const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import VideoControls from'./src/app/exam-material/VideoControls';import{GenerationControls}from'./src/app/exam-material/AdminControls';const video=${JSON.stringify(video)};createRoot(document.getElementById('app')).render(<main className="em-page"><div className="em-container em-stack"><GenerationControls programId="program" generating={false} lectures={Array.from({length:6},(_,i)=>({id:"lecture"+i,fileName:"GIS-Part"+i+".pdf",pages:24,eligible:i!==5}))} videos={[video]}/><VideoControls programId="program" libraryVideos={[{id:"10000000-0000-4000-8000-000000000003",title:"GIS Library"}]} videos={[{...video,archived:location.pathname==='/trash'}]}/></div></main>);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, plugins: [{ name: "router", setup(builder) { builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "mock" })); builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: `export function useRouter(){return{refresh(){window.__refreshed=(window.__refreshed||0)+1},push(url){window.__nav=url}}}`, loader: "js" })); } }] });
  const calls: Record<string, unknown>[] = [], css = await fs.readFile("src/app/exam-material/exam-material.css", "utf8");
  const server = http.createServer(async (req, res) => {
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); return; }
    if (req.method === "POST") { let body = ""; for await (const part of req) body += part; calls.push(JSON.parse(body)); res.setHeader("Content-Type", "application/json"); res.end('{"id":"new","ok":true}'); return; }
    res.setHeader("Content-Type", "text/html; charset=utf-8");res.end(`<!doctype html><html dir="rtl" lang="ar"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}${css}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address(); assert.ok(addr && typeof addr !== "string");
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message)); await page.goto(`http://127.0.0.1:${addr.port}`);
    for (const [width, columns] of [[390, 1], [882, 2], [1280, 3]]) {
      await page.setViewportSize({width,height:900});
      const grid = page.locator(".em-source-cards").first();
      const measured = await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      assert.equal(measured, columns); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole("checkbox", { name: /فيديو المراجعة/ }).check();
    await page.getByRole("spinbutton").fill("25"); await page.getByRole("button", { name: "توليد المحتوى الامتحاني" }).click();
    await page.waitForFunction(() => Boolean((window as unknown as { __nav: string }).__nav));
    assert.deepEqual(calls[0].videoIds, ["video"]); assert.deepEqual(calls[0].documentIds, []); assert.equal(calls[0].count, 25);
    await page.getByText("إدارة الفيديوهات وتفريغها النصي", { exact: true }).click();
    await page.getByLabel("فيديو من مكتبة الموارد الرقمية").selectOption("10000000-0000-4000-8000-000000000003");
    assert.equal(await page.locator("video").getAttribute("src"), "/api/resources/10000000-0000-4000-8000-000000000003/file");
    await page.getByLabel("عنوان الفيديو", { exact: true }).fill("فيديو جديد");
    await page.getByLabel("ملف التفريغ SRT / VTT").setInputFiles({ name: "captions.srt", mimeType: "application/x-subrip", buffer: Buffer.from(transcript) });
    await page.getByLabel("التفريغ النصي مع التوقيت").waitFor();
    await page.waitForFunction(t => (document.querySelector("textarea") as HTMLTextAreaElement).value === t, transcript);
    assert.equal(await page.getByRole("button", { name: "إضافة الفيديو وتفريغه" }).isDisabled(), true);
    await page.getByRole("checkbox", { name: /راجعت النص والتوقيت/ }).check();
    await page.getByRole("button", { name: "إضافة الفيديو وتفريغه" }).click();
    await page.waitForFunction(() => (document.querySelector("textarea") as HTMLTextAreaElement).value === "");
    assert.equal(calls[1].mediaUrl, "/api/resources/10000000-0000-4000-8000-000000000003/file");
    assert.equal(calls[1].transcript, transcript); assert.equal(calls[1].sourceReviewed, true);
    await page.getByRole("button", { name: "تعديل", exact: true }).click();
    assert.equal(await page.getByLabel("التفريغ النصي مع التوقيت").inputValue(), transcript);
    assert.equal(await page.getByRole("button", { name: "حفظ النسخة المحدّثة" }).isDisabled(), true);
    await page.getByRole("checkbox", { name: /راجعت النص والتوقيت/ }).check();
    await page.getByRole("button", { name: "حفظ النسخة المحدّثة" }).click();
    await page.getByRole("button", { name: "إضافة الفيديو وتفريغه" }).waitFor();
    assert.equal(calls[2].id, "video");
    page.once("dialog", d => d.dismiss()); await page.getByRole("button", { name: "حذف", exact: true }).click(); assert.equal(calls.length, 3);
    page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "حذف", exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { __refreshed: number }).__refreshed === 4);
    assert.equal(calls[3].archived, true); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: "/tmp/video-module-mobile.png", fullPage: true });
    await page.goto(`http://127.0.0.1:${addr.port}/trash`); await page.getByText("إدارة الفيديوهات وتفريغها النصي", { exact: true }).click();
    await page.getByRole("button", { name: "استعادة", exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { __refreshed: number }).__refreshed === 1);
    assert.equal(calls[4].archived, false); assert.deepEqual(errors, []);
    console.log("PASS: real mobile components select video-only sources/count25; file upload, attestation, edit, delete/cancel and restore; no overflow or JS errors (fixture API).");
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
