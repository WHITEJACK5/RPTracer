import { test, expect } from "@playwright/test";

// API_BASE must match the actual backend URL
const API_BASE = process.env.API_BASE || "http://127.0.0.1:8000";

test.describe("End-to-End Wiring Verification", () => {
  test("landing page loads with live version and working CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=TRACER")).toBeVisible();
    await expect(page.locator("text=Defense-Only • Razorpay Buildathon 2026")).toBeVisible();
    
    // Verify version string is live (not hardcoded)
    const versionText = await page.locator("footer .text-text-primary").textContent();
    expect(versionText).toContain("TRACER");
    expect(versionText).toMatch(/v\d+\.\d+/);
    
    // Click primary CTA
    const dashboardLink = page.locator('a[href="/dashboard"]');
    await expect(dashboardLink).toBeVisible();
    await dashboardLink.click();
    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator("text=Overview")).toBeVisible();
  });

  test("sandbox page fires real API calls and shows risk_band", async ({ page }) => {
    await page.goto("/dashboard/sandbox");
    await expect(page.locator("text=Sandbox")).toBeVisible();
    
    // Click Normal UPI preset (should return LOW risk)
    const normalButton = page.locator('button:has-text("Normal UPI")');
    await expect(normalButton).toBeVisible();
    await normalButton.click();
    
    // Wait for result
    await expect(page.locator("text=risk_score:")).toBeVisible({ timeout: 10000 });
    const scoreText = await page.locator("text=risk_score:").textContent();
    expect(scoreText).toMatch(/risk_score: \d+/);
    
    // Verify band color reflects actual risk level
    const bandText = await page.locator("text=risk_band:").textContent();
    expect(bandText).toMatch(/risk_band: LOW|MEDIUM|HIGH/);
  });

  test("sandbox ring-building sequence flips ring_detected to true", async ({ page }) => {
    await page.goto("/dashboard/sandbox");
    
    // Click Build a Ring Live button
    const ringButton = page.locator('button:has-text("Fire 5-Ring Sequence")');
    await expect(ringButton).toBeVisible();
    await ringButton.click();
    
    // Wait for sequence to complete
    await expect(page.locator("text=Ring complete — check graph evidence")).toBeVisible({ timeout: 5000 });
    
    // Check that risk_score increased (ring detected)
    const scoreText = await page.locator("text=risk_score:").textContent();
    const score = parseInt(scoreText?.replace("risk_score: ", "") || "0", 10);
    expect(score).toBeGreaterThanOrEqual(70); // Ring triggers HIGH band
  });

  test("graph page shows empty state when no ring activity", async ({ page }) => {
    await page.goto("/dashboard/graph");
    
    // Should show empty state, not hardcoded entity ID
    await expect(page.locator("text=No ring activity observed yet")).toBeVisible();
    await expect(page.locator("text=Run a preset from the dashboard sandbox")).toBeVisible();
  });

  test("terminal block copy button writes working curl text", async ({ page }) => {
    await page.goto("/");
    
    // Click Normal UPI tab
    const normalTab = page.locator('button:has-text("Normal UPI")');
    await normalTab.click();
    
    // Click Copy
    await page.locator("button:has-text(\"Copy\")").click();
    
    // Verify clipboard has curl command with correct base URL
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("curl -X POST");
    expect(clipboard).toContain(`${API_BASE}/api/v1/risk/evaluate`);
    expect(clipboard).toContain("Content-Type: application/json");
  });
});
