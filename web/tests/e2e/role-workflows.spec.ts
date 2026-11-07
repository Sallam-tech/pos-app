import { expect, test, type Page } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";
test.use({ actionTimeout: 10_000 });
const issues = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, baseURL }) => {
  const found: string[] = []; issues.set(page, found);
  page.on("pageerror", (error) => found.push(error.message));
  await page.route("**/*", (route) => {
    const request = route.request();
    if (new URL(request.url()).origin === baseURL && ["GET", "HEAD"].includes(request.method())) return route.continue();
    found.push(request.method() + " " + request.url()); return route.abort();
  });
});
test.afterEach(async ({ page }) => expect(issues.get(page)).toEqual([]));
async function responsive(page: Page) {
  const original = page.viewportSize()!;
  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 768 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Overflow at " + width).toBe(true);
  }
  await page.setViewportSize(original);
}
function salesNavigation(page: Page) {
  return page.getByRole("navigation", { name: page.viewportSize()!.width >= 1024 ? "Salesperson navigation" : "Mobile Salesperson navigation", exact: true });
}
async function safeSalesperson(page: Page) {
  await expect(page.getByRole("complementary", { name: "Admin sidebar" })).toHaveCount(0);
  await expect(salesNavigation(page).getByRole("link")).toHaveText(["Make a Sale", "Sales History", "Return Item", "Shop Expenses"]);
  await expect(page.getByRole("main")).not.toContainText(/purchase cost|historical cost|gross profit|total investment|profit report|available stock/i);
  expect(await page.content()).not.toMatch(/unitCostSnapshotPaise|costOfGoodsSoldPaise|grossProfitPaise|lowStockThreshold|stockOnHand|fictionalHistoricalUnitCosts/);
}
test("connected role workflows, direct navigation, safe payloads and bookmarked routes", async ({ page }, info) => {
  test.setTimeout(90_000);
  const desktop = info.project.name === "chromium";
  await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
  await page.addInitScript(() => localStorage.setItem("pos-theme", "light"));
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { name: "Shop POS", exact: true })).toBeVisible();
  await responsive(page); await expectReadableContrast(page);
  if (desktop) await page.screenshot({ path: info.outputPath("01-login-light.png"), fullPage: true, scale: "css" });
  await page.getByRole("link", { name: "Preview Admin", exact: true }).click();
  await expect(page).toHaveURL("/admin/dashboard");
  await expect(page.getByRole("main")).toContainText("Rs. 25,690.00");
  await expect(page.getByRole("main")).toContainText("Rs. 5,140.00");
  await responsive(page); await expectReadableContrast(page);
  if (desktop) {
    const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
    await expect(nav.getByRole("link", { name: "Total Investment", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Demo Tools|Return Item|Shop Expenses/ })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("02-dashboard-light.png"), fullPage: true, scale: "css" });
    await page.getByRole("link", { name: "Total Products", exact: true }).click();
    await expect(page).toHaveURL("/admin/products");
    await expect(page.getByRole("region", { name: "Product results", exact: true }).getByRole("row")).toHaveCount(8);
    await responsive(page); await expectReadableContrast(page);
    await page.screenshot({ path: info.outputPath("07-products-light.png"), fullPage: true, scale: "css" });
    await nav.getByRole("link", { name: "Dashboard", exact: true }).click();
    await nav.getByRole("link", { name: "Total Investment", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await page.getByRole("navigation", { name: "Mobile navigation", exact: true }).getByRole("link", { name: "Total Investment", exact: true }).click();
  }
  await expect(page).toHaveURL("/admin/investment");
  await expect(page.getByText("Not available — purchase information incomplete", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("main").getByRole("form")).toHaveCount(0);
  await responsive(page); await expectReadableContrast(page);
  if (page.url().includes("/admin/") && page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("link", { name: "Exit Demo", exact: true }).click();
  if (await page.getByRole("dialog", { name: "Leave this page?", exact: true }).isVisible()) await page.getByRole("link", { name: "Leave page", exact: true }).click();
  await page.getByRole("link", { name: "Preview Salesperson", exact: true }).click();
  await expect(page).toHaveURL("/pos"); await safeSalesperson(page);
  await expect(page.getByRole("heading", { name: "Make a Sale", exact: true })).toBeVisible();
  await expect(page.getByLabel("Discount (%)", { exact: true })).toBeVisible();
  const product = page.getByRole("combobox", { name: "Product", exact: true });
  await product.fill("dia"); await product.press("Enter");
  await page.getByLabel("Diapers quantity, item 1", { exact: true }).fill("2");
  await page.getByLabel("Selling price per unit (PKR)", { exact: true }).fill("1250.25");
  await expect(page.getByTestId("sale-total")).toHaveText("Rs. 2,500.50");
  await responsive(page); await expectReadableContrast(page);
  if (desktop) {
    await page.screenshot({ path: info.outputPath("03-make-sale-light.png"), fullPage: true, scale: "css" });
    await page.getByRole("complementary", { name: "Salesperson sidebar" }).screenshot({ path: info.outputPath("04-salesperson-sidebar.png"), scale: "css" });
  }
  await salesNavigation(page).getByRole("link", { name: "Return Item", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/pos/returns"); await safeSalesperson(page);
  await expect(salesNavigation(page).getByRole("link", { name: "Return Item", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByLabel("Product / original sale", { exact: true }).selectOption("demo-sale-1");
  await page.getByLabel("Return Quantity", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Review Return", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("cannot exceed");
  await page.getByLabel("Return Quantity", { exact: true }).fill("2");
  await page.getByLabel("Item Condition (optional)", { exact: true }).selectOption("good");
  await page.getByRole("button", { name: "Review Return", exact: true }).click();
  await expect(page.locator("main h2[tabindex='-1']")).toBeFocused();
  await expect(page.getByText("Refund amount not available for this demo sale.", { exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Rs. 2,500.50");
  await responsive(page); await expectReadableContrast(page);
  await page.evaluate(() => scrollTo(0, 0));
  if (desktop) await page.screenshot({ path: info.outputPath("05-return-light.png"), fullPage: true, scale: "css" });
  await salesNavigation(page).getByRole("link", { name: "Shop Expenses", exact: true }).click();
  await expect(page).toHaveURL("/pos/expenses"); await safeSalesperson(page);
  expect(await page.content()).not.toMatch(/demo-sale-[1-8]/);
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByLabel("Amount (Rs.)", { exact: true }).fill("-1");
  await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("positive PKR");
  await page.getByLabel("Expense Date", { exact: true }).fill("2026-11-02");
  await page.getByLabel("Amount (Rs.)", { exact: true }).fill("1250.25");
  await page.getByLabel("Note (optional)", { exact: true }).fill("Temporary example");
  await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  await page.getByRole("button", { name: "View Expense Summary", exact: true }).click();
  await expect(page.getByRole("region", { name: "Temporary demo expenses" })).toContainText("Rs. 1,250.25");
  await page.getByRole("button", { name: "Correct Rent expense on 2026-11-02" }).click();
  await page.getByLabel("Amount (Rs.)", { exact: true }).fill("1500.50");
  await page.getByRole("button", { name: "Update Expense", exact: true }).click();
  await page.getByRole("button", { name: "View Expense Summary", exact: true }).click();
  await page.getByLabel("Selected Date", { exact: true }).fill("2026-11-03");
  await expect(page.locator("dl")).toContainText("Rs. 0.00");
  await expect(page.locator("dl")).toContainText("Rs. 1,500.50");
  await responsive(page); await expectReadableContrast(page);
  await page.evaluate(() => scrollTo(0, 0));
  if (desktop) await page.screenshot({ path: info.outputPath("06-expenses-light.png"), fullPage: true, scale: "css" });
  await page.getByLabel("Selected Date", { exact: true }).fill("2026-11-02");
  await page.getByRole("button", { name: "Remove Rent expense on 2026-11-02" }).click();
  await expect(page.getByText("No expenses recorded for this date.", { exact: true })).toBeVisible();
  await page.getByRole("dialog", { name: "Expense Summary", exact: true }).getByRole("button", { name: "Done", exact: true }).click();
  await salesNavigation(page).getByRole("link", { name: "Make a Sale", exact: true }).click();
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("color", "rgb(243, 246, 250)");
  await expectReadableContrast(page);
  if (desktop) await page.screenshot({ path: info.outputPath("08-make-sale-dark.png"), fullPage: true, scale: "css" });
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  if (page.url().includes("/admin/") && page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("link", { name: "Exit Demo", exact: true }).click();
  if (await page.getByRole("dialog", { name: "Leave this page?", exact: true }).isVisible()) await page.getByRole("link", { name: "Leave page", exact: true }).click();
  await expect(page).toHaveURL("/login");
  for (const [old, destination] of [
    ["/admin/demo", "/admin/dashboard"], ["/admin/demo/returns", "/pos/returns"],
    ["/admin/demo/expenses", "/pos/expenses"], ["/admin/demo/investment", "/admin/investment"],
  ]) {
    await page.goto(old); await expect(page).toHaveURL(destination);
    if (destination.startsWith("/pos/")) await safeSalesperson(page);
  }
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key !== "pos-theme"))).toEqual([]);
  expect(await page.evaluate(() => Object.entries(sessionStorage))).toEqual([]);
  expect(await page.context().cookies()).toEqual([]);
});
