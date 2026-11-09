import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expectReadableContrast } from "./support/contrast";

test.use({ actionTimeout: 10_000 });
const reviewDir = resolve("test-results/final-frontend/review");
test.beforeAll(() => mkdirSync(reviewDir, { recursive: true }));
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, baseURL }) => {
  const found: string[] = []; errors.set(page, found); page.on("pageerror", (error) => found.push(error.message));
  await page.route("**/*", (route) => {
    const request = route.request();
    if (new URL(request.url()).origin === baseURL && ["GET", "HEAD"].includes(request.method())) return route.continue();
    found.push(request.method() + " " + request.url()); return route.abort();
  });
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));
async function reflow(page: Page) {
  const previous = page.viewportSize()!;
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize(previous);
}
for (const theme of ["light", "dark"] as const) {
  test("stock value, simple expenses, honest cash and backup views in " + theme, async ({ page }, info) => {
    test.setTimeout(60_000);
    const desktop = info.project.name === "chromium";
    await page.setViewportSize({ width: desktop ? 1440 : 375, height: 1000 });
    await page.addInitScript((mode) => localStorage.setItem("pos-theme", mode), theme);
    await page.goto("/admin/investment");
    await expect(page.getByRole("heading", { level: 1, name: "Stock Value", exact: true })).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText("Total Investment");
    await expect(page.getByRole("group", { name: "Total Stock Value", exact: true })).toContainText("Not available — buying costs not recorded");
    await expect(page.getByRole("table")).toHaveCount(0);
    if (desktop && theme === "light") await page.screenshot({ path: resolve(reviewDir, "stock-value.png"), fullPage: true });
    const details = page.getByText("View Product Details", { exact: true }); await details.focus(); await details.press("Enter");
    await expect(page.getByRole("rowheader")).toHaveCount(7);
    await expectReadableContrast(page); await reflow(page);
    await page.goto("/admin/dashboard");
    await expect(page.getByRole("group", { name: "Stock Value", exact: true })).toContainText("Not available");
    await expect(page.getByRole("group", { name: "Total Investment", exact: true })).toHaveCount(0);
    for (const text of ["Rs. 25,690.00", "Rs. 5,140.00", "123"]) await expect(page.getByText(text, { exact: true })).toBeVisible();

    await page.goto("/pos/expenses");
    await expect(page.getByRole("heading", { level: 1, name: "Shop Expenses" })).toBeVisible();
    await expect(page.getByLabel("Expense Type", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Expense Date", { exact: true })).toHaveCount(0);
    const amount = page.getByLabel("Amount (Rs.)", { exact: true }), reason = page.getByLabel("Reason", { exact: true });
    await amount.fill("100.10"); await page.getByRole("button", { name: "Add Expense", exact: true }).click();
    await expect(reason).toBeFocused(); await reason.fill("Counter cleaning");
    await expectReadableContrast(page);
    await page.getByRole("button", { name: "Add Expense", exact: true }).dblclick();
    await expect(amount).toHaveValue(""); await expect(reason).toHaveValue("");
    if (desktop && theme === "light") await page.screenshot({ path: resolve(reviewDir, "shop-expenses.png"), fullPage: true });
    await page.getByRole("button", { name: "View Expense Summary", exact: true }).click();
    const summary = page.getByRole("dialog", { name: "Expense Summary", exact: true });
    await expect(summary.getByRole("row")).toHaveCount(2);
    await expect(summary).toContainText("Counter cleaning"); await expect(summary).toContainText("Rs. 100.10");
    await expect(summary).toContainText("Nothing is saved or synchronized with Admin.");
    await summary.getByRole("button", { name: "Done", exact: true }).click();
    await reflow(page); await page.reload(); await page.getByRole("button", { name: "View Expense Summary", exact: true }).click();
    await expect(summary.getByText("No expenses recorded for this date.", { exact: true })).toBeVisible();

    await page.goto("/admin/daily-closing");
    const cards = page.getByRole("region", { name: "Daily closing summary", exact: true });
    await expect(cards.getByRole("group")).toHaveCount(6);
    await expect(cards.getByRole("group", { name: "Gross Profit", exact: true })).toContainText("Rs. 5,140.00");
    const cash = page.getByRole("region", { name: "Counter Cash Summary", exact: true });
    await cash.getByLabel("Actual Cash Counted (Rs.)", { exact: true }).fill("5700");
    await expect(cash.getByLabel("Cash Difference", { exact: true })).toHaveText("Not available");
    await expect(cash).not.toContainText(/Short by|Extra Rs/);
    await expect(page.getByRole("button", { name: "Confirm Closing — setup required", exact: true })).toBeDisabled();
    await expectReadableContrast(page); await reflow(page);
    if (desktop && theme === "dark") await page.screenshot({ path: resolve(reviewDir, "daily-closing.png"), fullPage: true });
    await page.getByLabel("Business Date (Asia/Karachi)", { exact: true }).fill("2026-11-03");
    await expect(cash.getByLabel("Actual Cash Counted (Rs.)", { exact: true })).toHaveValue("");

    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Backup & Restore", exact: true })).toBeVisible();
    await expect(page.getByText("Supabase — Not connected", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Backup Now", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Restore Backup", exact: true })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Passwords", exact: true })).toBeVisible();
    await expectReadableContrast(page); await reflow(page);
    if (desktop && theme === "light") await page.screenshot({ path: resolve(reviewDir, "backup-restore.png"), fullPage: true });
    expect(await page.content()).not.toMatch(/service_role|SUPABASE_SERVICE|DATABASE_URL|BEGIN PRIVATE KEY/);
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["pos-theme"]);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  });

  test("isolated five-item invoice supports partial and full remaining refunds in " + theme, async ({ page }, info) => {
    await page.setViewportSize({ width: info.project.name === "chromium" ? 1440 : 375, height: 1000 });
    await page.setContent('<!doctype html><html><head></head><body><div id="fixture-root"></div></body></html>');
    await page.evaluate((mode) => { document.documentElement.dataset.theme = mode; document.documentElement.classList.toggle("dark", mode === "dark"); }, theme);
    for (const name of readdirSync(resolve(".next/static/chunks")).filter((name) => name.endsWith(".css"))) {
      await page.addStyleTag({ path: resolve(".next/static/chunks", name) });
    }
    await page.addScriptTag({ path: resolve("test-results/final-frontend/fixture-bundle/refund-fixture.js") });
    await expect(page.locator("body")).toHaveCSS("background-color", theme === "dark" ? "rgb(20, 28, 38)" : "rgb(241, 245, 243)");
    const search = page.getByLabel("Find Original Sale", { exact: true }); await search.fill("Diapers");
    await page.getByRole("button", { name: /^Select TEST-INVOICE/ }).click();
    await expect(page.getByRole("checkbox")).toHaveCount(5);
    await page.getByRole("checkbox", { name: "Select Diapers, item 1", exact: true }).check();
    await expect(page.getByLabel("Total Cash Refund", { exact: true })).toHaveText("Rs. 1,125.00");
    await page.getByRole("button", { name: "Review Refund", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Refund Review — Demo Only", exact: true });
    await expect(dialog.getByRole("listitem")).toHaveCount(1);
    await expect(dialog).not.toContainText("Milk Powder");
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "Select All Remaining Items", exact: true }).click();
    await expect(page.getByLabel("Return Quantity — Hand Soap, item 3", { exact: true })).toHaveValue("2");
    await expect(page.getByLabel("Return Quantity — Rice, item 5", { exact: true })).toHaveValue("3");
    await expect(page.getByLabel("Total Cash Refund", { exact: true })).toHaveText("Rs. 4,060.00");
    await expect(page.getByLabel("Item Condition (optional)", { exact: true })).toHaveCount(0);
    await expectReadableContrast(page); await reflow(page);
    if (info.project.name === "chromium" && theme === "dark") await page.screenshot({ path: resolve(reviewDir, "return-refund-isolated.png"), fullPage: true });
    await page.getByRole("button", { name: "Review Refund", exact: true }).click();
    await expect(dialog.getByRole("listitem")).toHaveCount(5); await expect(dialog).toContainText("pending inspection");
    await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: "Review Refund", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Clear Selection", exact: true }).click();
    await expect(page.getByLabel("Total Cash Refund", { exact: true })).toHaveText("Rs. 0.00");
    await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
  });
}
