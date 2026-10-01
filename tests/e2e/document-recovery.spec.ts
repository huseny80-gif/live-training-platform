import "dotenv/config";
import { test, expect } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
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
    if (programId) await prisma.trainingProgram.delete({ where: { id: programId } });
    if (foreignProgramId) await prisma.trainingProgram.delete({ where: { id: foreignProgramId } });
    if (foreignInstructorId) await prisma.instructor.delete({ where: { id: foreignInstructorId } });
    await prisma.$disconnect();
  }
  await storage.delete(key);
});

test("failed PDF retries through the real production route and shows actionable Arabic errors", async ({ page, request }) => {
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
  await page.goto(`/programs/${programId}`);
  await expect(page.getByText("GIS_Training_course.pdf")).toBeVisible();
  await expect(page.locator("p[role=alert]")).toContainText("انتهت مهلة المعالجة", { timeout: 20000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  const initialDays = await prisma.trainingDay.findMany({ where: { programId }, orderBy: { dayNumber: "asc" } });
  const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/documents/process") && r.request().method() === "POST");
  await page.getByRole("button", { name: "إعادة المعالجة" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  await expect(page.locator("p[role=alert]")).toContainText("خدمة توليد الأسئلة غير مهيأة", { timeout: 60000 });
  await expect(page.getByRole("button", { name: "إعادة المعالجة" })).toBeEnabled();
  await expect(page.getByText("ANTHROPIC_API_KEY", { exact: false })).toHaveCount(0);
  const pages = await prisma.documentPage.findMany({ where: { documentId } });
  expect(pages).toHaveLength(147);
  expect(pages.every(p => p.extractionMethod === "NATIVE_TEXT")).toBeTruthy();
  expect(pages.find(p => p.pageNumber === 147)?.extractedText).toContain("GIS source page 147");
  const finalDays = await prisma.trainingDay.findMany({ where: { programId }, orderBy: { dayNumber: "asc" } });
  expect(finalDays.map(d => d.id)).toEqual(initialDays.map(d => d.id));
  expect(await prisma.question.count({ where: { programId } })).toBe(0);
});
