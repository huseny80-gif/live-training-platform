import "dotenv/config";
import { test, expect } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import { generatedCourseFixture } from "../helpers/generation";
import { textPdf } from "../helpers/pdf";
import { storage } from "../../src/lib/storage";
import { randomUUID } from "node:crypto";

let prisma: PrismaClient;
let programId: string;
let documentId: string;
let foreignProgramId: string;
let foreignInstructorId: string;
let foreignDocumentId: string;
const key = `e2e-recovery-${randomUUID()}/source.pdf`;

test.beforeAll(async () => {
  expect(["localhost", "127.0.0.1", "::1"]).toContain(new URL(process.env.DATABASE_URL!).hostname);
  // This checks an actual missing-provider failure; it must never spend real API credits.
  expect(process.env.ANTHROPIC_API_KEY).toBeFalsy();
  expect(process.env.LLAMA_CLOUD_API_KEY).toBeFalsy();
  expect(process.env.BLOB_READ_WRITE_TOKEN).toBeFalsy();
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const instructor = await prisma.instructor.findUniqueOrThrow({ where: { email: "test@example.com" } });
  const program = await prisma.trainingProgram.create({ data: { instructorId: instructor.id, title: "اختبار إعادة معالجة PDF", language: "AR" } });
  programId = program.id;
  await storage.save(key, textPdf(147), "application/pdf");
  const document = await prisma.trainingDocument.create({ data: {
    programId, fileName: "GIS_Training_course.pdf", storagePath: key, fileSizeBytes: textPdf(147).length,
    mimeType: "application/pdf", pageCount: 147, extractionStatus: "PROCESSING", extractionNotes: null, updatedAt: new Date(Date.now() - 7 * 60 * 1000),
  } });
  documentId = document.id;
  for (let n = 1; n <= 10; n++) await prisma.trainingDay.create({ data: { programId, dayNumber: n, title: `اليوم ${n}`, objectives: [] } });
  const foreign = await prisma.instructor.create({ data: { email: `e2e-foreign-${randomUUID()}@example.com`, passwordHash: "test-only", name: "مدرب آخر" } });
  foreignInstructorId = foreign.id;
  const foreignProgram = await prisma.trainingProgram.create({ data: { instructorId: foreign.id, title: "برنامج مدرب آخر" } });
  foreignProgramId = foreignProgram.id;
  const foreignDocument = await prisma.trainingDocument.create({ data: { programId: foreignProgramId, fileName: "private.pdf", storagePath: key, fileSizeBytes: 1, mimeType: "application/pdf", extractionStatus: "FAILED" } });
  foreignDocumentId = foreignDocument.id;
});
test.afterAll(async () => {
  if (prisma) {
    if (programId) {
      const documents = await prisma.trainingDocument.findMany({ where: { programId }, select: { storagePath: true } });
      for (const document of documents) await storage.delete(document.storagePath);
      await prisma.trainingProgram.delete({ where: { id: programId } });
    }
    if (foreignProgramId) await prisma.trainingProgram.delete({ where: { id: foreignProgramId } });
    if (foreignInstructorId) await prisma.instructor.delete({ where: { id: foreignInstructorId } });
    await prisma.$disconnect();
  }
  await storage.delete(key);
});

test("PDF acceptance recovers a stale upload and extracts 147 real pages without generating questions", async ({ page, request }) => {
  test.setTimeout(90000);
  const unauthenticated = await request.post("/api/documents/process", { data: { documentId, programId }, maxRedirects: 0 });
  expect(unauthenticated.status()).toBe(307);
  expect(unauthenticated.headers().location).toContain("/login");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill("test@example.com");
  await page.getByLabel("كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const forbidden = await page.request.post("/api/documents/process", { data: { programId: foreignProgramId, documentId: foreignDocumentId } });
  expect(forbidden.status()).toBe(404);
  const untouched = await prisma.trainingDocument.findUniqueOrThrow({ where: { id: foreignDocumentId } });
  expect(untouched.extractionStatus).toBe("FAILED");
  let statusRequests = 0;
  await page.route("**/api/documents/status?*", route => { statusRequests++; return route.fulfill({ status: 503, body: "unavailable" }); });
  await page.goto(`/programs/${programId}`);
  await expect(page.getByText("GIS_Training_course.pdf")).toBeVisible();
  await expect(page.locator("p[role=alert]")).toContainText("انتهت مهلة المعالجة", { timeout: 20000 });
  expect(statusRequests).toBe(0); // Server rendering recovered the stale job without any polling request.
  await page.unroute("**/api/documents/status?*");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  const initialDays = await prisma.trainingDay.findMany({ where: { programId }, orderBy: { dayNumber: "asc" } });
  const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/documents/process") && r.request().method() === "POST");
  await page.getByRole("button", { name: "إعادة المعالجة" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  await expect(page.getByText("تم قبول المستند واستخراج النص", { exact: true })).toBeVisible({ timeout: 60000 });
  const accepted = await prisma.trainingDocument.findUniqueOrThrow({ where: { id: documentId } });
  expect(accepted.extractionStatus).toBe("COMPLETED");
  expect(accepted.extractionNotes).toBe("EXTRACTION_COMPLETED: 147/147");
  expect(accepted.extractedAt).not.toBeNull();
  await expect(page.getByText("ANTHROPIC_API_KEY", { exact: false })).toHaveCount(0);
  const pages = await prisma.documentPage.findMany({ where: { documentId } });
  expect(pages).toHaveLength(147);
  expect(pages.every(p => p.extractionMethod === "NATIVE_TEXT")).toBeTruthy();
  expect(pages.find(p => p.pageNumber === 147)?.extractedText).toContain("GIS source page 147");
  const finalDays = await prisma.trainingDay.findMany({ where: { programId }, orderBy: { dayNumber: "asc" } });
  expect(finalDays.map(d => d.id)).toEqual(initialDays.map(d => d.id));
  expect(await prisma.question.count({ where: { programId } })).toBe(0);
});


test("failed status polling is visible and refreshing recovers a stale job", async ({ page }) => {
  await prisma.trainingDocument.update({ where: { id: documentId }, data: { extractionStatus: "PROCESSING", extractionNotes: "PROCESSING_EXTRACTING", updatedAt: new Date() } });
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill("test@example.com");
  await page.getByLabel("كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.route("**/api/documents/status?*", route => route.fulfill({ status: 503, body: "unavailable" }));
  await page.goto(`/programs/${programId}`);
  await expect(page.getByText("جاري التحقق من الملف واستخراج نصه…")).toBeVisible();
  await expect(page.locator("p[role=alert]")).toContainText("تعذّر الاتصال لمتابعة حالة المستند", { timeout: 15000 });
  expect((await prisma.trainingDocument.findUniqueOrThrow({ where: { id: documentId } })).extractionStatus).toBe("PROCESSING");
  await prisma.trainingDocument.update({ where: { id: documentId }, data: { updatedAt: new Date(Date.now() - 7 * 60 * 1000) } });
  await page.getByRole("button", { name: "تحديث الحالة", exact: true }).click();
  await expect(page.getByRole("button", { name: "إعادة المعالجة" })).toBeVisible();
  await expect(page.locator("p[role=alert]")).toContainText("انتهت مهلة المعالجة");
  expect(await prisma.question.count({ where: { programId } })).toBe(0);
  expect(await prisma.trainingDay.count({ where: { programId } })).toBe(10);
});


test("uploading a PDF accepts and saves the real file while leaving questions for later", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill("test@example.com");
  await page.getByLabel("كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/programs/${programId}`);
  const buffer = textPdf(147);
  const uploadedResponse = page.waitForResponse(response => response.url().endsWith("/api/documents/upload") && response.request().method() === "POST");
  await page.locator('input[type="file"]').setInputFiles({ name: "GIS_upload_acceptance.pdf", mimeType: "application/pdf", buffer });
  const uploaded = await uploadedResponse;
  expect(uploaded.status()).toBe(201);
  const payload = await uploaded.json();
  expect(payload.pageCount).toBe(147);
  await expect(page.getByText("تم قبول الملف وحفظه واستخراج نصه بنجاح.", { exact: true })).toBeVisible({ timeout: 60000 });
  const document = await prisma.trainingDocument.findUniqueOrThrow({ where: { id: payload.documentId } });
  expect(document.extractionStatus).toBe("COMPLETED");
  expect((await storage.read(document.storagePath)).equals(buffer)).toBeTruthy();
  expect(await prisma.documentPage.count({ where: { documentId: document.id, extractionMethod: "NATIVE_TEXT", extractionStatus: "COMPLETED" } })).toBe(147);
  expect(await prisma.question.count({ where: { programId } })).toBe(0);
  expect(await prisma.trainingDay.count({ where: { programId } })).toBe(10);
});


test("generation is a separate authorized action and configuration failures keep the PDF accepted", async ({ page, request }) => {
  const uploaded = await prisma.trainingDocument.findFirstOrThrow({ where: { programId, fileName: "GIS_upload_acceptance.pdf" } });
  const anonymous = await request.post("/api/documents/generate", { data: { documentId: uploaded.id, programId }, maxRedirects: 0 });
  expect(anonymous.status()).toBe(307);
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill("test@example.com");
  await page.getByLabel("كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const forbidden = await page.request.post("/api/documents/generate", { data: { programId: foreignProgramId, documentId: foreignDocumentId } });
  expect(forbidden.status()).toBe(404);
  await page.goto(`/programs/${programId}`);
  const card = page.locator(`[data-document-id="${uploaded.id}"]`);
  await expect(card.getByText("تم قبول المستند واستخراج النص", { exact: true })).toBeVisible();
  const responsePromise = page.waitForResponse(response => response.url().endsWith("/api/documents/generate") && response.request().method() === "POST");
  await card.getByRole("button", { name: "توليد الأسئلة", exact: true }).click();
  expect((await responsePromise).status()).toBe(503);
  await expect(card.getByRole("alert")).toContainText("خدمة توليد الأسئلة غير مهيأة");
  expect((await prisma.trainingDocument.findUniqueOrThrow({ where: { id: uploaded.id } })).extractionStatus).toBe("COMPLETED");
  expect(await prisma.documentPage.count({ where: { documentId: uploaded.id } })).toBe(147);
  expect(await prisma.question.count({ where: { programId } })).toBe(0);
});


test("generation progress and 50 saved questions appear without changing the accepted pages", async ({ page }) => {
  test.setTimeout(90000);
  const document = await prisma.trainingDocument.findFirstOrThrow({ where: { programId, fileName: "GIS_upload_acceptance.pdf" } });
  const instructor = await prisma.instructor.findUniqueOrThrow({ where: { email: "test@example.com" } });
  const before = await prisma.documentPage.findMany({ where: { documentId: document.id }, orderBy: { pageNumber: "asc" }, select: { id: true } });
  const { GenerationJobs } = await import("../../src/lib/ai/jobs");
  const { ContentGenerationService } = await import("../../src/lib/ai/service");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  // Only the test runner supplies a controlled AI response; the production server stays unmodified.
  const jobs = new GenerationJobs(new ContentGenerationService({ name: "TEST_ONLY", modelId: "TEST_ONLY", generate: async request => {
    await request.onProgress?.(2);
    await gate;
    await request.onProgress?.(10);
    return generatedCourseFixture();
  } }));
  const claim = await jobs.claim(document.id, programId, instructor.id);
  expect(claim.status).toBe("STARTED");
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill("test@example.com");
  await page.getByLabel("كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/programs/${programId}`);
  const card = page.locator(`[data-document-id="${document.id}"]`);
  await expect(card.getByText("جاري إعداد خطة الأيام وتوليد الأسئلة…")).toBeVisible();
  const running = jobs.run(document.id, programId, instructor.id, claim.runId!);
  try {
    await expect(card.getByText("جاري التوليد… اكتملت أسئلة 2 من 10 أيام.")).toBeVisible({ timeout: 15000 });
    release(); await running;
    await expect(card.getByText("تم توليد 50 سؤالاً موزعة على 10 أيام تدريبية.")).toBeVisible({ timeout: 15000 });
    await expect(card.getByRole("link", { name: "مراجعة الأسئلة" })).toBeVisible();
    expect(await prisma.question.count({ where: { programId } })).toBe(50);
    const after = await prisma.documentPage.findMany({ where: { documentId: document.id }, orderBy: { pageNumber: "asc" }, select: { id: true } });
    expect(after).toEqual(before);
    expect((await prisma.trainingDocument.findUniqueOrThrow({ where: { id: document.id } })).extractionStatus).toBe("COMPLETED");
  } finally { release(); await running; }
});
