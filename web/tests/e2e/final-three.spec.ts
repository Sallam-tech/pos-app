import { expect, test, type Page } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";
const faults = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, baseURL }) => {
  const found: string[] = []; faults.set(page, found); page.on("pageerror", (error) => found.push(error.message));
  await page.route("**/*", (route) => { const r = route.request(); if (new URL(r.url()).origin === baseURL && ["GET", "HEAD"].includes(r.method())) return route.continue(); found.push(r.method() + " " + r.url()); return route.abort(); });
});
test.afterEach(({ page }) => expect(faults.get(page)).toEqual([]));
async function reflow(page: Page) { for (const width of [320, 375, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 768 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); } }
for (const theme of ["light", "dark"] as const) {
  test("independent line discounts, keyboard entry and exact receipts in " + theme, async ({ page }, info) => {
    await page.addInitScript((value) => localStorage.setItem("pos-theme", value), theme); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/pos");
    const search = page.getByRole("combobox", { name: "Find Product", exact: true });
    async function add(name: string) { await search.fill(name); await search.press("Enter"); await expect(search).toBeFocused(); await expect(search).toHaveValue(""); }
    await add("Diapers"); await add("Milk Powder");
    const discount = page.getByLabel("Diapers discount (%), item 1", { exact: true }), milk = page.getByLabel("Milk Powder discount (%), item 2", { exact: true });
    await expect(discount).toHaveValue("0"); await expect(milk).toHaveValue("0"); await expect(page.getByLabel("Discount (%, optional)", { exact: true })).toHaveCount(0);
    await discount.fill("10"); await milk.fill("5"); await expect(page.getByTestId("sale-total")).toHaveText("Rs. 1,885.00");
    const price = page.getByLabel("Diapers price (PKR), item 1", { exact: true }), quantity = page.getByLabel("Diapers quantity, item 1", { exact: true });
    await price.fill("1200"); await expect(page.getByLabel("Diapers line total, item 1", { exact: true })).toHaveText("Rs. 1,080.00"); await add("Diapers");
    await expect(quantity).toHaveValue("2"); await expect(price).toHaveValue("1200"); await expect(discount).toHaveValue("10"); await expect(page.getByTestId("sale-total")).toHaveText("Rs. 2,920.00");
    await page.getByRole("button", { name: "Decrease Diapers quantity, item 1", exact: true }).click(); await expect(discount).toHaveValue("10"); await page.getByRole("button", { name: "Increase Diapers quantity, item 1", exact: true }).click();
    for (const value of ["-1", "100.01", "NaN", "10.001"]) { await discount.fill(value); await page.getByRole("button", { name: "Create Invoice", exact: true }).click(); await expect(discount).toBeFocused(); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(milk).toHaveValue("5"); }
    await discount.fill("10"); await price.fill("100.999"); await page.getByRole("button", { name: "Create Invoice", exact: true }).click(); await expect(price).toBeFocused(); await expect(page.getByText("Enter a price with no more than 2 decimal places.", { exact: true })).toBeVisible();
    await price.fill("1250"); await quantity.fill("1"); await discount.press("Enter"); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByTestId("sale-total")).toHaveText("Rs. 1,885.00");
    await reflow(page); await page.setViewportSize({ width: 1440, height: 1000 }); await expectReadableContrast(page); await page.screenshot({ path: info.outputPath("checkout-" + theme + ".png"), fullPage: true, scale: "css" });
    await page.getByRole("button", { name: "Create Invoice", exact: true }).focus(); await page.keyboard.press("Enter");
    const receipt = page.getByRole("dialog", { name: "Sample Invoice", exact: true }), paper = receipt.locator(".receipt-sheet");
    await expect(paper).toContainText("Discount 10%"); await expect(paper).toContainText("Discount 5%"); await expect(paper).toContainText("1,125.00"); await expect(paper).toContainText("760.00"); await expect(receipt.getByTestId("receipt-total")).toHaveText("Rs. 1,885.00"); await expect(paper).not.toContainText("Discount (10%)");
    await receipt.getByText("Payment Details (optional)", { exact: true }).click(); await receipt.getByLabel("Cash Received (PKR, optional)", { exact: true }).fill("2000"); await expect(paper).toContainText("Rs. 115.00");
    await page.evaluate(() => { window.print = () => document.documentElement.setAttribute("data-printed", "true"); }); await receipt.getByRole("button", { name: "Print", exact: true }).click(); await expect(page.locator("html")).toHaveAttribute("data-printed", "true");
    for (const layout of ["ordinary", "compact"]) {
      await receipt.getByLabel("Print layout", { exact: true }).selectOption(layout); await page.emulateMedia({ media: "print" }); const printed = page.locator("#shop-pos-print-receipt");
      await expect(printed).toBeVisible(); await expect(printed).toContainText("Rs. 1,885.00"); await expect(printed).toContainText("Rs. 115.00"); await expect(printed.locator("[data-developer-credit] p")).toHaveText(["Developed by SalamTech", "AbdulSalam · +92-310-3698984"]);
      expect(await printed.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true); await expect(printed.getByRole("button")).toHaveCount(0); await page.emulateMedia({ media: "screen" });
    }
    await receipt.getByRole("button", { name: "Edit Sale", exact: true }).click(); await expect(discount).toHaveValue("10"); await expect(milk).toHaveValue("5"); await expect(price).toHaveValue("1250"); await expect(quantity).toHaveValue("1");
    await page.getByRole("banner").getByRole("link", { name: "Back to Login", exact: true }).click(); const guard = page.getByRole("dialog", { name: "Leave this page?", exact: true }); await guard.getByRole("button", { name: "Keep editing", exact: true }).click(); await expect(discount).toHaveValue("10");
    await page.getByRole("button", { name: "Create Invoice", exact: true }).click(); await expect(receipt.getByTestId("receipt-total")).toHaveText("Rs. 1,885.00"); await receipt.getByRole("button", { name: "Done", exact: true }).click(); await expect(search).toBeFocused(); await expect(page.getByRole("listitem")).toHaveCount(0);
  });
  test("compact invoice cash-refund review without condition in " + theme, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("pos-theme", value), theme); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/pos/returns");
    await expect(page.getByRole("heading", { level: 1, name: "Return & Refund", exact: true })).toBeVisible();
    const search = page.getByRole("searchbox", { name: "Find Original Sale", exact: true }); await search.fill("Diapers"); await expect(page.getByRole("button", { name: /^Select/ })).toHaveCount(2);
    const select = page.getByRole("button", { name: "Select demo-sale-2 — Diapers", exact: true }); await select.focus(); await select.press("Enter");
    const selected = page.getByRole("region", { name: "Selected original invoice", exact: true }); await expect(selected).toContainText("demo-sale-2"); await expect(selected).toContainText("Not recorded");
    const quantity = page.getByRole("textbox", { name: /^Return Quantity/ }), review = page.getByRole("button", { name: "Review Refund", exact: true });
    await expect(quantity).toHaveValue("0"); await page.getByRole("checkbox", { name: "Select Diapers, item 1", exact: true }).check();
    await page.getByRole("button", { name: "Increase Diapers, item 1 return quantity", exact: true }).click(); await expect(quantity).toHaveValue("2");
    await page.getByRole("button", { name: "Decrease Diapers, item 1 return quantity", exact: true }).click(); await expect(quantity).toHaveValue("1");
    for (const invalid of ["0", "-1", "NaN", "5"]) { await quantity.fill(invalid); await review.click(); await expect(quantity).toBeFocused(); await expect(page.getByRole("main").getByRole("alert")).toBeVisible(); }
    await quantity.fill("1"); await expect(page.getByLabel("Item Condition (optional)", { exact: true })).toHaveCount(0);
    await reflow(page); await page.setViewportSize({ width: 1440, height: 1000 }); await expectReadableContrast(page);
    await review.click(); const dialog = page.getByRole("dialog", { name: "Refund Review — Demo Only", exact: true });
    await expect(dialog).toContainText("Refund amount unavailable"); await expect(dialog).toContainText("demo-sale-2"); await expect(dialog).toContainText("pending inspection");
    await expect(dialog.getByRole("button", { name: /pay|confirm|save refund/i })).toHaveCount(0); await dialog.getByRole("button", { name: "Done", exact: true }).click(); await expect(review).toBeFocused();
    await page.getByRole("button", { name: "Reset", exact: true }).click(); await expect(search).toBeFocused(); await expect(search).toHaveValue("");
    await search.fill("DEMO-SALE-8"); await expect(page.getByRole("button", { name: /^Select/ })).toHaveCount(1); await search.fill("not-an-invoice"); await expect(page.getByText("No original sales match this search.", { exact: true })).toBeVisible();
    expect(await page.content()).not.toMatch(/unitCostSnapshot|grossProfitPaise|stockOnHand|lowStockThreshold/); expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["pos-theme"]);
  });
}
