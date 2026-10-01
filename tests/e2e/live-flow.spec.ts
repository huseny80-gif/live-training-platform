import "dotenv/config";
import { test, expect } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

// Acceptance fixtures are created only in a local development database and
// removed afterward. They are never imported by application code.
let prisma: PrismaClient;
let programId: string;
const title = `اختبار قبول الحقيبة التدريبية ${Date.now()}`;
const dayTitle = "اليوم الأول: أهداف التدريب";
const participantName = "أحمد محمد علي";

test.beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Acceptance fixtures require a local database");
  }
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const instructor = await prisma.instructor.findUniqueOrThrow({ where: { email: "test@example.com" } });
  const program = await prisma.trainingProgram.create({ data: { title, language: "AR", status: "ACTIVE", instructorId: instructor.id } });
  programId = program.id;
  const day = await prisma.trainingDay.create({ data: { programId, dayNumber: 1, title: dayTitle, status: "APPROVED", objectives: ["تحديد أهداف التعلم"] } });
  const questions = [
    { text: "ما الخطوة الأولى قبل بدء التدريب؟", a: "تحديد أهداف التعلم", b: "تجاهل أهداف التعلم" },
    { text: "كيف نتحقق من فهم المتدربين؟", a: "استخدام التقييم التفاعلي", b: "إلغاء التقييم" },
    { text: "This English question must not appear in an Arabic session", a: "First option", b: "Second option" },
  ];
  for (const [index, q] of questions.entries()) {
    const question = await prisma.question.create({ data: {
      programId, dayId: day.id, questionText: q.text, questionOrder: index + 1,
      generatedBy: "MANUAL", language: index < 2 ? "AR" : "EN", status: "APPROVED",
      options: { create: [{ optionLabel: "A", optionText: q.a, displayOrder: 1 }, { optionLabel: "B", optionText: q.b, displayOrder: 2 }] },
    }, include: { options: true } });
    await prisma.question.update({ where: { id: question.id }, data: { correctOptionId: question.options.find(o => o.optionLabel === "A")!.id } });
  }
});
test.afterAll(async () => {
  if (prisma) {
    if (programId) {
      await prisma.liveSession.deleteMany({ where: { programId } });
      await prisma.trainingProgram.delete({ where: { id: programId } });
    }
    await prisma.$disconnect();
  }
});

test("instructor and mobile participant complete an Arabic live session", async ({ page, browser }) => {
  test.setTimeout(180000);
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill("test@example.com");
  await page.getByLabel("كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "الحقيبة التدريبية", exact: true })).toBeVisible();
  await page.getByRole("link").filter({ hasText: title }).first().click();
  await page.getByRole("link").filter({ hasText: dayTitle }).click();
  await page.getByRole("button", { name: "إنشاء جلسة اختبار" }).click();
  await expect(page).toHaveURL(/\/sessions\//);
  await expect(page.getByRole("heading", { name: "قائمة الأسئلة (2)" })).toBeVisible();
  await expect(page.getByText("This English question", { exact: false })).toHaveCount(0);

  const qr = new URL((await page.getByAltText("QR للانضمام").getAttribute("src"))!);
  const joinUrl = qr.searchParams.get("data")!;
  const code = new URL(joinUrl).pathname.split("/").pop()!;
  expect(new URL(joinUrl).origin).toBe(process.env.E2E_SERVER_MODE === "production" ? "https://live-training-platform.vercel.app" : "http://localhost:3000");
  await page.getByRole("button", { name: "بدء الاختبار", exact: false }).click();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const participant = await mobile.newPage();
    // Verify the production QR destination above, then exercise its path on
    // the local build without touching the deployed database.
    await participant.goto(`http://localhost:3000${new URL(joinUrl).pathname}`);
    await expect(participant.locator('input[name="code"]')).toHaveValue(code);
    await expect(participant.locator('input[name="code"]')).toHaveAttribute("type", "hidden");
    await participant.getByLabel("الاسم الثلاثي").fill(participantName);
    await participant.getByRole("button", { name: "انضمام للاختبار" }).click();
    await expect(participant).toHaveURL(new RegExp(`/session/${code}$`));
    expect((await mobile.cookies()).some(c => c.name === "guest_token" && c.httpOnly)).toBeTruthy();
    await expect(participant.getByText("في انتظار المدرب لعرض السؤال التالي…")).toBeVisible();

    await page.getByRole("button", { name: "اعرض", exact: true }).first().click();
    await expect(participant.getByText("ما الخطوة الأولى قبل بدء التدريب؟", { exact: true })).toBeVisible();
    await participant.getByRole("button", { name: "A تحديد أهداف التعلم" }).click();
    await expect(participant.getByText("تم حفظ إجابتك", { exact: true })).toBeVisible();
    await expect(participant.getByText("إجابة صحيحة!", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "إيقاف مؤقت", exact: false }).click();
    await expect(participant.getByText("الاختبار موقوف مؤقتاً… انتظر.")).toBeVisible();
    await page.getByRole("button", { name: "استئناف", exact: false }).click();
    await expect(participant.getByText("ما الخطوة الأولى قبل بدء التدريب؟", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "السؤال التالي", exact: false }).click();
    await expect(participant.getByText("كيف نتحقق من فهم المتدربين؟", { exact: true })).toBeVisible();
    await participant.getByRole("button", { name: "B إلغاء التقييم" }).click();
    await expect(participant.getByText("إجابة خاطئة", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "إغلاق السؤال", exact: false }).click();
    await expect(participant.getByText("في انتظار السؤال التالي…", { exact: false }).first()).toBeVisible();
    await page.getByRole("button", { name: "إنهاء الاختبار", exact: true }).click();
    await expect(participant).toHaveURL(new RegExp(`/session/${code}/result$`), { timeout: 20000 });
    await expect(participant.getByRole("heading", { name: participantName })).toBeVisible();
    await expect(participant.getByText("50%")).toBeVisible();
    await expect(participant.getByText("عدد الأسئلة الكلي: 2")).toBeVisible();
    expect(await participant.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await expect(page.getByText("التقرير النهائي للجلسة", { exact: false })).toBeVisible();
    await expect(page.getByText(participantName, { exact: true }).first()).toBeVisible();
  } finally {
    await mobile.close();
  }
});
