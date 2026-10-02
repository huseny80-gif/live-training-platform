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
test("question editing saves text and correct answers in both screens and protects started sessions", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/login"); await page.getByLabel("البريد الإلكتروني").fill("test@example.com"); await page.getByLabel("كلمة المرور").fill("TestPass123!"); await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click(); await expect(page).toHaveURL(/dashboard/);
  await page.goto(`/questions?programId=${foreignId}`); await expect(page.getByText("محتوى خاص لا يظهر")).toHaveCount(0);
  await page.goto(`/questions?programId=${programId}`); await expect(page.getByRole("heading", { name: "مراجعة الأسئلة", exact: true })).toBeVisible();
  const original = await prisma.question.findFirstOrThrow({ where: { programId, day: { dayNumber: 1 } }, include: { options: true } });
  const optionB = original.options.find(o => o.optionLabel === "B")!;
  const firstQuestion = page.locator("article.platform-question").first();
  await firstQuestion.getByRole("button", { name: "تعديل السؤال والإجابات", exact: true }).click();
  const editor = firstQuestion.getByRole("form", { name: "تعديل السؤال والإجابات" });
  await editor.getByLabel("نص السؤال", { exact: true }).fill("ما السؤال المعدل عن نظم المعلومات الجغرافية؟");
  await editor.getByLabel("الخيار B", { exact: true }).fill("تحليل البيانات المكانية المعدل");
  await editor.getByLabel("الإجابة الصحيحة", { exact: true }).selectOption(optionB.id);
  await editor.getByLabel("تفسير الإجابة", { exact: true }).fill("هذا تفسير الإجابة بعد تعديل المدرب.");
  await editor.getByRole("button", { name: "حفظ التعديلات", exact: true }).click();
  await expect(firstQuestion.getByRole("heading", { name: /ما السؤال المعدل/ })).toBeVisible();
  await expect(firstQuestion.getByText("تحليل البيانات المكانية المعدل — الإجابة الصحيحة ✓", { exact: false })).toBeVisible();
  const edited = await prisma.question.findUniqueOrThrow({ where: { id: original.id }, include: { options: true } });
  expect(edited.correctOptionId).toBe(optionB.id); expect(edited.status).toBe("DRAFT");
  expect(edited.options.map(o => o.id).sort()).toEqual(original.options.map(o => o.id).sort());
  await page.goto(`/programs/${programId}/manage`);
  await page.getByRole("button", { name: /يوم 1.*اليوم 1/ }).click();
  await page.getByRole("button", { name: "تعديل السؤال والإجابات", exact: true }).click();
  const manageEditor = page.getByRole("form", { name: "تعديل السؤال والإجابات" });
  await expect(manageEditor.getByLabel("تفسير الإجابة")).toHaveValue("هذا تفسير الإجابة بعد تعديل المدرب.");
  await manageEditor.getByLabel("نص السؤال", { exact: true }).fill("ما السؤال المعدل من إدارة محتوى البرنامج؟");
  await manageEditor.getByRole("button", { name: "حفظ التعديلات", exact: true }).click();
  await expect(page.getByText("ما السؤال المعدل من إدارة محتوى البرنامج؟", { exact: true })).toBeVisible();
  await page.goto(`/questions?programId=${programId}`);
  await page.getByRole("button", { name: "اعتماد السؤال", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "اعتماد السؤال", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "اعتماد السؤال", exact: true }).click();
  await expect(page.getByRole("button", { name: "اعتماد السؤال", exact: true })).toHaveCount(0);
  await page.goto(`/final-exam?programId=${programId}`); await page.getByLabel("عدد أسئلة الاختبار النهائي").fill("2"); await page.getByRole("button", { name: "إنشاء اختبار نهائي", exact: true }).click(); await expect(page).toHaveURL(/\/sessions\//);
  const exam = await prisma.liveSession.findFirstOrThrow({ where: { programId, dayNumber: 0 }, include: { sessionQuestions: { include: { question: { include: { day: true } } } } } });
  expect(exam.sessionQuestions).toHaveLength(2); expect(new Set(exam.sessionQuestions.map(q => q.question.day.dayNumber)).size).toBe(2); expect(exam.scoringConfig).toEqual({ assessmentType: "FINAL" });
  await page.goto(`/google-forms?programId=${programId}&examId=${exam.id}`); await page.getByRole("button", { name: "تجهيز نموذج Google Forms" }).click();
  await expect(page.getByLabel("كود إنشاء النموذج")).toHaveValue(/FormApp.create/); const download = page.waitForEvent("download"); await page.getByRole("button", { name: "تحميل ملف النموذج" }).click(); expect((await download).suggestedFilename()).toBe("training-quiz.gs");
  await prisma.liveSession.update({ where: { id: exam.id }, data: { status: "ACTIVE" } });
  await page.goto(`/questions?programId=${programId}`);
  await page.locator("article.platform-question").first().getByRole("button", { name: "تعديل السؤال والإجابات", exact: true }).click();
  const lockedEditor = page.getByRole("form", { name: "تعديل السؤال والإجابات" });
  await lockedEditor.getByLabel("نص السؤال", { exact: true }).fill("هذا تعديل يجب رفضه بعد بدء الجلسة.");
  await lockedEditor.getByRole("button", { name: "حفظ التعديلات", exact: true }).click();
  await expect(page.getByText("استُخدم هذا السؤال في جلسة بدأت بالفعل؛ لا يمكن تغيير إجاباته حفاظاً على نتائج المتدربين.")).toBeVisible();
  expect((await prisma.question.findUniqueOrThrow({ where: { id: original.id } })).questionText).toBe("ما السؤال المعدل من إدارة محتوى البرنامج؟");
  await page.goto("/settings"); await expect(page.getByRole("heading", { name: "معلومات الأدمن والحساب" })).toBeVisible(); await expect(page.getByText("test@example.com", { exact: true })).toBeVisible();
});
