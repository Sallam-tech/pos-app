import { expect, test } from "@playwright/test";
import { mockInventory } from "../../src/lib/admin/mock-inventory";
import { expectReadableContrast } from "./support/contrast";

for (const theme of ["light", "dark"] as const) {
  test("Available-stock drilldown navigation, filters and totals in " + theme, async ({ page, baseURL }, testInfo) => {
    const errors: string[] = [];
    const unexpected: string[] = [];
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
    const overview = page.getByRole("region", { name: "Shop overview" });
    await expect(overview.getByRole("link")).toHaveCount(5);
    const card = overview.getByRole("group", { name: "Available Stock", exact: true });
    const link = card.getByRole("link", { name: "Available Stock", exact: true });
    await expect(card.locator("data")).toHaveAttribute("value", "123");
    await expect(link).toHaveAttribute("href", "/admin/inventory/available-stock");
    for (let step = 0; step < 18; step++) {
      await page.keyboard.press("Tab");
      if (await link.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS("outline-width", "3px");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/admin/inventory/available-stock");
    await expect(page).toHaveTitle("Available Stock | Shop POS");
    await expect(page.getByRole("heading", { level: 1, name: "Available Stock", exact: true })).toBeVisible();
    await expect(page.getByText("Demo Data", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "All previews", exact: true })).toHaveCount(0);
    await expect(page.getByText("Admin workspace", { exact: true })).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const sidebar = page.getByRole("complementary", { name: "Admin sidebar" });
    await expect(sidebar.getByRole("button", { name: "Inventory", exact: true })).toHaveAttribute("aria-current", "location");
    await expect(sidebar.getByRole("button", { name: "Inventory", exact: true })).toHaveClass(/bg-muted/);
    await expect(sidebar.getByRole("link", { name: "Dashboard", exact: true })).not.toHaveAttribute("aria-current");
    await expect(sidebar.getByRole("button", { name: "Inventory", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar.getByRole("link", { name: "Available Stock", exact: true })).toHaveAttribute("aria-current", "page");
    const totals = page.getByLabel("Overall inventory totals", { exact: true });
    const units = totals.locator("div").filter({ has: page.getByText("Total Stock Units", { exact: true }) }).locator("dd");
    const productCount = totals.locator("div").filter({ has: page.getByText("Total Products", { exact: true }) }).locator("dd");
    async function expectSeparatedMetrics() {
      const blocks = totals.locator(":scope > div");
      await expect(blocks).toHaveCount(2);
      const first = (await blocks.nth(0).boundingBox())!;
      const second = (await blocks.nth(1).boundingBox())!;
      if (page.viewportSize()!.width >= 640) {
        expect(second.x - first.x - first.width).toBeGreaterThanOrEqual(15);
        expect(second.y).toBe(first.y);
      } else {
        expect(second.y - first.y - first.height).toBeGreaterThanOrEqual(15);
      }
      for (const block of [blocks.nth(0), blocks.nth(1)]) {
        const label = (await block.locator("dt").boundingBox())!;
        const value = (await block.locator("dd").boundingBox())!;
        expect(value.x).toBe(label.x);
        expect(value.y).toBeGreaterThanOrEqual(label.y + label.height);
      }
    }
    await expectSeparatedMetrics();
    const table = page.getByRole("table", { name: "Mock available-stock inventory", exact: true });
    const list = page.getByRole("region", { name: "Inventory breakdown", exact: true });
    const resultCount = list.getByRole("status");
    await expect(units).toHaveText("123");
    await expect(productCount).toHaveText("7");
    await expect(table.getByRole("rowheader")).toHaveText(mockInventory.map((product) => product.name));
    const search = page.getByRole("searchbox", { name: "Search by product name" });
    const status = page.getByRole("combobox", { name: "Stock status", exact: true });
    const back = page.getByRole("link", { name: "Back to Admin Dashboard", exact: true });

    await back.focus();
    await page.keyboard.press("Tab");
    await expect(search).toBeFocused();
    await expect(search).toHaveCSS("outline-width", "3px");
    await page.keyboard.type("  MILK  ");
    await expect(table.getByRole("rowheader")).toHaveText(["Milk Powder"]);
    await page.keyboard.press("Tab");
    await expect(status).toBeFocused();
    await expect(status).toHaveCSS("outline-width", "3px");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await expect(status).toHaveValue("Available");
    await expect(table).toHaveCount(0);
    await expect(list.getByText("No mock products match your search and stock status.", { exact: true })).toBeVisible();
    await expect(resultCount).toHaveText("Showing 0 of 7 mock products.");
    await page.keyboard.press("ArrowDown");
    await expect(status).toHaveValue("Low stock");
    await expect(table.getByRole("rowheader")).toHaveText(["Milk Powder"]);
    await expect(units).toHaveText("123");

    await search.fill("");
    for (const [value, names] of [
      ["Available", ["Baby Wipes", "Hand Soap", "Rice", "Shampoo"]],
      ["Low stock", ["Diapers", "Milk Powder"]],
      ["Out of stock", ["Toothpaste"]],
    ] as const) {
      await status.selectOption(value);
      await expect(table.getByRole("rowheader")).toHaveText([...names]);
      await expect(resultCount).toHaveText("Showing " + names.length + " of 7 mock products.");
      await expect(units).toHaveText("123");
      await expect(productCount).toHaveText("7");
    }
    await expect(table.getByRole("cell")).toHaveText(["0", "5", "Out of stock"]);
    await expect(table.getByText("Out of stock", { exact: true })).toHaveClass(/text-danger/);
    await search.fill("  TOOTH  ");
    await search.press("Enter");
    await expect(table.getByRole("rowheader")).toHaveText(["Toothpaste"]);
    await search.fill("not-a-product");
    await expect(table).toHaveCount(0);
    await expect(units).toHaveText("123");
    await search.fill("");
    await status.selectOption("all");
    await expect(table.getByRole("rowheader")).toHaveCount(7);
    await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
    await expect(page.getByText(/Advisory only/)).toHaveClass("sr-only");
    expect((await page.locator("header").boundingBox())!.height).toBeLessThan(100);
    await expectReadableContrast(page);
    if (theme === "dark" && testInfo.project.name === "chromium") {
      await page.screenshot({ path: testInfo.outputPath("available-stock-desktop.png"), fullPage: true, scale: "css" });
    }

    for (const width of [1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(search).toBeVisible();
      await expect(status).toBeVisible();
      await expect(back).toBeVisible();
      await expectSeparatedMetrics();
    }
    await status.focus();
    await page.keyboard.press("Tab");
    const scrollRegion = page.getByRole("region", { name: "Inventory results", exact: true });
    await expect(scrollRegion).toBeFocused();
    await expect(scrollRegion).toHaveCSS("outline-width", "3px");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => scrollRegion.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await back.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/admin/dashboard");
    await card.click({ position: { x: 20, y: 20 } });
    await expect(page).toHaveURL("/admin/inventory/available-stock");
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("Available-stock direct route preserves System theme and follows OS changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/admin/inventory/available-stock");
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("table", { name: "Mock available-stock inventory" }).getByRole("rowheader")).toHaveCount(7);
});

test("Inventory submenu supports mouse, keyboard and mobile drawer navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/dashboard");
  const navigation = page.getByRole("navigation", { name: "Main navigation", exact: true });
  const inventory = navigation.getByRole("button", { name: "Inventory", exact: true });
  const available = navigation.getByRole("link", { name: "Available Stock", exact: true });
  const lowStock = navigation.getByRole("link", { name: "Low Stock Products", exact: true });
  await expect(navigation.getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(inventory).toHaveAttribute("aria-expanded", "false");
  await navigation.getByRole("link", { name: "Products", exact: true }).click();
  await expect(page).toHaveURL("/admin/products");
  await expect(navigation.getByRole("link", { name: "Products", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(inventory).toHaveAttribute("aria-expanded", "false");

  await inventory.click();
  await expect(inventory).toHaveAttribute("aria-expanded", "true");
  await expect(available).toBeVisible();
  await expect(lowStock).toBeVisible();
  await expect(navigation.getByRole("link")).toHaveCount(5);
  await expect(inventory.getByText("Planned", { exact: true })).toHaveCount(0);
  await inventory.focus();
  await expect(inventory).toHaveCSS("outline-width", "3px");
  await page.keyboard.press("Space");
  await expect(inventory).toHaveAttribute("aria-expanded", "false");
  await expect(available).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(inventory).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(available).toBeFocused();
  await expect(available).toHaveCSS("outline-width", "3px");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/admin/inventory/available-stock");
  await expect(inventory).toHaveAttribute("aria-expanded", "true");
  await expect(inventory).toHaveClass(/bg-muted/);
  await expect(available).toHaveAttribute("aria-current", "page");
  await expect(available).toHaveClass(/bg-muted/);
  await inventory.click();
  await expect(inventory).toHaveAttribute("aria-expanded", "false");
  await inventory.press("Enter");
  await page.keyboard.press("Tab");
  await expect(available).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(lowStock).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/admin/inventory/low-stock");
  await expect(inventory).toHaveAttribute("aria-expanded", "true");
  await expect(lowStock).toHaveAttribute("aria-current", "page");
  await expect(lowStock).toHaveClass(/bg-muted/);
  await expect(available).not.toHaveAttribute("aria-current");
  await expect(page.getByRole("table", { name: "Mock low-stock inventory" }).getByRole("rowheader")).toHaveText(["Diapers", "Milk Powder", "Toothpaste"]);
  await navigation.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL("/admin/dashboard");
  await expect(inventory).toHaveAttribute("aria-expanded", "false");

  await page.setViewportSize({ width: 375, height: 900 });
  const opener = page.getByRole("button", { name: "Open navigation", exact: true });
  const drawer = page.getByRole("dialog", { name: "Admin navigation", exact: true });
  await opener.click();
  const mobile = drawer.getByRole("navigation", { name: "Mobile navigation", exact: true });
  const mobileInventory = mobile.getByRole("button", { name: "Inventory", exact: true });
  await expect(mobileInventory).toHaveAttribute("aria-expanded", "false");
  await mobileInventory.focus();
  await mobileInventory.press("Space");
  await expect(mobileInventory).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(mobile.getByRole("link", { name: "Available Stock", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/admin/inventory/available-stock");
  await expect(drawer).toBeHidden();
  await opener.click();
  await expect(mobileInventory).toHaveAttribute("aria-expanded", "true");
  await expect(mobile.getByRole("link", { name: "Available Stock", exact: true })).toHaveAttribute("aria-current", "page");
  await mobile.getByRole("link", { name: "Low Stock Products", exact: true }).click();
  await expect(page).toHaveURL("/admin/inventory/low-stock");
  await expect(drawer).toBeHidden();
  await opener.click();
  await expect(mobileInventory).toHaveAttribute("aria-expanded", "true");
  await expect(mobile.getByRole("link", { name: "Low Stock Products", exact: true })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
});
