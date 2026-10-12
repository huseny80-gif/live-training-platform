import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { compileGroundedMaterial, gradeMaterial, studentMaterial } from "../src/lib/exam-material/grounding";
import { plan, pages } from "./fixtures/exam-material";
async function run() {
  const generated = compileGroundedMaterial(plan, pages, 5);
  const fixture = studentMaterial(generated.content);
  const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import StudyClient from './src/app/study/[token]/StudyClient'; createRoot(document.getElementById('app')).render(<main className="em-page"><div className="em-container em-stack"><h1>المادة الامتحانية</h1><StudyClient token={'a'.repeat(48)} content={${JSON.stringify(fixture)}} /></div></main>);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" } });
  const css = await fs.readFile("src/app/exam-material/exam-material.css", "utf8");
  const baseCss = await fs.readFile("src/app/brand-tokens.css", "utf8");
  let report: ReturnType<typeof gradeMaterial> | null = null; let starts = 0; let submits = 0;
  const server = http.createServer(async (request, response) => {
    if (request.url === "/bundle.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].text); return; }
    if (request.url?.startsWith("/api/study/")) {
      response.setHeader("Content-Type", "application/json");
      if (request.method === "GET") { response.end(JSON.stringify({ content: fixture, report, hasAttempt: starts > 0 })); return; }
      let raw = ""; for await (const chunk of request) raw += chunk;
      const data = JSON.parse(raw);
      if (data.mode === "start") { starts++; report = null; response.end('{"ok":true}'); return; }
      submits++; report = gradeMaterial(generated.content, data.answers); response.end(JSON.stringify({ report })); return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${baseCss}\n${css}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole("heading", { name: "الملخص المستخرج حرفيًا" }).waitFor({ timeout: 5000 }).catch(async error => { console.error({ errors, body: await page.locator("body").textContent() }); throw error; });
    assert.equal(await page.locator("blockquote").first().textContent(), generated.content.summary[0].text);
    await page.getByRole("button", { name: "خريطة المفاهيم", exact: true }).click();
    await page.locator(".em-map-link").waitFor();
    await page.getByRole("button", { name: "الاختبار التفاعلي", exact: true }).click();
    for (const [i, q] of generated.content.questions.entries()) {
      const answer = i === 1 ? (q.correctIndex + 1) % 4 : q.correctIndex;
      await page.locator(`input[name="${q.id}"]`).nth(answer).check();
    }
    await page.getByRole("button", { name: "إنهاء الاختبار وعرض الثغرات المعرفية" }).click();
    await page.getByRole("heading", { name: "كاشف الثغرات المعرفية" }).waitFor();
    assert.equal(starts, 1); assert.equal(submits, 1);
    assert.equal(await page.locator(".em-kicker").filter({ hasText: "مفهوم يحتاج إلى مراجعة" }).count(), 1);
    assert.equal(await page.getByRole("heading", { name: "4 / 5", exact: true }).count(), 1);
    await page.locator(".em-citation summary").first().click();
    assert.ok((await page.getByRole("link", { name: "مراجعة الفقرة في المحاضرة ←" }).first().getAttribute("href"))?.includes("#L2"));
    assert.equal(await page.getByText("دليل المناقشة الذكي للمدير").count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: "/tmp/exam-material-mobile.png", fullPage: true });
    await page.reload();
    await page.getByRole("button", { name: "الاختبار التفاعلي", exact: true }).click();
    await page.getByRole("heading", { name: "كاشف الثغرات المعرفية" }).waitFor();
    assert.equal(submits, 1);
    await page.getByRole("button", { name: "بدء محاولة تعلم جديدة" }).click();
    await page.getByRole("button", { name: "إنهاء الاختبار وعرض الثغرات المعرفية" }).waitFor();
    assert.equal(starts, 2);
    assert.equal(await page.locator('input[type="radio"]:checked').count(), 0);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "خريطة المفاهيم", exact: true }).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: "/tmp/exam-material-desktop.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log("PASS: mobile/desktop no overflow; summary/map navigation; interactive quiz; exact gap/source link; reload recovery; fresh attempt resets answers; no browser errors (fixture API, real components).");
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
