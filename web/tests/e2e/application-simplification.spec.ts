import { expect, test, type Page } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

const screens = [
  ["login", "/login", "Shop POS"], ["checkout", "/pos", "Make a Sale"],
  ["history", "/pos/history", "Sales History"], ["returns", "/pos/returns", "Return Item"],
  ["expenses", "/pos/expenses", "Shop Expenses"], ["dashboard", "/admin/dashboard", "Dashboard"],
  ["products", "/admin/products", "Products"], ["add-product", "/admin/products/new", "Add Product"],
  ["edit-product", "/admin/products/diapers/edit", "Edit Product"],
  ["available-stock", "/admin/inventory/available-stock", "Inventory"],
  ["low-stock", "/admin/inventory/low-stock", "Low Stock Products"],
  ["sales-report", "/admin/sales/today", "Sales Report"], ["profit-report", "/admin/profit/today", "Profit Report"],
  ["admin-expenses", "/admin/expenses", "Shop Expenses"],
  ["reports", "/admin/reports", "Reports"], ["sales-charts", "/admin/reports/sales", "Sales Report"],
  ["profit-charts", "/admin/reports/profit", "Profit Report"], ["investment", "/admin/investment", "Investment & Stock Value"],
] as const;
test.use({ actionTimeout: 10_000 });
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const theme of ["light", "dark"] as const) {
  test("all implemented screens in " + theme, async ({ page, baseURL }, info) => {
    test.skip(info.project.name !== "chromium", "Desktop route review; mobile workflow covered separately");
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript((value) => localStorage.setItem("pos-theme", value), theme);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const r = route.request();
      if (new URL(r.url()).origin !== baseURL || !["GET", "HEAD"].includes(r.method())) { errors.push(r.method() + " " + r.url()); return route.abort(); }
      return route.continue();
    });
    for (const [name, url, title] of screens) {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: title, level: 1, exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await noOverflow(page);
      await expectReadableContrast(page);
      if (url.startsWith("/pos")) {
        expect(await page.content()).not.toMatch(/unitCostSnapshotPaise|costOfGoodsSoldPaise|grossProfitPaise|lowStockThreshold/);
      }
      await page.screenshot({ path: info.outputPath(name + ".png"), fullPage: true, scale: "css" });
    }
    // Every edit route shares the reviewed form. Verify each stable fixture ID and the missing-product page.
    for (const id of ["milk-powder", "baby-wipes", "hand-soap", "rice", "shampoo", "toothpaste"]) {
      const response = await page.goto("/admin/products/" + id + "/edit");
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: "Edit Product", exact: true })).toBeVisible();
    }
    await page.goto("/admin/products/missing-product/edit");
    await expect(page.getByRole("heading", { name: "Product not found", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("product-not-found.png"), fullPage: true });
    for (const [oldUrl, destination] of [["/", "/login"], ["/admin/demo", "/admin/dashboard"], ["/admin/demo/returns", "/pos/returns"], ["/admin/demo/expenses", "/pos/expenses"], ["/admin/demo/investment", "/admin/investment"]]) {
      await page.goto(oldUrl); await expect(page).toHaveURL(destination);
    }
    expect((await page.request.get("/api/health")).ok()).toBe(true);
    expect(errors).toEqual([]);
  });

  test("ordinary shop workflows and keyboard access in " + theme, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.addInitScript((value) => localStorage.setItem("pos-theme", value), theme);
    if (info.project.name === "chromium") await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/pos");
    const product = page.getByRole("combobox", { name: "Find Product", exact: true });
    await product.fill("dia"); await product.press("ArrowDown"); await product.press("ArrowUp"); await product.press("Enter");
    await expect(product).toHaveValue("");
    await expect(page.getByRole("heading", { name: "Sale simulation complete" })).toHaveCount(0);
    // Choosing a product adds it and returns focus to search.
    await expect(product).toBeFocused();
    await expect(product).toHaveCSS("outline-width", "3px");
    await page.getByLabel("Diapers quantity, item 1", { exact: true }).fill("2");
    const price = page.getByLabel("Diapers price (PKR), item 1", { exact: true });
    await price.fill("100.999");
    await page.getByRole("button", { name: "Create Invoice", exact: true }).click();
    await expect(price).toBeFocused();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Enter a price with no more than 2 decimal places.");
    await price.fill("1250.25"); await expect(page.getByTestId("sale-total")).toHaveText("Rs. 2,500.50");
    await page.getByLabel("Discount (%, optional)", { exact: true }).fill("10");
    await expect(page.getByTestId("sale-total")).toHaveText("Rs. 2,250.45");
    await page.getByRole("button", { name: "Create Invoice", exact: true }).click();
    let receipt = page.getByRole("dialog", { name: "Sample Invoice", exact: true });
    await expect(receipt).toBeVisible();
    await expect(receipt.getByRole("table")).toContainText("Diapers");
    await expect(receipt.getByTestId("receipt-total")).toHaveText("Rs. 2,250.45");
    await expectReadableContrast(page); await noOverflow(page);
    if (info.project.name === "chromium") {
      await page.screenshot({ path: info.outputPath("invoice-" + theme + ".png"), fullPage: false });
      await receipt.locator(".receipt-sheet").screenshot({ path: info.outputPath("invoice-paper-" + theme + ".png") });
    }
    let printed = 0;
    await page.exposeFunction("notifyPrint", () => printed++);
    await page.evaluate(() => { window.print = () => { void (window as unknown as { notifyPrint: () => Promise<void> }).notifyPrint(); }; });
    await receipt.getByRole("button", { name: "Print", exact: true }).click();
    await expect.poll(() => printed).toBe(1);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("#shop-pos-print-receipt")).toBeVisible();
    await page.emulateMedia({ media: "screen" });
    await receipt.getByRole("button", { name: "Done", exact: true }).click();
    await expect(product).toBeFocused();
    await page.goto("/pos/history");
    await expect(page.getByRole("rowheader")).toHaveCount(8);
    await page.getByText("Filters", { exact: true }).click();
    await page.getByLabel("Product name", { exact: true }).fill("diap");
    await expect(page.getByRole("rowheader")).toHaveCount(2);
    await page.getByRole("button", { name: "View Receipt for demo-sale-2", exact: true }).click();
    receipt = page.getByRole("dialog", { name: "Sample Receipt", exact: true });
    await expect(receipt.getByTestId("historical-receipt-total")).toHaveText("Rs. 4,999.00");
    await receipt.press("Escape"); await expect(receipt).toBeHidden();
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(page.getByLabel("Find invoice...")).toBeFocused();
    await page.goto("/pos/returns");
    await page.getByLabel("Find Sale", { exact: true }).fill("demo-sale-1");
    await page.getByLabel("Product / original sale", { exact: true }).selectOption("demo-sale-1");
    await page.getByLabel("Return Quantity", { exact: true }).fill("3");
    await page.getByRole("button", { name: "Review Return", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("cannot exceed");
    await page.getByLabel("Return Quantity", { exact: true }).fill("1");
    await page.getByLabel("Item Condition (optional)", { exact: true }).selectOption("damaged");
    await page.getByRole("button", { name: "Review Return", exact: true }).click();
    await expect(page.getByText("Refund amount not available for this demo sale.", { exact: true })).toBeVisible();
    await page.goto("/pos/expenses");
    await page.getByLabel("Amount (Rs.)", { exact: true }).fill("250.50");
    await page.getByRole("button", { name: "Add Expense", exact: true }).click();
    await page.getByRole("button", { name: "View Expense Summary", exact: true }).click();
    await expect(page.getByRole("table")).toContainText("Rs. 250.50");
    await page.getByRole("button", { name: "Reset Demo Expenses", exact: true }).click();
    await expect(page.getByRole("table")).toHaveCount(0);
    await page.getByRole("dialog", { name: "Expense Summary", exact: true }).getByRole("button", { name: "Done", exact: true }).click();
    await page.goto("/admin/products/new");
    const details = page.locator("details").first(); await expect(details).not.toHaveAttribute("open");
    await page.getByLabel("Product Name *", { exact: true }).fill("UI example");
    await page.getByLabel("Buying Price (Rs.) *", { exact: true }).fill("100");
    await page.getByLabel("Stock Quantity *", { exact: true }).fill("0");
    await page.getByLabel("Low Stock Alert *", { exact: true }).fill("0");
    await details.getByText("More Details (Optional)", { exact: true }).press("Enter");
    await page.getByLabel("Product Code (Optional)", { exact: true }).fill("bad code");
    await details.getByText("More Details (Optional)", { exact: true }).press("Enter");
    await page.getByRole("button", { name: "Save Product", exact: true }).click();
    await expect(details).toHaveAttribute("open", "");
    await expect(page.getByLabel("Product Code (Optional)", { exact: true })).toBeFocused();
    await page.getByLabel("Product Code (Optional)", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save Product", exact: true }).click();
    await expect(page.getByRole("main").getByRole("status")).toContainText("No product or stock was saved");
    await page.goto("/admin/products");
    await page.getByLabel("Find product by name or code", { exact: true }).fill("tooth");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("article")).toContainText("Out of Stock");
    await page.goto("/admin/inventory/available-stock");
    await page.getByRole("button", { name: "Out of Stock", exact: true }).click();
    await expect(page.getByRole("rowheader", { name: "Toothpaste", exact: true })).toBeVisible();
    await expect(page.getByLabel("Overall inventory totals")).toContainText("123");
    for (const kind of ["sales", "profit"]) {
      await page.goto("/admin/" + kind + "/today");
      const totals = page.getByLabel(kind === "sales" ? "Revenue totals" : "Gross profit totals");
      const selected = page.getByLabel(kind === "sales" ? "Selected products revenue" : "Selected products gross profit", { exact: true }); await expect(selected).toBeHidden();
      await page.getByLabel("Search by product name", { exact: true }).fill("diapers");
      await expect(selected).toContainText(kind === "sales" ? "Rs. 7,499.50" : "Rs. 1,299.50");
      await page.getByRole("button", { name: "Clear search", exact: true }).click();
      await page.getByLabel("Reporting period", { exact: true }).selectOption("custom");
      await page.getByLabel("From Date", { exact: true }).fill("2026-11-03");
      await expect(page.getByRole("main").getByRole("alert")).toContainText("From Date must be on or before To Date.");
      await page.getByLabel("To Date", { exact: true }).fill("2026-11-03");
      await expect(page.getByRole("table")).toHaveCount(0); await expect(totals).toContainText("Rs. 0.00");
    }
    await page.goto("/admin/investment");
    await expect(page.getByText("Not available — purchase information incomplete", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("main").getByRole("form")).toHaveCount(0);
    await page.goto("/login"); await page.getByRole("button", { name: "Open Shop", exact: true }).click();
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
    await expect(page.getByText("Enter a password.", { exact: true })).toBeVisible();
  });
}

test("responsive reflow, System theme and accessible optional details", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-chromium", "Single responsive pass");
  test.setTimeout(120_000);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("pos-theme", "system"));
  for (const [, route] of screens) {
    await page.goto(route); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    for (const width of [320, 375, 768, 1024]) { await page.setViewportSize({ width, height: 720 }); await noOverflow(page); }
  }
  await page.goto("/pos");
  await page.emulateMedia({ colorScheme: "light" }); await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.setViewportSize({ width: 512, height: 384 }); // 200% reflow equivalent for a 1024px viewport
  await noOverflow(page); await page.getByRole("button", { name: "Create Invoice", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Create Invoice", exact: true })).toBeInViewport();
});
