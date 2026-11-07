import { expect, test, type Page } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

test.use({ actionTimeout: 10_000 });
const issues = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, baseURL }) => {
  const errors: string[] = []; issues.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const request = route.request();
    if (new URL(request.url()).origin === baseURL && ["GET", "HEAD"].includes(request.method())) return route.continue();
    errors.push(request.method() + " " + request.url()); return route.abort();
  });
});
test.afterEach(async ({ page }) => expect(issues.get(page)).toEqual([]));
async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function checkAdminNavigation(page: Page) {
  const mobile = page.viewportSize()!.width < 1024;
  if (mobile) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const nav = page.getByRole("navigation", { name: mobile ? "Mobile navigation" : "Main navigation", exact: true });
  await expect(nav.getByRole("link")).toHaveText(["Dashboard", "Products", "Inventory", "Reports", "Total Investment", "Daily Closing", "Settings"]);
  if (mobile) await page.getByRole("dialog", { name: "Admin navigation", exact: true }).press("Escape");
}
for (const theme of ["light", "dark"] as const) test("compact Dashboard and preserved drilldowns in " + theme, async ({ page }, info) => {
  test.setTimeout(60_000);
  const desktop = info.project.name === "chromium";
  await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
  await page.addInitScript((value) => localStorage.setItem("pos-theme", value), theme);
  await ready(page, "/admin/dashboard");
  await checkAdminNavigation(page);
  const overview = page.getByRole("region", { name: "Shop overview", exact: true });
  for (const [name, count] of [["Sales & Profit", 3], ["Inventory Overview", 3], ["Investment Overview", 2]] as const) {
    const section = overview.getByRole("region", { name, exact: true });
    await expect(section.getByRole("group")).toHaveCount(count);
    if (desktop) {
      const boxes = await section.getByRole("group").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
      expect(Math.max(...boxes.map((box) => box.y)) - Math.min(...boxes.map((box) => box.y))).toBeLessThan(1);
      for (const box of boxes) expect(box.height).toBeLessThanOrEqual(116);
    }
  }
  await expect(overview.getByText("View Details", { exact: true })).toHaveCount(0);
  for (const text of ["Rs. 25,690.00", "Rs. 5,140.00", "7", "123", "3"]) await expect(overview.getByText(text, { exact: true })).toBeVisible();
  await expect(overview.getByText("Not available", { exact: true })).toHaveCount(2);
  await expect(overview.getByRole("group", { name: "Shop Expenses", exact: true })).toContainText("Unavailable");
  if (desktop) await expect(page.getByRole("complementary", { name: "Admin sidebar" })).toHaveCSS("background-color", "rgb(25, 39, 53)");
  await expect(page.locator("body")).toHaveCSS("background-color", theme === "light" ? "rgb(241, 245, 243)" : "rgb(20, 28, 38)");
  await expectReadableContrast(page);
  if (desktop) await page.screenshot({ path: info.outputPath("dashboard-" + theme + ".png"), fullPage: true, scale: "css" });
  for (const width of [320, 375, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 720 }); await noOverflow(page); }
  await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
  for (const [label, destination] of [
    ["Today's Sales Revenue (PKR)", "/admin/sales/today"], ["Today's Gross Profit", "/admin/profit/today"],
    ["Shop Expenses", "/admin/expenses"], ["Total Products", "/admin/products"],
    ["Available Stock", "/admin/inventory/available-stock"], ["Low Stock Products", "/admin/inventory/low-stock"],
    ["Total Investment", "/admin/investment"], ["Stock Value", "/admin/investment"],
  ]) {
    const link = overview.getByRole("link", { name: label, exact: true });
    await link.focus(); await expect(link).toHaveCSS("outline-width", "3px"); await link.press("Enter");
    await expect(page).toHaveURL(destination); await page.goto("/admin/dashboard");
  }
  await page.getByRole("link", { name: "Close Day", exact: true }).click();
  await expect(page).toHaveURL("/admin/daily-closing");
  await expect(page.getByRole("button", { name: "Confirm Closing — setup required" })).toBeDisabled();
});

test("browser-local Settings, safe Login and new receipt branding", async ({ page }, info) => {
  test.setTimeout(60_000);
  const desktop = info.project.name === "chromium";
  await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
  await page.addInitScript(() => localStorage.setItem("pos-theme", "light"));
  await ready(page, "/admin/settings");
  const shopName = page.getByLabel("Shop Name", { exact: true });
  await shopName.fill(""); await page.getByRole("button", { name: "Save Settings", exact: true }).click();
  await expect(shopName).toBeFocused(); await expect(page.getByText("Enter your shop name.", { exact: true })).toBeVisible();
  await shopName.fill("Al Madina Store");
  await page.getByLabel("Shop Address", { exact: true }).fill("Main Road");
  await page.getByLabel("Phone Number", { exact: true }).fill("+92 300 1234567");
  await page.getByLabel("Receipt Message", { exact: true }).fill("Thank you for shopping!");
  await page.getByLabel("Receipt Paper", { exact: true }).selectOption("compact");
  await page.getByRole("button", { name: "Save Settings", exact: true }).click();
  await expect(page.getByText("Settings saved on this browser only.", { exact: true })).toBeVisible();
  await page.reload(); await expect(shopName).toHaveValue("Al Madina Store");
  await expectReadableContrast(page);
  if (desktop) {
    const [phone, paper] = await Promise.all([page.getByLabel("Phone Number", { exact: true }).boundingBox(), page.getByLabel("Receipt Paper", { exact: true }).boundingBox()]);
    expect(Math.abs(phone!.y - paper!.y)).toBeLessThan(1); expect(Math.abs(phone!.height - paper!.height)).toBeLessThan(1);
    await page.screenshot({ path: info.outputPath("settings-light.png"), fullPage: true, scale: "css" });
  }
  await page.getByRole("button", { name: "Preview Receipt", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Sample Receipt", exact: true });
  await expect(dialog).toContainText("Al Madina Store"); await expect(dialog).toContainText("Main Road");
  await expect(dialog.getByLabel("Print layout", { exact: true })).toHaveValue("compact");
  await dialog.press("Escape");
  const adminPassword = page.getByRole("button", { name: "Change Admin password", exact: true });
  await adminPassword.focus(); await adminPassword.press("Enter");
  dialog = page.getByRole("dialog", { name: "Admin Password", exact: true });
  const newPassword = dialog.getByLabel("New password", { exact: true });
  await newPassword.fill("short"); await newPassword.press("Tab");
  await expect(dialog.getByText("Use at least 8 characters in this preview.", { exact: true })).toBeVisible();
  await newPassword.fill("lettersallowed");
  await dialog.getByRole("button", { name: "Show new password", exact: true }).click();
  await expect(newPassword).toHaveAttribute("type", "text");
  await dialog.getByLabel("Confirm password", { exact: true }).fill("different-password");
  await dialog.getByLabel("Confirm password", { exact: true }).press("Tab");
  await expect(dialog.getByText("The passwords do not match.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Secure setup required", exact: true })).toBeDisabled();
  await dialog.press("Escape"); await expect(adminPassword).toBeFocused();
  await adminPassword.press("Enter"); await expect(newPassword).toHaveValue(""); await dialog.press("Escape");
  await expect(page.getByText("Daily backup and restore options will become available with the local database.", { exact: true })).toBeVisible();
  if (!desktop) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("link", { name: "Exit Demo", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Al Madina Store", exact: true })).toBeVisible();
  await expect(page.getByLabel("Username", { exact: true })).toHaveCount(0);
  await expectReadableContrast(page);
  if (desktop) await page.screenshot({ path: info.outputPath("login-light.png"), fullPage: true, scale: "css" });
  const password = page.getByLabel("Password", { exact: true });
  await page.getByRole("button", { name: "Open Shop", exact: true }).click(); await expect(password).toBeFocused();
  await password.fill("made-up-login-only"); await password.press("Enter");
  await expect(page.getByRole("form").getByRole("alert")).toContainText("No credentials were checked");
  await expect(page).toHaveURL("/login"); await expect(password).toHaveValue("");
  await page.getByRole("link", { name: "Preview Salesperson", exact: true }).click();
  const nav = page.getByRole("navigation", { name: desktop ? "Salesperson navigation" : "Mobile Salesperson navigation", exact: true });
  await expect(nav.getByRole("link")).toHaveText(["Make a Sale", "Sales History", "Return Item", "Shop Expenses"]);
  await expect(page.getByRole("main")).not.toContainText(/purchase cost|gross profit|investment|daily closing|Settings/i);
  await expectReadableContrast(page);
  if (desktop) await page.screenshot({ path: info.outputPath("salesperson-light.png"), fullPage: true, scale: "css" });
  const product = page.getByRole("combobox", { name: "Find Product", exact: true });
  await product.fill("diap"); await product.press("ArrowDown"); await product.press("Enter");
  await expect(product).toBeFocused();
  await page.getByLabel("Diapers quantity, item 1", { exact: true }).fill("2");
  await page.getByLabel("Diapers price (PKR), item 1", { exact: true }).fill("1250.25");
  
  await expect(page.getByTestId("sale-total")).toHaveText("Rs. 2,500.50");
  await page.getByLabel("Discount (%, optional)", { exact: true }).fill("10");
  await expect(page.getByTestId("sale-total")).toHaveText("Rs. 2,250.45");
  await page.getByRole("button", { name: "Create Invoice", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Sample Invoice", exact: true });
  await expect(dialog).toContainText("Al Madina Store"); await expect(dialog).toContainText("Main Road");
  await expect(dialog).toContainText("+92 300 1234567"); await expect(dialog).toContainText("Thank you for shopping!");
  await expect(dialog.getByTestId("receipt-total")).toHaveText("Rs. 2,250.45");
  await expect(dialog.getByLabel("Print layout", { exact: true })).toHaveValue("compact");
  await expect(dialog).not.toContainText(/gross profit|buying cost|purchase cost/i);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(product).toBeFocused();
  await page.goto("/pos/history");
  await page.getByRole("button", { name: "View Receipt for demo-sale-1", exact: true }).click();
  const historical = page.getByRole("dialog", { name: "Sample Receipt", exact: true });
  await expect(historical).toContainText("Shop POS"); await expect(historical).not.toContainText("Al Madina Store");
  await historical.press("Escape");
  const saved = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  expect(Object.keys(saved).sort()).toEqual(["pos-theme", "shop-pos-display-settings-v1"]);
  expect(JSON.stringify(saved)).not.toMatch(/lettersallowed|different-password|made-up-login-only/);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0); expect(await page.context().cookies()).toEqual([]);
});

test("Daily Closing stays read-only with honest missing data", async ({ page }, info) => {
  const desktop = info.project.name === "chromium";
  await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
  await page.addInitScript(() => localStorage.setItem("pos-theme", "light"));
  await ready(page, "/admin/dashboard"); await page.getByRole("link", { name: "Close Day", exact: true }).click();
  await expect(page).toHaveURL("/admin/daily-closing");
  const summary = page.getByRole("region", { name: "Daily closing summary" });
  for (const [label, value] of [["Total Sales", "Rs. 25,690.00"], ["Cost of Sold Items", "Rs. 20,550.00"], ["Gross Profit", "Rs. 5,140.00"]]) await expect(summary.getByRole("group", { name: label, exact: true })).toContainText(value);
  for (const label of ["Shop Expenses", "Returns / Refunds", "Profit After Expenses"]) await expect(summary.getByRole("group", { name: label, exact: true })).toContainText("Not available");
  await expect(page.getByText(/not the shop’s current day/)).toBeVisible(); await expectReadableContrast(page);
  if (desktop) await page.screenshot({ path: info.outputPath("daily-closing-light.png"), fullPage: true, scale: "css" });
  const date = page.getByLabel("Business Date (Asia/Karachi)", { exact: true });
  await date.fill(""); await expect(page.getByRole("main").getByRole("alert")).toHaveText("Choose a valid business date.");
  await date.fill("2026-11-03"); await expect(summary.getByRole("group", { name: "Total Sales", exact: true })).toContainText("Rs. 0.00");
  await expect(summary.getByRole("group", { name: "Profit After Expenses", exact: true })).toContainText("Not available");
  await expect(page.getByRole("button", { name: "Confirm Closing — setup required", exact: true })).toBeDisabled();
  for (const width of [320, 375, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 600 }); await noOverflow(page); }
  await page.getByRole("link", { name: "Back to Dashboard", exact: true }).click();
  await expect(page.getByRole("group", { name: "Today's Gross Profit", exact: true })).toContainText("Rs. 5,140.00");
  await expect(page.getByRole("group", { name: "Available Stock", exact: true })).toContainText("123");
});

test("shared themes preserve approved modules and System reflow", async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: info.project.name === "chromium" ? 1440 : 375, height: 900 });
  for (const theme of ["light", "dark"] as const) {
    await ready(page, "/admin/settings"); await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    await expectReadableContrast(page);
    await page.goto("/admin/products");
    const product = page.getByRole("article", { name: "Diapers", exact: true });
    await expect(product).toContainText("5 units"); await expect(product).toContainText("Rs. 1,250.00");
    await expect(product).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(28, 39, 51)");
    await product.getByRole("button", { name: "Add stock for Diapers", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Add Stock — Diapers", exact: true })).toBeVisible(); await expectReadableContrast(page);
    await page.keyboard.press("Escape"); await product.getByRole("link", { name: "Edit Diapers", exact: true }).click();
    await expect(page.getByTestId("edit-stock-quantity")).toHaveText("5"); await expectReadableContrast(page);
    await page.goto("/admin/inventory/available-stock"); await expect(page.getByRole("rowheader")).toHaveCount(7); await expectReadableContrast(page);
    for (const kind of ["sales", "profit"]) {
      await page.goto("/admin/reports/" + kind);
      await expect(page.getByRole("heading", { level: 1, name: kind === "sales" ? "Sales Report" : "Profit Report", exact: true })).toBeVisible();
      expect(await page.locator("rect[data-comparison-bar]").count()).toBeGreaterThan(0); await expectReadableContrast(page);
    }
    await page.goto("/pos"); await expectReadableContrast(page);
    await page.goto("/login"); await expectReadableContrast(page);
    await page.setViewportSize({ width: 512, height: 384 }); await page.getByRole("button", { name: "Open Shop", exact: true }).click(); await noOverflow(page);
    await page.getByRole("link", { name: "Preview Admin", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("link", { name: "Preview Admin", exact: true })).toBeInViewport();
    await page.setViewportSize({ width: info.project.name === "chromium" ? 1440 : 375, height: 900 });
  }
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" }); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" }); await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
