import { test, expect } from "@playwright/test";

const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "TestPass123!";

test.describe("E2E Authentication Flow", () => {
  test("E2E-01: Valid login redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);

    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("h1")).toContainText("الحقيبة التدريبية");
  });

  test("E2E-02: Wrong password shows error, stays on login", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', "WrongPassword999!");
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("alert").filter({ hasText: "البريد الإلكتروني أو كلمة المرور غير صحيحة" })).toBeVisible();
  });

  test("E2E-03: Unauthenticated access to /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 5000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("E2E-04: After login, logout redirects to /login and blocks dashboard", async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });

    // Logout
    await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);

    // Attempt to navigate back to dashboard
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 5000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("E2E-05: Rate limiting blocks after 5 failed attempts", async ({ page }) => {
    await page.goto("/login");
    for (let i = 0; i < 5; i++) {
      await page.fill('input[name="email"]', "ratelimit@test.com");
      await page.fill('input[name="password"]', `Wrong${i}`);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
    }
    // 6th attempt
    await page.fill('input[name="email"]', "ratelimit@test.com");
    await page.fill('input[name="password"]', "Wrong6");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("alert").filter({ hasText: "محاولات دخول كثيرة" })).toBeVisible();
  });
});
