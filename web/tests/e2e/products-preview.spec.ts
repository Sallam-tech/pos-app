import { expect, test, type Route } from "@playwright/test";
import { getMockLowStockProducts, getMockStockStatus, mockInventory } from "../../src/lib/admin/mock-inventory";
import { expectReadableContrast } from "./support/contrast";

for (const theme of ["light", "dark"] as const) {
  test("Products preview card, search and stock consistency in " + theme, async ({ page, baseURL }) => {
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
    await expect(page.getByText("Admin workspace", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Layout preview", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "All previews", exact: true })).toHaveCount(0);
    await expect(page.getByText("Mock UI", { exact: true })).toHaveCount(0);
    const overview = page.getByRole("region", { name: "Shop overview" });
    await expect(overview.getByRole("link")).toHaveCount(4);
    const totalCard = overview.getByRole("group", { name: "Total Products", exact: true });
    await expect(totalCard.locator("data")).toHaveAttribute("value", String(mockInventory.length));
    const stockSum = mockInventory.reduce((total, product) => total + product.quantity, 0);
    expect(stockSum).toBe(123);
    await expect(overview.getByRole("group", { name: "Available Stock", exact: true }).locator("data")).toHaveAttribute("value", String(stockSum));
    const totalLink = totalCard.getByRole("link", { name: "Total Products", exact: true });
    for (let step = 0; step < 18; step++) {
      await page.keyboard.press("Tab");
      if (await totalLink.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(totalLink).toBeFocused();
    await expect(totalLink).toHaveCSS("outline-width", "3px");
    await expect(totalLink).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/admin/products");
    await expect(page).toHaveTitle("Products | Shop POS");
    await expect(page.getByRole("heading", { level: 1, name: "Products", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByText("Demo Data", { exact: true })).toBeVisible();
    await expect(page.getByText("Simulated product information, not live inventory.", { exact: true })).toBeVisible();
    await expect(page.getByText("Admin workspace", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Layout preview", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "All previews", exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Breadcrumbs" })).toHaveCount(0);
    await expect(page.getByText("Mock UI", { exact: true })).toHaveCount(0);
    const sidebar = page.getByRole("complementary", { name: "Admin sidebar" });
    await expect(sidebar.getByRole("link", { name: "Products", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(sidebar.getByRole("link", { name: "Products", exact: true })).toHaveClass(/bg-muted/);
    await expect(sidebar.getByRole("link", { name: "Dashboard", exact: true })).not.toHaveClass(/bg-muted/);
    const list = page.getByRole("region", { name: "Product list", exact: true });
    await expect(list).toHaveAccessibleDescription(/Mock data only/);
    const table = list.getByRole("table", { name: "Mock products" });
    await expect(table.getByRole("rowheader")).toHaveText(mockInventory.map((product) => product.name));
    const lowStock = getMockLowStockProducts();
    for (const product of mockInventory) {
      const row = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: product.name, exact: true }) });
      await expect(row.getByRole("cell")).toHaveText([
        String(product.quantity), getMockStockStatus(product),
      ]);
    }
    await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
    await expect(page.getByText(/Advisory only/)).toHaveClass("sr-only");
    expect((await page.locator("header").boundingBox())!.height).toBeLessThan(100);
    expect((await page.getByRole("heading", { level: 1, name: "Products", exact: true }).boundingBox())!.y).toBeLessThan(140);
    await expectReadableContrast(page);
    const search = page.getByRole("searchbox", { name: "Search by product name" });
    await search.focus();
    await page.keyboard.type("  MILK  ");
    await expect(table.getByRole("rowheader")).toHaveText(["Milk Powder"]);
    await expect(list.getByRole("status")).toHaveText("Showing 1 of 7 mock products.");
    await search.fill("diap");
    await search.press("Enter");
    await expect(page).toHaveURL("/admin/products");
    await expect(table.getByRole("rowheader")).toHaveText(["Diapers"]);
    await search.fill("no-such-product");
    await expect(list.getByRole("table")).toHaveCount(0);
    await expect(list.getByText("No mock products match your search.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(search).toBeFocused();
    await expect(table.getByRole("rowheader")).toHaveCount(mockInventory.length);

    await search.fill("TOOTHPASTE");
    await expect(table.getByRole("rowheader")).toHaveText(["Toothpaste"]);
    await expect(table.getByRole("cell")).toHaveText(["0", "Out of stock"]);
    await expect(table.getByText("Out of stock", { exact: true })).toHaveClass(/text-danger/);
    await page.getByRole("button", { name: "Clear search", exact: true }).click();

    for (const width of [768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(search).toBeVisible();
      await search.fill("  WIPES ");
      await expect(table.getByRole("rowheader")).toHaveText(["Baby Wipes"]);
      await page.getByRole("button", { name: "Clear search", exact: true }).click();
      await expect(search).toBeFocused();
    }
    await page.getByRole("link", { name: "Back to Dashboard", exact: true }).click();
    await expect(page).toHaveURL("/admin/dashboard");
    // A click outside the small View list hint activates the full Total Products card.
    await totalCard.click({ position: { x: 20, y: 20 } });
    await expect(page).toHaveURL("/admin/products");
    await page.getByRole("link", { name: "Back to Dashboard", exact: true }).click();
    const lowCard = overview.getByRole("group", { name: "Low Stock Products", exact: true });
    await expect(lowCard.locator("data")).toHaveAttribute("value", String(lowStock.length));
    await lowCard.getByRole("link", { name: "Low Stock Products", exact: true }).click();
    await expect(page).toHaveURL("/admin/inventory/low-stock");
    await expect(page.getByText("Admin workspace", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Layout preview", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "All previews", exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Breadcrumbs" })).toHaveCount(0);
    await expect(page.getByText("Mock UI", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Advisory only/)).toHaveClass("sr-only");
    const lowTable = page.getByRole("table", { name: "Mock low-stock inventory" });
    await expect(lowTable.getByRole("rowheader")).toHaveText(["Diapers", "Milk Powder", "Toothpaste"]);
    await expect(lowTable.getByRole("row")).toHaveCount(lowStock.length + 1);
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("Products preview supports direct loading and persistent System theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/admin/products");
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("table", { name: "Mock products" }).getByRole("rowheader")).toHaveCount(mockInventory.length);
});

test("Admin compact connectivity preserves checking, unavailable, unknown and retry feedback", async ({ page }) => {
  let mode = "hold";
  let held: Route | undefined;
  await page.route("**/api/health", (route) => {
    if (mode === "hold") { held = route; return; }
    if (mode === "fail") return route.abort("connectionreset");
    if (mode === "unknown") return route.fulfill({ json: { status: "unexpected" } });
    return route.fulfill({ json: { status: "ok", service: "pos-web" } });
  });
  for (const path of ["/admin/dashboard", "/admin/inventory/low-stock"]) {
    mode = "hold"; held = undefined;
    await page.goto(path);
    const indicator = page.locator("[data-connectivity-state]");
    const retry = page.getByRole("button", { name: "Check shop server connection", exact: true });
    await expect(indicator).toHaveAttribute("data-connectivity-state", "checking");
    await expect(indicator).toContainText("Checking shop server");
    await expect(indicator).toBeVisible();
    await expect(retry).toBeDisabled();
    await expect.poll(() => Boolean(held)).toBe(true);
    await held!.fulfill({ json: { status: "ok", service: "pos-web" } });
    await expect(indicator).toHaveAttribute("data-connectivity-state", "connected");
    await expect(page.getByText(/Advisory only/)).toHaveClass("sr-only");
    for (const [next, state, label] of [
      ["fail", "disconnected", "Cannot reach shop server"],
      ["unknown", "unknown", "Shop server status unknown"],
      ["ok", "connected", "Shop server connected"],
    ]) {
      mode = next;
      await retry.click();
      await expect(indicator).toHaveAttribute("data-connectivity-state", state);
      await expect(indicator).toContainText(label);
      await expect(indicator).toBeVisible();
      await expect(page.getByText("Demo Data", { exact: true })).toBeVisible();
    }
  }
});
