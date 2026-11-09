import { expect, test, type Page } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";
const observed = new WeakMap<Page, string[]>();
const credit = "Developed by SalamTech";
test.use({ actionTimeout: 10_000 });
test.beforeEach(async ({ page, baseURL }) => {
  const issues: string[] = []; observed.set(page, issues); page.on("pageerror", (error) => issues.push(error.message));
  await page.route("**/*", (route) => {
    const request = route.request();
    if (new URL(request.url()).origin === baseURL && ["GET", "HEAD"].includes(request.method())) return route.continue();
    issues.push(request.method() + " " + request.url()); return route.abort();
  });
});
test.afterEach(({ page }) => expect(observed.get(page)).toEqual([]));
const search = (page: Page) => page.getByRole("combobox", { name: "Find Product", exact: true });
async function choose(page: Page, name: string) {
  await search(page).fill(name); await search(page).press("Enter");
  await expect(search(page)).toHaveValue(""); await expect(search(page)).toBeFocused();
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
for (const theme of ["light", "dark"] as const) test("fast product entry, editable draft and clean invoice in " + theme, async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.addInitScript((mode) => localStorage.setItem("pos-theme", mode), theme);
  await page.setViewportSize({ width: info.project.name === "chromium" ? 1440 : 375, height: 900 });
  await page.goto("/pos"); await expect(search(page)).toBeFocused();
  await search(page).fill("m"); await expect(page.getByRole("listbox", { name: "Mock products" }).getByRole("option")).toHaveCount(2);
  await search(page).press("Enter"); await expect(page.getByRole("listitem")).toHaveCount(0);
  await search(page).press("ArrowDown"); await search(page).press("ArrowUp"); await search(page).press("Escape");
  await search(page).press("Enter"); await expect(page.getByRole("listitem")).toHaveCount(0);
  await choose(page, "diapers"); await expect(page.getByLabel("Diapers quantity, item 1", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("Diapers price (PKR), item 1", { exact: true })).toHaveValue("1250.00");
  await page.getByLabel("Diapers price (PKR), item 1", { exact: true }).fill("1250.25");
  await choose(page, "diapers"); await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByLabel("Diapers quantity, item 1", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("Diapers price (PKR), item 1", { exact: true })).toHaveValue("1250.25");
  await search(page).press("Enter"); await expect(page.getByLabel("Diapers quantity, item 1", { exact: true })).toHaveValue("2");
  await choose(page, "milk"); await choose(page, "wipes");
  await expect(page.getByRole("listitem")).toHaveCount(3);
  await expect(page.getByTestId("sale-total")).toHaveText("Rs. 3,522.50");
  await page.getByLabel("Milk Powder quantity, item 2", { exact: true }).press("Enter");
  await page.getByLabel("Milk Powder price (PKR), item 2", { exact: true }).press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByRole("listitem")).toHaveCount(3);
  await choose(page, "rice"); await page.getByRole("button", { name: "Remove Rice", exact: true }).click(); await expect(search(page)).toBeFocused();
  for (const input of await page.getByLabel(/discount \(%\), item/).all()) await input.fill("10");
  await expect(page.getByTestId("sale-total")).toHaveText("Rs. 3,170.25");
  await page.getByText("Customer (Optional)", { exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Ali & Sons"); await page.getByLabel("Phone", { exact: true }).fill("0300-1234567");
  for (const width of [320, 375, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 720 }); await noOverflow(page); }
  await page.setViewportSize({ width: info.project.name === "chromium" ? 1440 : 375, height: 900 });
  await expectReadableContrast(page);
  if (info.project.name === "chromium" && theme === "light") {
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: info.outputPath("checkout-three-items.png"), fullPage: true, scale: "css" });
  }
  await page.getByRole("button", { name: "Create Invoice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Sample Invoice", exact: true }), paper = dialog.locator(".receipt-sheet");
  await expect(dialog.getByRole("heading", { name: "SALES INVOICE", exact: true })).toBeVisible();
  await expect(dialog.getByRole("table").getByRole("row")).toHaveCount(4);
  await expect(paper).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(paper).toContainText("Ali & Sons"); await expect(paper).toContainText("0300-1234567");
  await expect(paper).toContainText("Subtotal"); await expect(paper).toContainText("Item discounts");
  await expect(paper).toContainText(credit); await expect(paper).not.toContainText(/Cash Received|Change|Paid/);
  await expect(dialog.getByTestId("receipt-total")).toHaveText("Rs. 3,170.25");
  await expect(dialog.getByRole("button", { name: "Print", exact: true })).toHaveCount(1);
  const below = await dialog.evaluate((node) => {
    const content = node.querySelector(".receipt-sheet")!, actions = node.querySelector("[data-receipt-actions]")!;
    return Boolean(content.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING);
  }); expect(below).toBe(true);
  await expectReadableContrast(page);
  if (info.project.name === "chromium" && theme === "light") {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.screenshot({ path: info.outputPath("invoice-light.png"), fullPage: false, scale: "css" });
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await dialog.getByText("Edit Receipt Details", { exact: true }).click();
  await dialog.getByLabel("Receipt Shop Name", { exact: true }).fill("One receipt only");
  await dialog.getByLabel("Receipt Message (optional)", { exact: true }).fill("Thank you for visiting!");
  await expect(dialog.getByTestId("receipt-total")).toHaveText("Rs. 3,170.25");
  await expect(paper).toContainText("One receipt only"); await expect(paper).toContainText(credit);
  await dialog.getByLabel("Receipt Shop Name", { exact: true }).fill("");
  await expect(dialog.getByRole("button", { name: "Print", exact: true })).toBeDisabled();
  await dialog.getByLabel("Receipt Shop Name", { exact: true }).fill("One receipt only");
  await dialog.getByText("Payment Details (optional)", { exact: true }).click();
  const cash = dialog.getByLabel("Cash Received (PKR, optional)", { exact: true });
  await cash.fill("100"); await expect(dialog.getByText(/Cash received is less than/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Print", exact: true })).toBeDisabled();
  await expect(paper).not.toContainText("Change");
  await cash.fill("3500"); await expect(paper).toContainText("Rs. 329.75");
  await dialog.getByRole("button", { name: "Edit Sale", exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(search(page)).toBeFocused();
  await expect(page.getByLabel("Diapers price (PKR), item 1", { exact: true })).toHaveValue("1250.25");
  await expect(page.getByLabel("Diapers discount (%), item 1", { exact: true })).toHaveValue("10");
  await page.getByRole("button", { name: "Create Invoice", exact: true }).click();
  await expect(paper).toContainText("One receipt only"); await expect(paper).toContainText("PREVIEW-001");
  await expect(paper).toContainText("Rs. 329.75");
  await dialog.getByLabel("Print layout", { exact: true }).selectOption("compact");
  await page.evaluate(() => { let count = 0; window.print = () => document.documentElement.setAttribute("data-print-count", String(++count)); });
  await dialog.getByRole("button", { name: "Print", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-count", "1");
  await page.emulateMedia({ media: "print" });
  const printed = page.locator("#shop-pos-print-receipt");
  await expect(printed).toBeVisible(); await expect(printed).toContainText(credit); await expect(printed).toContainText("Rs. 3,170.25");
  await expect(printed.getByRole("button")).toHaveCount(0); await expect(printed.getByRole("textbox")).toHaveCount(0);
  await expect(dialog).toBeHidden(); await expect(page.getByRole("main")).toBeHidden();
  const printWidth = await printed.evaluate((node) => node.getBoundingClientRect().width); expect(printWidth).toBeLessThanOrEqual(303);
  if (info.project.name === "chromium" && theme === "dark") await printed.screenshot({ path: info.outputPath("invoice-80mm-print.png"), scale: "css" });
  await page.emulateMedia({ media: "screen" });
  await dialog.getByRole("button", { name: "Done", exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "Done", exact: true })).toBeInViewport();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(search(page)).toBeFocused(); await expect(page.getByRole("listitem")).toHaveCount(0);
  await expect(page.getByTestId("sale-total")).toHaveText("Rs. 0.00");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["pos-theme"]);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  expect(await page.content()).not.toMatch(/unitCostSnapshot|stockOnHand|grossProfitPaise|lowStockThreshold/);
});
test("all seven temporary prices, precision, typing/pasting and exact totals", async ({ page, context }) => {
  await page.goto("/pos");
  for (const [index, name, amount] of [[1, "Diapers", "1250.00"], [2, "Milk Powder", "800.00"], [3, "Baby Wipes", "222.00"], [4, "Hand Soap", "125.00"], [5, "Rice", "850.00"], [6, "Shampoo", "455.00"], [7, "Toothpaste", "180.00"]] as const) {
    await choose(page, name); await expect(page.getByLabel(name + " price (PKR), item " + index, { exact: true })).toHaveValue(amount);
  }
  await expect(page.getByTestId("sale-total")).toHaveText("Rs. 3,882.00");
  for (const name of ["Milk Powder", "Baby Wipes", "Hand Soap", "Rice", "Shampoo", "Toothpaste"]) await page.getByRole("button", { name: "Remove " + name, exact: true }).click();
  const quantity = page.getByLabel("Diapers quantity, item 1", { exact: true }), price = page.getByLabel("Diapers price (PKR), item 1", { exact: true });
  await quantity.fill("2"); await price.fill(""); await price.pressSequentially("100.999"); await price.press("Enter");
  await expect(price).toHaveValue("100.999"); await page.getByRole("button", { name: "Create Invoice" }).click(); await expect(price).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]); await page.evaluate(() => navigator.clipboard.writeText("0.001"));
  await price.fill(""); await price.press("Control+V"); await expect(price).toHaveValue("0.001");
  await page.getByRole("button", { name: "Create Invoice" }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const [value, total] of [["100", "Rs. 200.00"], ["100.5", "Rs. 201.00"], ["100.50", "Rs. 201.00"], ["100.99", "Rs. 201.98"], ["1250.25", "Rs. 2,500.50"]]) {
    await price.fill(value); await expect(page.getByTestId("sale-total")).toHaveText(total);
  }
  await quantity.fill("-1"); await page.getByRole("button", { name: "Create Invoice" }).click(); await expect(quantity).toBeFocused();
  await quantity.fill("0.125"); await price.fill("0.10"); await expect(page.getByTestId("sale-total")).toHaveText("Rs. 0.0125");
  await page.getByLabel("Diapers discount (%), item 1").fill("10"); await page.getByRole("button", { name: "Create Invoice" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("never rounds");
  await page.getByLabel("Diapers discount (%), item 1").fill(""); await page.getByRole("button", { name: "Create Invoice" }).click();
  const dialog = page.getByRole("dialog", { name: "Sample Invoice" }); await expect(dialog.getByTestId("receipt-total")).toHaveText("Rs. 0.0125");
  await expect(dialog.locator(".receipt-sheet")).not.toContainText(/Customer|Cash Received|Change|Discount/);
  await dialog.press("Escape"); await expect(search(page)).toBeFocused(); await expect(quantity).toHaveValue("0.125");
});
test("long receipt details reflow, System theme, reload and no-JavaScript safety", async ({ page, browser, baseURL }) => {
  await page.goto("/pos"); await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" }); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await choose(page, "diapers"); await page.getByRole("button", { name: "Create Invoice" }).click();
  const dialog = page.getByRole("dialog", { name: "Sample Invoice" });
  await dialog.getByText("Edit Receipt Details", { exact: true }).click();
  await dialog.getByLabel("Receipt Shop Name", { exact: true }).fill("S".repeat(80));
  await dialog.getByLabel("Receipt Shop Address (optional)", { exact: true }).fill("A".repeat(240));
  await dialog.getByLabel("Customer Name (optional)", { exact: true }).fill("C".repeat(120));
  for (const width of [320, 375, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 600 }); await noOverflow(page); }
  await dialog.getByLabel("Print layout", { exact: true }).selectOption("compact");
  await page.emulateMedia({ media: "print" });
  expect(await page.locator("#shop-pos-print-receipt").evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await expect(page.locator("#shop-pos-print-receipt")).toContainText(credit);
  await page.emulateMedia({ media: "screen" }); await page.reload();
  await expect(page.getByRole("listitem")).toHaveCount(0); await expect(search(page)).toBeFocused();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const noJS = await context.newPage(); await noJS.goto(baseURL + "/pos");
  await expect(noJS.getByRole("button", { name: "Create Invoice", exact: true })).toBeDisabled();
  await expect(noJS.getByRole("combobox", { name: "Find Product", exact: true })).toBeDisabled(); await context.close();
});
test("historical receipt keeps its original amount with read-only presentation credit", async ({ page }) => {
  await page.goto("/pos/history"); await expect(page.getByRole("rowheader")).toHaveCount(8);
  const trigger = page.getByRole("button", { name: "View Receipt for demo-sale-2", exact: true }); await trigger.click();
  const receipt = page.getByRole("dialog", { name: "Sample Receipt", exact: true });
  await expect(receipt.getByTestId("historical-receipt-total")).toHaveText("Rs. 4,999.00");
  await expect(receipt).toContainText("1,249.75"); await expect(receipt).toContainText("Not recorded"); await expect(receipt).toContainText(credit);
  await expect(receipt.getByRole("button", { name: "Edit Sale" })).toHaveCount(0);
  await receipt.getByRole("button", { name: "Done", exact: true }).click(); await expect(trigger).toBeFocused();
});
