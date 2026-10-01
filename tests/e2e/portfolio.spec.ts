import { test, expect } from "@playwright/test";

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test.describe(`Arabic portfolio at ${viewport.width}px`, () => {
    test.use({ viewport });
    test("both QR link formats prefill the code and ask only for the name", async ({ page }) => {
      for (const url of ["/join/a3f2b1", "/join?code=a3f2b1"]) {
        await page.goto(url);
        await expect(page.getByRole("heading", { name: "الحقيبة التدريبية" })).toBeVisible();
        await expect(page.locator('input[name="code"]')).toHaveValue("A3F2B1");
        await expect(page.locator('input[name="code"]')).toHaveAttribute("type", "hidden");
        await expect(page.getByLabel("الاسم الثلاثي")).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
        expect(await page.locator(".dlp-join-card").evaluate((el) => getComputedStyle(el).borderRadius)).not.toBe("0px");
      }
    });
    test("manual entry remains available without a code", async ({ page }) => {
      await page.goto("/join");
      await expect(page.getByLabel("رمز الجلسة", { exact: true })).toBeEditable();
      await expect(page.getByLabel("الاسم الثلاثي")).toBeVisible();
    });
  });
}
