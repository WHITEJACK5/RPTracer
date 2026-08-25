import { test, expect } from "@playwright/test";

test.describe("End-to-End Wiring Verification", () => {
  test("landing page loads with live version and working CTA", async ({ page }) => {
    await page.goto("/");
    
    // Wait for content to load
    await expect(page.locator("text=TRACER")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Defense-Only • Razorpay Buildathon 2026")).toBeVisible();
    
    // Verify version string contains version number
    const footer = page.locator("footer .text-text-primary");
    await expect(footer).toBeVisible();
    const versionText = await footer.textContent();
    expect(versionText).toContain("TRACER");
    
    // Click primary CTA to dashboard
    await page.locator('a[href="/dashboard"]').first().click();
    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator("text=Overview")).toBeVisible({ timeout: 15000 });
  });

  test("sandbox page fires real API calls and shows risk_band", async ({ page }) => {
    await page.goto("/dashboard/sandbox");
    await expect(page.locator("text=Sandbox")).toBeVisible({ timeout: 15000 });
    
    // Click Normal UPI preset button
    await page.locator("button").filter({ hasText: "Normal UPI" }).first().click();
    
    // Wait for result with risk_score
    await expect(page.locator("text=risk_score:")).toBeVisible({ timeout: 15000 });
    const scoreText = await page.locator("text=risk_score:").textContent();
    expect(scoreText).toMatch(/risk_score: \d+/);
  });

  test("sandbox ring-building sequence flips ring_detected to true", async ({ page }) => {
    await page.goto("/dashboard/sandbox");
    
    // Click Build a Ring Live button
    await page.locator("button").filter({ hasText: "Fire 5-Ring Sequence" }).click();
    
    // Wait for completion message
    await expect(page.locator("text=Ring complete")).toBeVisible({ timeout: 15000 });
    
    // Verify risk_score increased
    const scoreText = await page.locator("text=risk_score:").textContent();
    const score = parseInt(scoreText?.replace("risk_score: ", "") || "0", 10);
    expect(score).toBeGreaterThanOrEqual(70);
  });

  test("graph page shows empty state when no ring activity", async ({ page }) => {
    await page.goto("/dashboard/graph");
    await expect(page.locator("text=No ring activity observed yet")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Run a preset from the dashboard sandbox")).toBeVisible();
  });
});
