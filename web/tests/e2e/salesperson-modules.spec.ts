import { expect, test, type Page } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";
test.use({ actionTimeout: 10_000 });
const faults = new WeakMap<Page, string[]>(), credit = "Developed by SalamTech";
test.beforeEach(async ({ page, baseURL }) => {
  const found: string[] = []; faults.set(page, found); page.on("pageerror", (error) => found.push(error.message));
  await page.route("**/*", (route) => {
    const request = route.request(); if (new URL(request.url()).origin === baseURL && ["GET", "HEAD"].includes(request.method())) return route.continue();
    found.push(request.method() + " " + request.url()); return route.abort();
  });
});
test.afterEach(({ page }) => expect(faults.get(page)).toEqual([]));
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
for (const theme of ["light", "dark"] as const) test("simple original invoice history and shared read-only receipt in " + theme, async ({ page }, info) => {
  await page.addInitScript((mode) => localStorage.setItem("pos-theme", mode), theme);
  await page.setViewportSize({ width: info.project.name === "chromium" ? 1440 : 375, height: 900 });
  await page.goto("/pos/history");
  await expect(page.getByRole("heading", { name: "Sales History", exact: true })).toBeVisible();
  await expect(page.getByText("Sample Invoices — 2 November 2026", { exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader")).toHaveText(["Invoice", "Date / Time", "Customer", "Total", "Action"]);
  await expect(page.getByRole("rowheader")).toHaveCount(8);
  await expect(page.getByRole("link", { name: "Back to Make a Sale" })).toHaveAttribute("href", "/pos");
  await expect(page.getByLabel("Product name", { exact: true })).toBeHidden();
  const search = page.getByRole("searchbox", { name: "Find invoice...", exact: true });
  await search.fill("DEMO-SALE-2"); await expect(page.getByRole("rowheader")).toHaveText("demo-sale-2");
  await page.getByText("Filters", { exact: true }).click(); await page.getByLabel("Product name", { exact: true }).fill("milk");
  await expect(page.getByText("No original demo sales match these filters.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click(); await expect(search).toBeFocused(); await expect(page.getByRole("rowheader")).toHaveCount(8);
  await page.getByLabel("Business date (optional)", { exact: true }).fill("2026-11-03");
  await expect(page.getByRole("table")).toHaveCount(0); await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByText("Filters", { exact: true }).click();
  await expectReadableContrast(page);
  for (const width of [320, 375, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 720 }); await noOverflow(page); }
  await page.setViewportSize({ width: info.project.name === "chromium" ? 1440 : 375, height: 900 });
  if (info.project.name === "chromium" && theme === "light") {
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: info.outputPath("sales-history-light.png"), fullPage: true, scale: "css" });
  }
  const view = page.getByRole("button", { name: "View Receipt for demo-sale-2", exact: true }); await view.focus(); await view.press("Enter");
  const receipt = page.getByRole("dialog", { name: "Sample Receipt", exact: true }), paper = receipt.locator(".receipt-sheet");
  await expect(paper).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(paper.getByRole("heading", { name: "SALES INVOICE", exact: true })).toBeVisible();
  await expect(paper).toContainText("demo-sale-2"); await expect(paper).toContainText("1,249.75"); await expect(paper).toContainText("Not recorded");
  await expect(paper.getByTestId("historical-receipt-total")).toHaveText("Rs. 4,999.00");
  await expect(paper).toContainText(credit); await expect(receipt.getByRole("button", { name: "Edit Sale" })).toHaveCount(0);
  await expect(receipt.getByRole("textbox")).toHaveCount(0);
  await paper.getByRole("rowheader", { name: "Diapers", exact: true }).hover();
  await expectReadableContrast(page);
  if (info.project.name === "chromium" && theme === "light") {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: info.outputPath("history-receipt-light.png"), fullPage: false, scale: "css" });
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await page.evaluate(() => { let count = 0; window.print = () => document.documentElement.setAttribute("data-print-count", String(++count)); });
  await receipt.getByRole("button", { name: "Print", exact: true }).click(); await expect(page.locator("html")).toHaveAttribute("data-print-count", "1");
  await receipt.getByLabel("Print layout", { exact: true }).selectOption("compact"); await page.emulateMedia({ media: "print" });
  const print = page.locator("#shop-pos-print-receipt"); await expect(print).toBeVisible();
  await expect(print).toContainText("Rs. 4,999.00"); await expect(print).toContainText(credit);
  await expect(print.getByRole("button")).toHaveCount(0); await expect(receipt).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await receipt.getByRole("button", { name: "Done", exact: true }).click(); await expect(view).toBeFocused();
  await expect(page.getByRole("rowheader")).toHaveCount(8);
  expect(await page.content()).not.toMatch(/unitCostSnapshot|grossProfitPaise|lowStockThreshold|stockOnHand/);
});
test("condition-free returns preserve quantity and pending-inspection safeguards", async ({ page }) => {
  await page.goto("/pos/returns"); await expect(page.getByLabel("Item Condition (optional)")).toHaveCount(0);
  await page.getByLabel("Find Original Sale", { exact: true }).fill("demo-sale-1"); await page.getByRole("button", { name: "Select demo-sale-1 — Diapers", exact: true }).click();
  const quantity = page.getByRole("textbox", { name: /^Return Quantity/ }), button = page.getByRole("button", { name: "Review Refund", exact: true });
  await quantity.fill("3"); await button.click(); await expect(quantity).toBeFocused(); await expect(page.getByRole("main").getByRole("alert")).toContainText("cannot exceed");
  await quantity.fill("2"); await button.click(); const review = page.getByRole("dialog", { name: "Refund Review — Demo Only", exact: true });
  await expect(review).toContainText("Refund amount unavailable"); await expect(review).toContainText("pending inspection");
  await review.getByRole("button", { name: "Done", exact: true }).click(); await expect(button).toBeFocused();
  await page.getByRole("button", { name: "Reset", exact: true }).click(); await expect(quantity).toHaveCount(0);
});
for (const theme of ["light", "dark"] as const) test("centered expense form and temporary daily/monthly summary in " + theme, async ({ page }, info) => {
  await page.addInitScript((mode) => localStorage.setItem("pos-theme", mode), theme);
  const desktop = info.project.name === "chromium";
  await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 }); await page.goto("/pos/expenses");
  const amount = page.getByLabel("Amount (Rs.)", { exact: true }), reason = page.getByLabel("Reason", { exact: true });
  await expect(amount).toBeVisible();
  const expectedDate = await page.evaluate(() => { const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const part = (name: string) => parts.find((p) => p.type === name)!.value; return part("year") + "-" + part("month") + "-" + part("day"); });
  await expect(page.locator("form time")).toHaveAttribute("datetime", expectedDate);
  await expect(page.getByLabel("Expense Type", { exact: true })).toHaveCount(0);
  await reason.fill("Cleaning");
  await expect(page.getByRole("table")).toHaveCount(0); await expect(page.getByText("Daily Expenses", { exact: true })).toHaveCount(0);
  const summaryButton = page.getByRole("button", { name: "View Expense Summary", exact: true });
  if (desktop) {
    const [heading, button, form, main] = await Promise.all([page.getByRole("heading", { level: 1 }).boundingBox(), summaryButton.boundingBox(), page.getByRole("form", { name: "Demo expense entry" }).boundingBox(), page.getByRole("main").boundingBox()]);
    expect(button!.x).toBeGreaterThan(heading!.x + heading!.width); expect(Math.abs(button!.y - heading!.y)).toBeLessThanOrEqual(8);
    expect(form!.width).toBeLessThan(800); expect(Math.abs(form!.x + form!.width / 2 - main!.x - main!.width / 2)).toBeLessThan(2);
  }
  await expectReadableContrast(page);
  if (desktop && theme === "light") { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: info.outputPath("shop-expenses-light.png"), fullPage: true, scale: "css" }); }
  await summaryButton.click();
  const summary = page.getByRole("dialog", { name: "Expense Summary", exact: true });
  await expect(summary.getByText("No expenses recorded for this date.", { exact: true })).toBeVisible();
  await summary.getByRole("button", { name: "Done", exact: true }).click(); await expect(summaryButton).toBeFocused();
  await amount.fill("0"); await page.getByRole("button", { name: "Add Expense", exact: true }).click(); await expect(amount).toBeFocused();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("positive PKR amount");
  await page.clock.install({ time: new Date("2026-11-08T07:00:00Z") }); await amount.fill("100.10"); await page.getByRole("button", { name: "Add Expense", exact: true }).dblclick();
  await expect(page.getByRole("status").filter({ hasText: "Expense added to demo." })).toBeVisible(); await expect(amount).toHaveValue("");
  await page.clock.setFixedTime(new Date("2026-11-09T07:00:00Z")); await reason.fill("Transport"); await amount.fill("0.20"); await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  await expect(page.getByRole("table")).toHaveCount(0); await summaryButton.click();
  await expect(summary.getByText("Monthly Expenses", { exact: true }).locator("..")).toContainText("Rs. 100.30");
  await summary.getByLabel("Selected Date", { exact: true }).fill("2026-11-08");
  await expect(summary.getByText("Daily Expenses", { exact: true }).locator("..")).toContainText("Rs. 100.10");
  await expect(summary.getByRole("row")).toHaveCount(2);
  await summary.getByRole("button", { name: "Correct expense: Cleaning", exact: true }).click(); await expect(amount).toBeFocused();
  await amount.fill("200.20"); await page.getByRole("button", { name: "Update Expense", exact: true }).click(); await summaryButton.click();
  await expect(summary.getByText("Monthly Expenses", { exact: true }).locator("..")).toContainText("Rs. 200.40");
  await summary.getByLabel("Selected Date", { exact: true }).fill("2026-11-09");
  await summary.getByRole("button", { name: "Remove expense: Transport", exact: true }).click();
  await expect(summary.getByText("No expenses recorded for this date.", { exact: true })).toBeVisible();
  await expect(summary.getByText("Monthly Expenses", { exact: true }).locator("..")).toContainText("Rs. 200.20");
  await summary.getByRole("button", { name: "Reset Demo Expenses", exact: true }).click();
  await expect(summary.getByRole("table")).toHaveCount(0); await summary.getByRole("button", { name: "Done", exact: true }).click();
  for (const width of [320, 375, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 720 }); await noOverflow(page); }
  await page.reload(); await expect(amount).toHaveValue(""); await summaryButton.click();
  await expect(summary.getByText("No expenses recorded for this date.", { exact: true })).toBeVisible(); await expectReadableContrast(page);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["pos-theme"]);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  expect(await page.content()).not.toMatch(/unitCostSnapshot|grossProfitPaise|lowStockThreshold|stockOnHand/);
});
