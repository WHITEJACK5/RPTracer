import { test, expect } from "@playwright/test";

/**
 * Smoke suite for the TRACER landing page.
 * Verifies the hero copy and primary CTA render, and that the theme toggle
 * flips the `<html>` class and persists across a reload (next-themes).
 */
test.describe("TRACER landing page", () => {
  test("renders hero copy and the primary CTA", async ({ page }) => {
    await page.goto("/");

    // Brand mark.
    await expect(page.getByText("TRACER", { exact: true })).toBeVisible();

    // Hero headline — TextReveal splits it into spans, so assert on the
    // (re-combined) heading text rather than a single element.
    const heading = page.locator("h1");
    await expect(heading).toContainText("topology");

    // Primary call-to-action.
    const cta = page.getByRole("link", { name: /Open Dashboard/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/dashboard");
  });

  test("theme toggle switches and persists across reload", async ({ page }) => {
    await page.goto("/");

    const toggle = page.getByRole("button", { name: /toggle color theme/i });
    await expect(toggle).toBeVisible();

    const isDark = () =>
      page.evaluate(() =>
        document.documentElement.classList.contains("dark")
      );

    const before = await isDark();

    await toggle.click();

    await expect
      .poll(isDark, { timeout: 10_000 })
      .not.toBe(before);

    const afterToggle = await isDark();
    expect(afterToggle).not.toBe(before);

    // Reload and confirm the choice survived (next-themes persists to storage).
    await page.reload();
    await expect
      .poll(isDark, { timeout: 10_000 })
      .toBe(afterToggle);
  });
});
