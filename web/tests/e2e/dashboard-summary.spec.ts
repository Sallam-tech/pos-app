import { expect, test } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

const metrics = [
  ["Total Products", "7", "7"],
  ["Available Stock", "123", "123"],
  ["Low Stock Products", "3", "3"],
  ["Today's Sales Revenue (PKR)", "25690.00", "Rs. 25,690.00"],
];

for (const theme of ["light", "dark"] as const) {
  test("Dashboard summary cards in " + theme, async ({ page, baseURL }, testInfo) => {
    const unexpected: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const request = route.request();
      if (new URL(request.url()).origin === baseURL && ["GET", "HEAD"].includes(request.method())) return route.continue();
      unexpected.push(request.method() + " " + request.url());
      return route.abort();
    });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((mode) => localStorage.setItem("pos-theme", mode), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/dashboard");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByText("Demo Data", { exact: true })).toBeVisible();
    await expect(page.getByText("Mock UI", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Admin workspace", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Layout preview", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "All previews", exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Breadcrumbs" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "View shared components" })).toHaveCount(0);
    await expect(page.getByText(/Advisory only/)).toHaveClass("sr-only");
    const overview = page.getByRole("region", { name: "Shop overview" });
    await expect(overview).toHaveAccessibleDescription("Mock data only. These figures are examples, not live shop records.");
    await expect(overview.getByRole("group")).toHaveCount(5);
    await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");

    for (const width of [1440, 1280, 1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, value, display] of metrics) {
        const card = overview.getByRole("group", { name, exact: true });
        await expect(card).toBeVisible();
        await expect(card).toHaveAccessibleDescription(/Mock data only/);
        await expect(card.getByText("Mock data", { exact: true })).toBeVisible();
        await expect(card.locator("data")).toHaveAttribute("value", value);
        await expect(card.locator("data")).toHaveText(display);
        expect(await card.locator("data").evaluate((element) => {
          const data = element.getBoundingClientRect();
          const card = element.closest('[role="group"]')!.getBoundingClientRect();
          return data.left >= card.left && data.right <= card.right && data.bottom <= card.bottom;
        })).toBe(true);
      }
      const profit = overview.getByRole("group", { name: "Today's Profit", exact: true });
      await expect(profit.getByText("Unavailable", { exact: true })).toBeVisible();
      await expect(profit.locator("data")).toHaveCount(0);
      await expect(profit.getByRole("link")).toHaveAttribute("href", "/admin/profit/today");
      await expect(page.getByText("Rs. 4,860.00", { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.getByRole("complementary", { name: "Admin sidebar" })).toBeVisible({ visible: width >= 1024 });
      await expectReadableContrast(page);
      await expect(page.locator("table:visible")).toHaveCount(0);
      await expect(overview.locator("button,input,select,svg,canvas,table")).toHaveCount(0);
      if (width === 1440) {
        const cardTops = await overview.getByRole("group").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
        const valueTops = await overview.locator("data").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
        expect(Math.max(...cardTops) - Math.min(...cardTops)).toBeLessThan(1);
        expect(Math.max(...valueTops) - Math.min(...valueTops)).toBeLessThan(1);
        if (testInfo.project.name === "chromium" && theme === "dark") {
          await page.screenshot({ path: testInfo.outputPath("dashboard-" + theme + "-1440.png"), fullPage: true, scale: "css" });
        }
      }
    }
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("Dashboard summary System theme follows OS and persists", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/admin/dashboard");
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("region", { name: "Shop overview" }).getByRole("group")).toHaveCount(5);
});
