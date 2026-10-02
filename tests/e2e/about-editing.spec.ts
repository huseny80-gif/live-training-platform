import "dotenv/config";
import { test, expect } from "@playwright/test";
import { prisma } from "../../src/lib/prisma";
import bcryptjs from "bcryptjs";
let adminId: string;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  if (!["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local database required");
  const admin = await prisma.instructor.create({ data: { email: "about-admin@example.test", passwordHash: await bcryptjs.hash("AboutTestOnly123!", 10), name: "Local About Admin", role: "ADMIN" } });
  adminId = admin.id;
});
test.afterAll(async () => {
  if (adminId) { await prisma.auditLog.deleteMany({ where: { actorId: adminId } }); await prisma.instructor.delete({ where: { id: adminId } }); }
  await prisma.$disconnect();
});
for (const width of [390, 1280]) test(`public About and trainee navigation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  for (const route of ["/join", "/join/ABC123", "/session/ABC123", "/session/ABC123/result"]) {
    await page.goto(route);
    await expect(page.locator(".platform-bar")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "لوحة المدرب", exact: true })).toHaveCount(0);
  }
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "حسين ياسين حسن / ر. مهندسين أقدم" })).toBeVisible();
  await expect(page.getByRole("img", { name: "الصورة الشخصية — حسين ياسين حسن" })).toBeVisible();
  await expect.poll(() => page.getByRole("img", { name: "الصورة الشخصية — حسين ياسين حسن" }).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator('a[href="mailto:huseny80@gmail.com"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "تعديل معلومات من نحن" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/about-${width}.png`, fullPage: true });
  await page.goto("/about/edit"); await expect(page).toHaveURL(/\/login/);
});
test("owner edits persist publicly and instructor navigation stays hidden in trainee routes", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByLabel("البريد الإلكتروني").fill("about-admin@example.test");
  await page.getByLabel("كلمة المرور").fill("AboutTestOnly123!");
  await page.getByRole("button", { name: "تسجيل الدخول", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/about"); await page.getByRole("link", { name: "تعديل معلومات من نحن" }).click();
  await page.getByLabel("نبذة عن المنصة", { exact: true }).fill("نص جديد لاختبار تعديل نبذة الحقيبة التدريبية وحفظها.");
  await page.getByLabel("رابط تيليجرام").fill("https://t.me/training_test");
  await page.getByRole("button", { name: "حفظ معلومات من نحن" }).click();
  await expect(page.getByRole("status")).toContainText("تم حفظ");
  await page.reload(); await expect(page.getByLabel("نبذة عن المنصة", { exact: true })).toHaveValue(/نص جديد/);
  const guest = await browser.newContext(); const publicPage = await guest.newPage();
  await publicPage.goto("http://localhost:3000/about");
  await expect(publicPage.getByText("نص جديد لاختبار تعديل نبذة الحقيبة التدريبية وحفظها.")).toBeVisible();
  await expect(publicPage.getByRole("link", { name: "تيليجرام", exact: true })).toHaveAttribute("href", "https://t.me/training_test");
  await guest.close();
  await page.goto("/join/ABC123"); await expect(page.locator(".platform-bar")).toHaveCount(0);
  await page.goto("/settings"); await expect(page.getByRole("link", { name: "تعديل معلومات من نحن" })).toBeVisible();
});
