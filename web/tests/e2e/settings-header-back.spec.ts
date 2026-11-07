import { expect, test, type Page } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";
test.use({ actionTimeout: 10_000 });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const found: string[] = []; errors.set(page, found); page.on("pageerror", (error) => found.push(error.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));
async function ready(page: Page, route: string) {
  await page.goto(route); await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Shop server connected", { exact: true })).toBeVisible();
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
async function backArrow(page: Page, name: string, href: string) {
  const arrow = page.getByRole("main").getByRole("link", { name, exact: true });
  await expect(arrow).toHaveAttribute("href", href); await expect(arrow).toHaveCount(1);
  const [a, h] = await Promise.all([arrow.boundingBox(), page.getByRole("heading", { level: 1 }).boundingBox()]);
  expect(a!.width).toBeGreaterThanOrEqual(44); expect(a!.height).toBeGreaterThanOrEqual(44); expect(a!.x + a!.width).toBeLessThanOrEqual(h!.x);
  await arrow.focus(); await expect(arrow).toHaveCSS("outline-width", "3px"); return arrow;
}
for (const theme of ["light", "dark"] as const) test("compact Settings, neutral surfaces and navy header in " + theme, async ({ page }, info) => {
  const desktop = info.project.name === "chromium";
  await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
  await page.addInitScript((mode) => localStorage.setItem("pos-theme", mode), theme);
  await ready(page, "/admin/settings");
  await expect(page.locator(".workspace-header")).toHaveCSS("background-color", "rgb(25, 39, 53)");
  await expect(page.locator(".workspace-header").getByRole("link", { name: "Back to Login", exact: true })).toHaveAttribute("href", "/login");
  await backArrow(page, "Back to Dashboard", "/admin/dashboard");
  const details = page.getByRole("form", { name: "Shop and receipt settings" });
  await expect(details.getByLabel("Shop Name", { exact: true })).toHaveValue("Shop POS");
  await expect(page.getByLabel("Currency", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Receipt Paper", { exact: true }).locator("option")).toHaveText(["Ordinary page", "Compact receipt (80 mm)"]);
  await expect(page.getByRole("heading", { name: "Passwords", exact: true })).toBeVisible();
  await expect(page.getByText("Setup pending", { exact: true })).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  if (desktop) {
    const [phone, paper, preview, save] = await Promise.all(["Phone Number", "Receipt Paper"].map((name) => page.getByLabel(name, { exact: true }).boundingBox()).concat(["Preview Receipt", "Save Settings"].map((name) => page.getByRole("button", { name, exact: true }).boundingBox())));
    expect(Math.abs(phone!.y - paper!.y)).toBeLessThan(1); expect(phone!.height).toBe(paper!.height); expect(preview!.x).toBeLessThan(save!.x);
    await page.screenshot({ path: info.outputPath("settings-" + theme + ".png"), fullPage: true, scale: "css" });
  }
  await expectReadableContrast(page);
  for (const width of [320, 375, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 720 }); await noOverflow(page); }
  await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
  const change = page.getByRole("button", { name: "Change Admin password", exact: true });
  await change.focus(); await change.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Admin Password", exact: true });
  const password = dialog.getByLabel("New password", { exact: true });
  await expect(password).toHaveValue(""); await password.fill("seven77"); await password.press("Tab");
  await expect(dialog.getByText("Use at least 8 characters in this preview.", { exact: true })).toBeVisible();
  for (const value of ["abcdefgh", "12345678", "!@#$%^&*", "a".repeat(128)]) {
    await password.fill(value); await password.press("Tab");
    await expect(dialog.getByText("Use at least 8 characters in this preview.", { exact: true })).toHaveCount(0);
  }
  await expect(dialog.getByRole("button", { name: "Secure setup required" })).toBeDisabled();
  await dialog.press("Escape"); await expect(change).toBeFocused(); await change.press("Enter");
  await expect(password).toHaveValue(""); await dialog.press("Escape");
  await page.getByRole("button", { name: "Change Salesperson password", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Salesperson Password", exact: true })).toContainText("Secure setup pending.");
  await page.keyboard.press("Escape");
  await page.getByLabel("Theme", { exact: true }).selectOption("system"); await page.emulateMedia({ colorScheme: theme });
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["pos-theme"]);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0); expect(await page.context().cookies()).toEqual([]);
});
test("all page parents stay within their role on direct entry and refresh", async ({ page }, info) => {
  test.setTimeout(70_000);
  await page.setViewportSize({ width: info.project.name === "chromium" ? 1440 : 375, height: 900 });
  const paths = [
    ["/admin/products", "Back to Dashboard", "/admin/dashboard"], ["/admin/products/new", "Back to Products", "/admin/products"],
    ["/admin/products/diapers/edit", "Back to Products", "/admin/products"],
    ["/admin/inventory/available-stock", "Back to Dashboard", "/admin/dashboard"],
    ["/admin/inventory/low-stock", "Back to Inventory", "/admin/inventory/available-stock"],
    ["/admin/reports", "Back to Dashboard", "/admin/dashboard"],
    ["/admin/reports/sales", "Back to Reports", "/admin/reports"], ["/admin/reports/profit", "Back to Reports", "/admin/reports"],
    ["/admin/sales/today", "Back to Reports", "/admin/reports"], ["/admin/profit/today", "Back to Reports", "/admin/reports"],
    ["/admin/investment", "Back to Dashboard", "/admin/dashboard"], ["/admin/expenses", "Back to Dashboard", "/admin/dashboard"],
    ["/admin/settings", "Back to Dashboard", "/admin/dashboard"], ["/admin/daily-closing", "Back to Dashboard", "/admin/dashboard"],
    ["/pos/history", "Back to Make a Sale", "/pos"], ["/pos/returns", "Back to Make a Sale", "/pos"], ["/pos/expenses", "Back to Make a Sale", "/pos"],
  ];
  for (const [route, label, parent] of paths) {
    await ready(page, route + "?returnTo=https://example.com"); await page.reload();
    const back = await backArrow(page, label, parent); await noOverflow(page);
    await back.press("Enter"); await expect(page).toHaveURL(parent);
  }
  for (const route of ["/admin/dashboard", "/pos", "/login"]) {
    await page.goto(route); await expect(page.locator(".page-back-link")).toHaveCount(0);
  }
});
test("new Back and Exit actions protect unsaved forms and remain available on mobile", async ({ page }, info) => {
  const desktop = info.project.name === "chromium";
  await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
  await ready(page, "/admin/settings");
  await page.getByLabel("Shop Name", { exact: true }).fill("Unsaved shop");
  await (await backArrow(page, "Back to Dashboard", "/admin/dashboard")).click();
  const guard = page.getByRole("dialog", { name: "Leave this page?", exact: true });
  await guard.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Shop Name", { exact: true })).toHaveValue("Unsaved shop");
  if (!desktop) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const exit = page.getByRole("link", { name: "Exit Demo", exact: true }); await exit.focus(); await exit.press("Enter");
  await expect(guard).toBeVisible(); await guard.getByRole("button", { name: "Keep editing" }).click(); await expect(exit).toBeFocused();
  await exit.press("Enter"); await guard.getByRole("link", { name: "Leave page", exact: true }).click(); await expect(page).toHaveURL("/login");
  const password = page.getByLabel("Password", { exact: true }); await expect(password).toHaveValue("");
  await expect(password).toHaveAttribute("autocomplete", "off");
  await password.fill("temporary-only"); await page.reload(); await expect(password).toHaveValue("");
  await password.fill("temporary-only"); await password.press("Enter");
  await expect(page.getByRole("form").getByRole("alert")).toContainText("No credentials were checked");
  await expect(page).toHaveURL("/login"); await expect(password).toHaveValue("");
  await ready(page, "/admin/products/new"); await page.getByLabel("Product Name *", { exact: true }).fill("Unsaved product");
  await page.getByRole("link", { name: "Back to Products", exact: true }).click(); await expect(guard).toBeVisible(); await guard.press("Escape");
  await expect(page.getByLabel("Product Name *", { exact: true })).toHaveValue("Unsaved product");
  await ready(page, "/admin/products/diapers/edit"); await page.getByLabel("Product Name *", { exact: true }).fill("Unsaved edit");
  await page.getByRole("link", { name: "Back to Products", exact: true }).click(); await expect(guard).toBeVisible(); await guard.press("Escape");
  await ready(page, "/pos/expenses");
  await page.getByLabel("Amount (Rs.)", { exact: true }).fill("100");
  await page.getByRole("link", { name: "Back to Make a Sale", exact: true }).click(); await expect(guard).toBeVisible(); await guard.press("Escape");
  await page.getByRole("link", { name: "Exit Demo", exact: true }).click(); await expect(guard).toBeVisible();
  await guard.getByRole("link", { name: "Leave page", exact: true }).click(); await expect(page).toHaveURL("/login");
});
test("navy headers and arrows preserve approved Admin and Salesperson content", async ({ page }, info) => {
  await page.setViewportSize({ width: info.project.name === "chromium" ? 1440 : 375, height: 900 });
  await page.addInitScript(() => localStorage.setItem("pos-theme", "light"));
  for (const [route, shot] of [["/admin/products", "admin-header-back"], ["/pos/history", "salesperson-header-back"]]) {
    await ready(page, route);
    await expect(page.locator(".workspace-header")).toHaveCSS("background-color", "rgb(25, 39, 53)");
    await expectReadableContrast(page);
    if (info.project.name === "chromium") await page.screenshot({ path: info.outputPath(shot + ".png"), fullPage: true, scale: "css" });
  }
  const receiptButton = page.getByRole("button", { name: "View Receipt for demo-sale-1", exact: true });
  await receiptButton.focus(); await receiptButton.press("Enter");
  const receipt = page.getByRole("dialog", { name: "Sample Receipt", exact: true });
  await expect(receipt.locator(".page-back-link")).toHaveCount(0); await receipt.press("Escape"); await expect(receiptButton).toBeFocused();
  await page.goto("/pos/returns"); await expect(page.getByRole("main").getByRole("link", { name: "Back to Make a Sale" })).toHaveAttribute("href", "/pos");
  await expect(page.getByRole("main")).not.toContainText(/gross profit|purchase cost|remaining stock/i);
});
