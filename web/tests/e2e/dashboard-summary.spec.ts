import { expect, test } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

const metrics = [
  ["Total Products", "6", "6"],
  ["Available Stock", "123", "123"],
  ["Low Stock Products", "2", "2"],
  ["Today's Sales Revenue (PKR)", "25690.00", "Rs. 25,690.00"],
  ["Today's Profit (PKR)", "4860.00", "Rs. 4,860.00"],
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
        if (testInfo.project.name === "chromium") {
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
