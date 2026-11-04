import { expect, test } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

for (const theme of ["light", "dark"] as const) {
  test("Reports home and existing Admin navigation in " + theme, async ({ page, baseURL }, testInfo) => {
    const errors: string[] = [];
    const unexpected: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const request = route.request();
      if (new URL(request.url()).origin === baseURL && ["GET", "HEAD"].includes(request.method())) return route.continue();
      unexpected.push(request.method() + " " + request.url());
      return route.abort();
    });
    await page.addInitScript((mode) => { if (!localStorage.getItem("pos-theme")) localStorage.setItem("pos-theme", mode); }, theme);
    await page.emulateMedia({ colorScheme: theme });
    const desktop = testInfo.project.name === "chromium";
    await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
    async function navigation() {
      if (page.viewportSize()!.width >= 1024) return page.getByRole("navigation", { name: "Main navigation", exact: true });
      await page.getByRole("button", { name: "Open navigation", exact: true }).click();
      return page.getByRole("navigation", { name: "Mobile navigation", exact: true });
    }
    async function closeMobileNavigation() {
      if (page.viewportSize()!.width < 1024) {
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "Admin navigation", exact: true })).not.toBeVisible();
      }
    }

    await page.goto("/admin/dashboard");
    let nav = await navigation();
    let reports = nav.getByRole("link", { name: "Reports", exact: true });
    await expect(reports).toHaveAttribute("href", "/admin/reports");
    await expect(nav.getByText("Planned", { exact: true })).toHaveCount(0);
    await reports.focus();
    await expect(reports).toHaveCSS("outline-width", "3px");
    await reports.press("Enter");
    await expect(page).toHaveURL("/admin/reports");
    await expect(page).toHaveTitle("Reports | Shop POS");
    await expect(page.getByRole("heading", { level: 1, name: "Reports", exact: true })).toBeVisible();
    await expect(page.getByText("Demo Data", { exact: true })).toBeVisible();
    await expect(page.getByText("Admin workspace", { exact: true })).toHaveCount(0);
    const options = page.getByRole("region", { name: "Available reports", exact: true });
    await expect(options.getByRole("group")).toHaveCount(2);
    await expect(options.getByText("See sales, items sold and simple charts.", { exact: true })).toBeVisible();
    await expect(options.getByText("See profit and which products earned the most.", { exact: true })).toBeVisible();
    await expect(options.getByRole("link")).toHaveCount(2);
    await expect(page.locator("main input,main select,main table,main canvas,main data")).toHaveCount(0);
    await expectReadableContrast(page);
    if (desktop && theme === "light") await page.screenshot({ path: testInfo.outputPath("reports-home-desktop.png"), fullPage: true });
    nav = await navigation();
    await expect(nav.getByRole("link", { name: "Reports", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("button", { name: "Sales", exact: true })).not.toHaveAttribute("aria-current");
    await expect(nav.getByRole("button", { name: "Reports", exact: true })).toHaveCount(0);
    await closeMobileNavigation();

    const salesLink = options.getByRole("link", { name: "View Sales Charts", exact: true });
    const profitLink = options.getByRole("link", { name: "View Profit Charts", exact: true });
    await salesLink.focus();
    await expect(salesLink).toHaveCSS("outline-width", "3px");
    await page.keyboard.press("Tab");
    await expect(profitLink).toBeFocused();
    await expect(profitLink).toHaveCSS("outline-width", "3px");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/admin/reports/sales");
    await page.getByRole("link", { name: "View Detailed Sales Report", exact: true }).click();
    await expect(page).toHaveURL("/admin/sales/today");
    const revenue = page.getByLabel("Revenue totals", { exact: true }).getByText("Total Sales Revenue", { exact: true }).locator("..").locator("data");
    await expect(revenue).toHaveText("Rs. 25,690.00");
    nav = await navigation();
    await expect(nav.getByRole("button", { name: "Sales", exact: true })).toHaveAttribute("aria-current", "location");
    await expect(nav.getByRole("link", { name: "Sales Report", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Reports", exact: true })).not.toHaveAttribute("aria-current");
    await nav.getByRole("link", { name: "Reports", exact: true }).click();
    await expect(page).toHaveURL("/admin/reports");
    await profitLink.focus();
    await profitLink.press("Enter");
    await expect(page).toHaveURL("/admin/reports/profit");
    await page.getByRole("link", { name: "View Detailed Profit Report", exact: true }).click();
    await expect(page).toHaveURL("/admin/profit/today");
    const profit = page.getByLabel("Gross profit totals", { exact: true }).getByText("Total Gross Profit", { exact: true }).locator("..").locator("dd > span").first();
    await expect(profit).toHaveText("Rs. 5,140.00");
    await expect(page.getByText("Profit calculated using example purchase costs for demo sales.", { exact: true })).toBeVisible();
    nav = await navigation();
    reports = nav.getByRole("link", { name: "Reports", exact: true });
    await expect(reports).toHaveAttribute("aria-current", "location");
    await expect(reports).toHaveClass(/bg-muted/);
    await expect(nav.getByRole("button", { name: "Sales", exact: true })).not.toHaveAttribute("aria-current");
    await expect(nav.getByRole("link", { name: "Products", exact: true })).not.toHaveAttribute("aria-current");
    await nav.getByRole("button", { name: "Inventory", exact: true }).click();
    await expect(nav.getByRole("button", { name: "Inventory", exact: true })).toHaveAttribute("aria-expanded", "true");
    await nav.getByRole("link", { name: "Available Stock", exact: true }).click();
    await expect(page).toHaveURL("/admin/inventory/available-stock");
    nav = await navigation();
    await expect(nav.getByRole("button", { name: "Inventory", exact: true })).toHaveAttribute("aria-current", "location");
    await expect(nav.getByRole("link", { name: "Reports", exact: true })).not.toHaveAttribute("aria-current");
    await nav.getByRole("link", { name: "Products", exact: true }).click();
    await expect(page).toHaveURL("/admin/products");
    nav = await navigation();
    await expect(nav.getByRole("link", { name: "Products", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Reports", exact: true })).not.toHaveAttribute("aria-current");
    await nav.getByRole("link", { name: "Reports", exact: true }).click();
    await expect(page).toHaveURL("/admin/reports");

    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(salesLink).toBeVisible();
      await expect(profitLink).toBeVisible();
    }
    await page.getByLabel("Theme", { exact: true }).selectOption("system");
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "light" ? "dark" : "light");
    await page.reload();
    await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
    await expectReadableContrast(page);
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}
