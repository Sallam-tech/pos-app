import { expect, test } from "@playwright/test";
import { getMockStockStatus, mockInventory } from "../../src/lib/admin/mock-inventory";
import { expectReadableContrast } from "./support/contrast";

const inventoryPath = "/admin/inventory/available-stock";

test.beforeAll(async ({ request }) => {
  test.setTimeout(90_000);
  for (const route of ["/admin/dashboard", inventoryPath, "/admin/inventory/low-stock"]) {
    expect((await request.get(route)).ok()).toBe(true);
  }
});

for (const theme of ["light", "dark"] as const) {
  test("Inventory layout, search, status filters and preserved Dashboard links in " + theme, async ({ page }, info) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((mode) => { if (!localStorage.getItem("pos-theme")) localStorage.setItem("pos-theme", mode); }, theme);
    await page.goto("/admin/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
    const overview = page.getByRole("region", { name: "Shop overview" });
    const stockCard = overview.getByRole("group", { name: "Available Stock", exact: true });
    const dashboardLink = stockCard.getByRole("link", { name: "Available Stock", exact: true });
    await expect(stockCard.locator("data")).toHaveAttribute("value", "123");
    await expect(dashboardLink).toHaveAttribute("href", inventoryPath);
    await dashboardLink.focus();
    await expect(dashboardLink).toHaveCSS("outline-width", "3px");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(inventoryPath);
    await expect(page).toHaveTitle("Inventory | Shop POS");
    await expect(page.getByRole("heading", { level: 1, name: "Inventory", exact: true })).toBeVisible();
    await expect(page.getByText("Demo Data", { exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
    const inventoryLink = nav.getByRole("link", { name: "Inventory", exact: true });
    await expect(inventoryLink).toHaveAttribute("aria-current", "page");
    await expect(inventoryLink).not.toHaveAttribute("aria-expanded");
    await expect(nav.getByRole("button", { name: "Inventory" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Available Stock", exact: true })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Low Stock Products", exact: true })).toHaveCount(0);
    const totals = page.getByLabel("Overall inventory totals", { exact: true });
    await expect(totals.locator(":scope > div")).toHaveCount(2);
    await expect(totals.locator("dd")).toHaveText(["123", "7"]);
    const table = page.getByRole("table", { name: "Mock available-stock inventory", exact: true });
    await expect(table.getByRole("columnheader")).toHaveText(["Product Name", "Available Quantity", "Stock Status"]);
    await expect(table.getByRole("rowheader")).toHaveText(mockInventory.map((product) => product.name));
    for (const product of mockInventory) {
      const row = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: product.name, exact: true }) });
      await expect(row.getByRole("cell")).toHaveText([String(product.quantity), getMockStockStatus(product)]);
    }
    const search = page.getByRole("searchbox", { name: "Search by product name", exact: true });
    const filters = page.getByRole("group", { name: "Stock Status", exact: true });
    await expect(filters.getByRole("button")).toHaveText(["All Products", "Available", "Low Stock", "Out of Stock"]);
    const back = page.getByRole("link", { name: "Back to Dashboard", exact: true });
    await back.focus();
    await page.keyboard.press("Tab");
    await expect(search).toBeFocused();
    await expect(search).toHaveCSS("outline-width", "3px");
    await search.fill("  MILK  ");
    await expect(table.getByRole("rowheader")).toHaveText(["Milk Powder"]);
    await page.keyboard.press("Tab");
    await expect(filters.getByRole("button", { name: "All Products", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    const available = filters.getByRole("button", { name: "Available", exact: true });
    await expect(available).toBeFocused();
    await expect(available).toHaveCSS("outline-width", "3px");
    await page.keyboard.press("Space");
    await expect(table).toHaveCount(0);
    await expect(page.getByText("No mock products match your search and stock status.", { exact: true })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(filters.getByRole("button", { name: "Low Stock", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(table.getByRole("rowheader")).toHaveText(["Milk Powder"]);
    await search.fill("");
    for (const [label, names] of [
      ["Available", ["Baby Wipes", "Hand Soap", "Rice", "Shampoo"]],
      ["Low Stock", ["Diapers", "Milk Powder"]],
      ["Out of Stock", ["Toothpaste"]],
      ["All Products", mockInventory.map((product) => product.name)],
    ] as const) {
      const button = filters.getByRole("button", { name: label, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(filters.locator('[aria-pressed="true"]')).toHaveCount(1);
      await expect(table.getByRole("rowheader")).toHaveText([...names]);
      await expect(totals.locator("dd")).toHaveText(["123", "7"]);
      await expect(page.getByRole("main").getByRole("status")).toHaveText("Showing " + names.length + " of 7 mock products.");
    }
    await expectReadableContrast(page);
    const workspace = page.locator(".inventory-workspace");
    await expect(workspace).toHaveCSS("background-color", theme === "light" ? "rgb(241, 245, 243)" : "rgb(20, 28, 38)");
    await expect(page.getByRole("region", { name: "Inventory results", exact: true })).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(28, 39, 51)");
    for (const width of [1440, 1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const button of await filters.getByRole("button").all()) {
        await expect(button).toBeVisible();
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
    await filters.getByRole("button", { name: "Out of Stock", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("region", { name: "Inventory results", exact: true })).toBeFocused();
    await expect(page.getByRole("region", { name: "Inventory results", exact: true })).toHaveCSS("outline-width", "3px");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("heading", { level: 1, name: "Inventory", exact: true }).click();
    await page.screenshot({ path: info.outputPath("inventory-" + theme + ".png"), fullPage: true, scale: "css" });
    await back.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/admin/dashboard");
    await overview.getByRole("group", { name: "Low Stock Products", exact: true }).getByRole("link").click();
    await expect(page).toHaveURL("/admin/inventory/low-stock");
    await expect(page.getByRole("table", { name: "Mock low-stock inventory", exact: true }).getByRole("rowheader")).toHaveText(["Diapers", "Milk Powder", "Toothpaste"]);
    await expect(inventoryLink).toHaveAttribute("aria-current", "location");
    expect(errors).toEqual([]);
  });
}

test("Inventory direct URL keeps persistent System preference and follows OS themes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(inventoryPath, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".inventory-workspace")).toHaveCSS("background-color", "rgb(20, 28, 38)");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("rowheader")).toHaveCount(7);
});

test("Single Inventory sidebar link supports keyboard, legacy URLs and the mobile drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
  const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
  const inventory = nav.getByRole("link", { name: "Inventory", exact: true });
  await inventory.focus();
  await expect(inventory).toHaveCSS("outline-width", "3px");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(inventoryPath);
  await page.goto("/admin/inventory/low-stock", { waitUntil: "domcontentloaded" });
  await expect(inventory).toHaveAttribute("aria-current", "location");
  await inventory.click();
  await expect(page).toHaveURL(inventoryPath);
  await expect(page.getByRole("rowheader")).toHaveCount(7);
  await page.goto("/admin/dashboard", { waitUntil: "domcontentloaded" });
  await page.setViewportSize({ width: 375, height: 900 });
  const opener = page.getByRole("button", { name: "Open navigation", exact: true });
  const drawer = page.getByRole("dialog", { name: "Admin navigation", exact: true });
  await opener.click();
  const mobile = drawer.getByRole("navigation", { name: "Mobile navigation", exact: true });
  const mobileLink = mobile.getByRole("link", { name: "Inventory", exact: true });
  await expect(mobile.getByRole("button", { name: "Inventory" })).toHaveCount(0);
  await expect(mobileLink).not.toHaveAttribute("aria-expanded");
  await mobileLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(inventoryPath);
  await expect(drawer).toBeHidden();
  await opener.click();
  await expect(mobileLink).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
});
