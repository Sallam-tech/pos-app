import { expect, test, type Route } from "@playwright/test";
import { mockInventory } from "../../src/lib/admin/mock-inventory";
import { expectReadableContrast } from "./support/contrast";
async function reflow(page: import("@playwright/test").Page) {
  for (const width of [320, 375, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
}
for (const theme of ["light", "dark"] as const) test("Products cards and coherent Add/Edit workflow in " + theme, async ({ page, baseURL }, info) => {
  test.setTimeout(60_000); const issues: string[] = [];
  page.on("pageerror", (error) => issues.push(error.message));
  await page.route("**/*", (route) => { const r = route.request(); if (new URL(r.url()).origin === baseURL && ["GET", "HEAD"].includes(r.method())) return route.continue(); issues.push(r.method() + " " + r.url()); return route.abort(); });
  await page.addInitScript((value) => localStorage.setItem("pos-theme", value), theme);
  const desktop = info.project.name === "chromium"; const viewport = { width: desktop ? 1440 : 375, height: 900 }; await page.setViewportSize(viewport);
  await page.goto("/admin/products"); await expect(page).toHaveTitle("Products | Shop POS");
  const list = page.getByRole("region", { name: "Product list", exact: true });
  await expect(list.getByRole("table")).toHaveCount(0); await expect(list.getByRole("article")).toHaveCount(7);
  await expect(list.getByRole("article").first()).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(28, 39, 51)");
  for (const product of mockInventory) {
    const card = list.getByRole("article", { name: product.name, exact: true });
    await expect(card).toContainText(product.quantity + " units"); await expect(card).toContainText(product.id === "diapers" ? "Rs. 1,250.00" : "Not set");
    await expect(card.getByText(product.quantity === 0 ? "Out of Stock" : product.quantity <= product.lowStockThreshold ? "Low Stock" : "Available", { exact: true })).toBeVisible();
    await expect(card.getByRole("link", { name: "Edit " + product.name, exact: true })).toHaveAttribute("href", "/admin/products/" + product.id + "/edit");
  }
  await expectReadableContrast(page); await reflow(page); await page.setViewportSize(viewport);
  if (desktop && theme === "light") await page.screenshot({ path: info.outputPath("products-light.png"), fullPage: true, scale: "css" });
  const search = page.getByRole("searchbox", { name: "Find product by name or code", exact: true });
  await search.fill("  MILK  "); await expect(list.getByRole("article")).toHaveCount(1); await expect(list.getByRole("article", { name: "Milk Powder", exact: true })).toBeVisible();
  await search.fill("not-present"); await expect(list.getByText("No mock products match your search.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click(); await expect(search).toBeFocused();
  const diapers = list.getByRole("article", { name: "Diapers", exact: true });
  await diapers.getByText("Details", { exact: true }).click(); await expect(diapers.getByText("Not available in demo data", { exact: true })).toBeVisible();
  await diapers.getByText("Details", { exact: true }).click();
  const stock = diapers.getByRole("button", { name: "Add stock for Diapers", exact: true }); await stock.focus(); await expect(stock).toHaveCSS("outline-width", "3px"); await stock.press("Enter");
  const stockDialog = page.getByRole("dialog", { name: "Add Stock — Diapers", exact: true }); await expect(stockDialog).toBeVisible();
  await expect(page).toHaveURL("/admin/products"); await stockDialog.press("Escape"); await expect(stock).toBeFocused();
  await diapers.getByRole("link", { name: "Edit Diapers", exact: true }).click();
  await expect(page.getByLabel("Product Name *", { exact: true })).toHaveValue("Diapers"); await expect(page.getByLabel("Selling Price (Rs.)", { exact: true })).toHaveValue("1250.00");
  const cost = page.getByLabel("Buying Price (Rs.)", { exact: true }); await expect(cost).toHaveValue(""); await expect(cost).not.toHaveAttribute("required", "");
  await expect(page.getByTestId("edit-stock-quantity")).toHaveText("5"); await expect(page.getByLabel("Stock Quantity *", { exact: true })).toHaveCount(0);
  await expectReadableContrast(page); await reflow(page); await page.setViewportSize(viewport);
  if (desktop && theme === "light") await page.screenshot({ path: info.outputPath("edit-product-light.png"), fullPage: true, scale: "css" });
  await cost.fill("0.00"); await page.getByRole("button", { name: "Save Changes", exact: true }).click(); await expect(cost).toBeFocused(); await expect(cost).toHaveValue("0.00");
  await cost.fill("1100.50"); await page.getByRole("button", { name: "Save Changes", exact: true }).click(); await expect(page.getByRole("main").getByRole("status")).toContainText("buying price was not updated");
  await page.getByRole("button", { name: "Stop Selling (Demo)", exact: true }).click();
  await page.getByRole("dialog", { name: "Stop Selling (Demo)", exact: true }).getByRole("button", { name: "Confirm Stop Selling (Demo)", exact: true }).click();
  await expect(page.getByText("Inactive (demo preview)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume Selling (Demo)", exact: true }).click();
  await page.getByRole("dialog", { name: "Resume Selling (Demo)", exact: true }).getByRole("button", { name: "Confirm Resume Selling (Demo)", exact: true }).click();
  await expect(page.getByText("Active (demo preview)", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Cancel", exact: true }).click(); await page.getByRole("link", { name: "Add Product", exact: true }).click();
  const name = page.getByLabel("Product Name *", { exact: true }); await expect(name).toBeFocused();
  await expect(page.getByLabel("Unit (Optional)", { exact: true })).toBeVisible(); await expect(page.getByLabel("Unit (Optional)", { exact: true })).toHaveValue("Piece");
  await expect(page.getByLabel("Selling Price (Rs.)", { exact: true })).toHaveValue(""); await expectReadableContrast(page); await reflow(page); await page.setViewportSize(viewport);
  if (desktop) {
    const buying = await page.getByLabel("Buying Price (Rs.) *", { exact: true }).boundingBox(); const selling = await page.getByLabel("Selling Price (Rs.)", { exact: true }).boundingBox();
    expect(Math.abs(buying!.y - selling!.y)).toBeLessThan(2);
    const qty = await page.getByLabel("Stock Quantity *", { exact: true }).boundingBox(); const unit = await page.getByLabel("Unit (Optional)", { exact: true }).boundingBox(); expect(Math.abs(qty!.y - unit!.y)).toBeLessThan(2);
  }
  if (desktop && theme === "light") await page.screenshot({ path: info.outputPath("add-product-light.png"), fullPage: true, scale: "css" });
  await page.getByRole("button", { name: "Save Product", exact: true }).click(); await expect(name).toBeFocused();
  for (const [label, value] of [["Product Name *", "Test product"], ["Buying Price (Rs.) *", "100.99"], ["Stock Quantity *", "0.125"], ["Low Stock Alert *", "0"]]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel("Selling Price (Rs.)", { exact: true }).fill("100.999"); await page.getByRole("button", { name: "Save Product", exact: true }).click(); await expect(page.getByLabel("Selling Price (Rs.)", { exact: true })).toBeFocused();
  await page.getByLabel("Selling Price (Rs.)", { exact: true }).fill(""); await page.getByText("More Details (Optional)", { exact: true }).click();
  const code = page.getByLabel("Product Code (Optional)", { exact: true }); await expect(code).toHaveValue("POS-0001"); await code.fill("bad code");
  await page.getByRole("button", { name: "Save Product", exact: true }).click(); await expect(code).toBeFocused(); await code.fill("");
  await page.getByLabel("Category", { exact: true }).fill("Optional category"); await page.getByRole("button", { name: "Save Product", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("No product or stock was saved");
  await page.getByRole("link", { name: "Cancel", exact: true }).click(); await expect(list.getByRole("article")).toHaveCount(7); await expect(list.getByRole("article", { name: "Diapers", exact: true })).toContainText("5 units");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["pos-theme"]); expect(await page.evaluate(() => sessionStorage.length)).toBe(0); expect(issues).toEqual([]);
});
test("Products cards preserve System theme on OS changes and reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" }); await page.goto("/admin/products"); await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" }); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark"); await page.reload();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system"); await expect(page.getByRole("article")).toHaveCount(7);
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
