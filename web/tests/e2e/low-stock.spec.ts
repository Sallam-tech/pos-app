import { expect, test } from "@playwright/test";
import { getMockLowStockProducts, getMockStockStatus, mockInventory } from "../../src/lib/admin/mock-inventory";
import { expectReadableContrast } from "./support/contrast";

for (const theme of ["light", "dark"] as const) {
  test("Low-stock card navigation and filtered list in " + theme, async ({ page, baseURL }, testInfo) => {
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
    const card = overview.getByRole("group", { name: "Low Stock Products", exact: true });
    const link = card.getByRole("link", { name: "Low Stock Products", exact: true });
    await expect(overview.getByRole("link")).toHaveCount(2);
    await expect(link).toHaveAttribute("href", "/admin/inventory/low-stock");
    const products = getMockLowStockProducts();
    await expect(card.locator("data")).toHaveAttribute("value", String(products.length));

    // Reach the real, full-card link using only Tab; Enter follows its canonical URL.
    for (let step = 0; step < 16; step++) {
      await page.keyboard.press("Tab");
      if (await link.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS("outline-style", "solid");
    await expect(link).toHaveCSS("outline-width", "3px");
    const cardBounds = await card.boundingBox();
    const linkBounds = await link.boundingBox();
    expect(Math.abs(cardBounds!.width - linkBounds!.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(cardBounds!.height - linkBounds!.height)).toBeLessThanOrEqual(2);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/admin/inventory/low-stock");
    await expect(page.getByRole("heading", { level: 1, name: "Low Stock Products", exact: true })).toBeVisible();
    await expect(page).toHaveTitle("Low Stock Products | Shop POS");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByText("Demo Data", { exact: true })).toBeVisible();
    await expect(page.getByText("Mock UI", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Admin workspace", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Layout preview", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "All previews", exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Breadcrumbs" })).toHaveCount(0);
    await expect(page.getByText(/Advisory only/)).toHaveClass("sr-only");
    const region = page.getByRole("region", { name: "Low-stock list (" + products.length + ")", exact: true });
    await expect(region).toHaveAccessibleDescription(/Mock data only/);
    const table = region.getByRole("table", { name: "Mock low-stock inventory" });
    await expect(table.getByRole("row")).toHaveCount(products.length + 1);
    await expect(table.getByRole("columnheader")).toHaveText(["Product name", "Remaining quantity", "Low-stock threshold", "Status"]);
    for (const product of products) {
      const row = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: product.name, exact: true }) });
      await expect(row.getByRole("cell")).toHaveText([String(product.quantity), String(product.lowStockThreshold), getMockStockStatus(product)]);
    }
    for (const product of mockInventory.filter((product) => product.quantity > product.lowStockThreshold)) {
      await expect(table.getByRole("rowheader", { name: product.name, exact: true })).toHaveCount(0);
    }
    // The unchanged sidebar remains available without falsely announcing Dashboard as this page.
    const sidebar = page.getByRole("complementary", { name: "Admin sidebar" });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("Inventory")).toHaveAttribute("aria-current", "location");
    await expect(sidebar.getByText("Inventory")).toHaveClass(/bg-muted/);
    const toothpaste = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Toothpaste", exact: true }) });
    await expect(toothpaste.getByRole("cell")).toHaveText(["0", "5", "Out of stock"]);
    await expect(toothpaste.getByText("Out of stock", { exact: true })).toHaveClass(/text-danger/);
    await expect(sidebar.getByRole("link", { name: "Dashboard", exact: true })).not.toHaveAttribute("aria-current", "page");
    const back = page.getByRole("link", { name: "Back to Admin Dashboard", exact: true });
    await expect(back).toHaveAttribute("href", "/admin/dashboard");
    await expectReadableContrast(page);
    if (testInfo.project.name === "chromium" && theme === "dark") {
      await page.screenshot({ path: testInfo.outputPath("low-stock-" + theme + "-1440.png"), fullPage: true, scale: "css" });
    }

    // The list can scroll horizontally inside its focusable region on narrow screens.
    for (const width of [768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(back).toBeVisible();
      await expectReadableContrast(page);
    }
    await back.focus();
    await page.keyboard.press("Tab");
    const scrollRegion = page.getByRole("region", { name: "Low-stock products", exact: true });
    await expect(scrollRegion).toBeFocused();
    await expect(scrollRegion).toHaveCSS("outline-width", "3px");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => scrollRegion.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await back.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/admin/dashboard");
    // A click on the card's label area, outside its small View list hint, also works.
    await card.click({ position: { x: 20, y: 20 } });
    await expect(page).toHaveURL("/admin/inventory/low-stock");
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("Low-stock list supports direct navigation and persistent System theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/admin/inventory/low-stock");
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("table", { name: "Mock low-stock inventory" })).toBeVisible();
});
