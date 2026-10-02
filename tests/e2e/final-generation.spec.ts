import "dotenv/config";
import { test, expect } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import type { ContentGenerationResult } from "../../src/lib/ai/types";
let prisma: PrismaClient; const programs: { id: string; documentId: string; instructorId: string }[] = [];
test.beforeAll(async () => {
  if (!["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local database required");
  const { PrismaClient } = await import("@prisma/client"); const { PrismaPg } = await import("@prisma/adapter-pg"); prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const instructor = await prisma.instructor.findUniqueOrThrow({ where: { email: "test@example.com" } });
  for (let i = 1; i <= 2; i++) {
    const p = await prisma.trainingProgram.create({ data: { title: `برنامج نهائي مستقل ${i}`, instructorId: instructor.id } });
    const doc = await prisma.trainingDocument.create({ data: { programId: p.id, fileName: `source-${i}.pdf`, storagePath: "local-test", fileSizeBytes: 100, extractionStatus: "COMPLETED", extractionNotes: "EXTRACTION_COMPLETED:1/1" } });
    await prisma.documentPage.create({ data: { documentId: doc.id, pageNumber: 1, extractedText: "تحليل نظم المعلومات الجغرافية يساعد في فهم المواقع والإحداثيات وتخطيط الخدمات وتحديد العلاقات بين الظواهر المكانية.", extractionMethod: "NATIVE_TEXT", extractionStatus: "COMPLETED" } });
    const day = await prisma.trainingDay.create({ data: { programId: p.id, dayNumber: 1, title: "اليوم الأول" } });
    await prisma.question.create({ data: { dayId: day.id, programId: p.id, questionOrder: 1, questionText: "السؤال اليومي الأصلي محفوظ" } });
    programs.push({ id: p.id, documentId: doc.id, instructorId: instructor.id });
  }
});
test.afterAll(async () => { if (prisma) { await prisma.liveSession.deleteMany({ where: { programId: { in: programs.map(p => p.id) } } }); await prisma.trainingProgram.deleteMany({ where: { id: { in: programs.map(p => p.id) } } }); await prisma.$disconnect(); } });
test("both programs show final generation, real progress, saved separate banks and Google Forms buttons", async ({ page, request }) => {
  test.setTimeout(90000);
  const anonymous = await request.get(`/api/final-exam/status?programId=${programs[0].id}`, { maxRedirects: 0 }); expect(anonymous.status()).toBe(307);
  await page.goto("/login"); await page.getByLabel("البريد الإلكتروني").fill("test@example.com"); await page.getByLabel("كلمة المرور").fill("TestPass123!"); await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click(); await expect(page).toHaveURL(/dashboard/);
  await page.goto("/final-exam");
  for (const p of programs) {
    const card = page.locator(`[data-final-program="${p.id}"]`);
    await expect(card.getByRole("button", { name: "توليد الأسئلة النهائية", exact: true })).toBeVisible();
    await expect(card.getByRole("link", { name: "توليد Google Forms للأسئلة النهائية", exact: true })).toHaveAttribute("href", `/google-forms?programId=${p.id}&scope=final`);
  }
  await expect(page.getByRole("button", { name: "توليد الأسئلة النهائية لجميع البرامج الجاهزة" })).toBeVisible();
  const missing = await page.request.post("/api/final-exam/generate", { data: { programId: programs[0].id, documentId: programs[0].documentId } }); expect(missing.status()).toBe(503);
  const foreign = await page.request.post("/api/final-exam/generate", { data: { programId: "foreign", documentId: programs[0].documentId } }); expect(foreign.status()).toBe(404);
  const { FinalGenerationJobs } = await import("../../src/lib/ai/final-jobs");
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const jobs = new FinalGenerationJobs({ name: "TEST", modelId: "TEST", async generate(req) {
    await req.onProgress?.(2); await gate; await req.onProgress?.(7);
    const result: ContentGenerationResult = { days: Array.from({ length: 7 }, (_, i) => ({ dayNumber: i + 1, title: `محور ${i + 1}`, sourcePages: [1], objectives: [], topics: [], contentSummary: "", pageRangeStart: 1, pageRangeEnd: 1 })), questions: Array.from({ length: 35 }, (_, i) => ({ questionType: i < 15 ? "MULTIPLE_CHOICE" : "TRUE_FALSE", questionText: `كيف نحل حالة التقييم النهائي ${i + 1}؟`, dayNumber: Math.floor(i / 5) + 1, questionOrder: i % 5 + 1, sourcePageNumber: 1, explanation: "الإجابة مستندة إلى خصائص التحليل المكاني.", correctLabel: "A", options: (i < 15 ? ["A", "B", "C", "D"] : ["A", "B"]).map((label, j) => ({ label: label as "A" | "B" | "C" | "D", text: i < 15 ? `الإجابة العربية ${j + 1}` : (j === 0 ? "صح" : "خطأ") })) })), modelUsed: "TEST", promptVersion: "test", generatedAt: new Date(), inputTokens: 0, outputTokens: 0 }; return result;
  } });
  const claims = await Promise.all(programs.map(p => jobs.claim(p.id, p.documentId, p.instructorId)));
  const running = Promise.all(programs.map((p, i) => jobs.run(p.id, p.documentId, p.instructorId, claims[i].runId!)));
  try {
    await page.reload();
    for (const p of programs) await expect(page.locator(`[data-final-program="${p.id}"]`).getByRole("status")).toContainText("10 من 35");
  } finally { release(); await running; }
  for (const p of programs) {
    const card = page.locator(`[data-final-program="${p.id}"]`); await expect(card.getByText("الأسئلة النهائية المحفوظة: 35")).toBeVisible({ timeout: 20000 });
    expect(await prisma.question.count({ where: { programId: p.id, day: { dayNumber: 1 } } })).toBe(1);
    await prisma.question.updateMany({ where: { programId: p.id, day: { dayNumber: 0 } }, data: { status: "APPROVED" } });
  }
  await page.goto(`/google-forms?programId=${programs[0].id}&scope=final`);
  await expect(page.getByRole("heading", { name: "مولد Google Forms للأسئلة النهائية" })).toBeVisible();
  await expect(page.getByText("الأسئلة المعتمدة الجاهزة للتصدير: 35")).toBeVisible(); await page.getByRole("button", { name: "تجهيز نموذج Google Forms" }).click();
  const code = await page.getByLabel("كود إنشاء النموذج").inputValue(); expect(code).toContain("الاختبار النهائي"); expect(code).not.toContain("السؤال اليومي الأصلي محفوظ");
  await page.goto(`/questions?programId=${programs[1].id}&scope=final`); await expect(page.getByRole("heading", { name: "مراجعة الأسئلة النهائية" })).toBeVisible(); await expect(page.locator("article.platform-question")).toHaveCount(35);
  await page.goto(`/programs/${programs[0].id}`); await expect(page.getByText("اليوم 0", { exact: true })).toHaveCount(0);
});
