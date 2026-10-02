import "dotenv/config";
import { test, expect } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
let prisma: PrismaClient; let programId: string; let foreignId: string; let otherId: string;
test.beforeAll(async () => {
  if (!["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local database required");
  const { PrismaClient } = await import("@prisma/client"); const { PrismaPg } = await import("@prisma/adapter-pg");
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const user = await prisma.instructor.findUniqueOrThrow({ where: { email: "test@example.com" } });
  const program = await prisma.trainingProgram.create({ data: { title: "اختبار أقسام المنصة", instructorId: user.id } }); programId = program.id;
  const other = await prisma.instructor.create({ data: { email: `sections-${Date.now()}@example.com`, name: "آخر", passwordHash: "x" } }); otherId = other.id;
  foreignId = (await prisma.trainingProgram.create({ data: { title: "محتوى خاص لا يظهر", instructorId: otherId } })).id;
  for (let number = 1; number <= 2; number++) {
    const day = await prisma.trainingDay.create({ data: { programId, dayNumber: number, title: `اليوم ${number}` } });
    const q = await prisma.question.create({ data: { dayId: day.id, programId, questionText: `ما الإجابة لليوم ${number}؟`, questionOrder: 1, status: number === 1 ? "APPROVED" : "DRAFT", options: { create: [{ optionLabel: "A", optionText: "الإجابة الصحيحة", displayOrder: 1 }, { optionLabel: "B", optionText: "الإجابة الأخرى", displayOrder: 2 }] } }, include: { options: true } });
    await prisma.question.update({ where: { id: q.id }, data: { correctOptionId: q.options.find(o => o.optionLabel === "A")!.id } });
  }
});
test.afterAll(async () => {
  if (prisma) { await prisma.liveSession.deleteMany({ where: { programId } }); await prisma.trainingProgram.deleteMany({ where: { id: { in: [programId, foreignId] } } }); await prisma.instructor.delete({ where: { id: otherId } }); await prisma.$disconnect(); }
});
test("identity and about are visible while account settings require authentication", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/about");
  await expect(page.getByRole("heading", { name: "من نحن" })).toBeVisible(); await expect(page.getByText("Eng.Husen Yasen")).toBeVisible();
  await expect(page.getByRole("img", { name: "شعار المنصة" })).toBeVisible();
  await expect(page.locator('nav[aria-label="أقسام المنصة"]').getByRole("link", { name: "الأسئلة النهائية" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/settings"); await expect(page).toHaveURL(/\/login/);
});
test("review, independent final exam and Google Forms use only owned approved content", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/login"); await page.getByLabel("البريد الإلكتروني").fill("test@example.com"); await page.getByLabel("كلمة المرور").fill("TestPass123!"); await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click(); await expect(page).toHaveURL(/dashboard/);
  await page.goto(`/questions?programId=${foreignId}`); await expect(page.getByText("محتوى خاص لا يظهر")).toHaveCount(0);
  await page.goto(`/questions?programId=${programId}`); await expect(page.getByRole("heading", { name: "مراجعة الأسئلة", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "اعتماد السؤال" }).click(); await expect(page.getByRole("button", { name: "اعتماد السؤال" })).toHaveCount(0);
  await page.goto(`/final-exam?programId=${programId}`); await page.getByLabel("عدد أسئلة الاختبار النهائي").fill("2"); await page.getByRole("button", { name: "إنشاء اختبار نهائي", exact: true }).click(); await expect(page).toHaveURL(/\/sessions\//);
  const exam = await prisma.liveSession.findFirstOrThrow({ where: { programId, dayNumber: 0 }, include: { sessionQuestions: { include: { question: { include: { day: true } } } } } });
  expect(exam.sessionQuestions).toHaveLength(2); expect(new Set(exam.sessionQuestions.map(q => q.question.day.dayNumber)).size).toBe(2); expect(exam.scoringConfig).toEqual({ assessmentType: "FINAL" });
  await page.goto(`/google-forms?programId=${programId}&examId=${exam.id}`); await page.getByRole("button", { name: "تجهيز نموذج Google Forms" }).click();
  await expect(page.getByLabel("كود إنشاء النموذج")).toHaveValue(/FormApp.create/); const download = page.waitForEvent("download"); await page.getByRole("button", { name: "تحميل ملف النموذج" }).click(); expect((await download).suggestedFilename()).toBe("training-quiz.gs");
  await page.goto("/settings"); await expect(page.getByRole("heading", { name: "معلومات الأدمن والحساب" })).toBeVisible(); await expect(page.getByText("test@example.com", { exact: true })).toBeVisible();
});
