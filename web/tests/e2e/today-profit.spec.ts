import { expect, test } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

for (const theme of ["light", "dark"] as const) {
  test("Profit Report fictional costs, periods, exact totals and navigation in " + theme, async ({ page, baseURL }, testInfo) => {
    const errors: string[] = [];
    const unexpected: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const request = route.request();
      if (new URL(request.url()).origin === baseURL && ["GET", "HEAD"].includes(request.method())) return route.continue();
      unexpected.push(request.method() + " " + request.url());
      return route.abort();
    });
    await page.addInitScript((mode) => { if (!localStorage.getItem("pos-theme")) localStorage.setItem("pos-theme", mode); }, theme);
    await page.emulateMedia({ colorScheme: theme });
    const desktop = testInfo.project.name === "chromium";
    await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
    await page.goto("/admin/dashboard");
    const overview = page.getByRole("region", { name: "Shop overview" });
    await expect(overview.getByRole("group")).toHaveCount(5);
    for (const [name, value] of [["Total Products", "7"], ["Available Stock", "123"], ["Low Stock Products", "3"], ["Today's Sales Revenue (PKR)", "25690.00"]]) {
      await expect(overview.getByRole("group", { name, exact: true }).locator("data")).toHaveAttribute("value", value);
    }
    const profit = overview.getByRole("group", { name: "Today's Profit", exact: true });
    await expect(profit.getByText("Rs. 5,140.00", { exact: true })).toBeVisible();
    await expect(profit.getByText("Example purchase costs for demo sales.", { exact: true })).toBeVisible();
    await expect(profit.locator("data")).toHaveAttribute("value", "5140.00");
    const dashboardProfit = await profit.locator("data").textContent();
    await expect(page.getByText("Rs. 4,860.00", { exact: true })).toHaveCount(0);
    await expectReadableContrast(page);
    const link = profit.getByRole("link", { name: "Today's Profit", exact: true });
    for (let step = 0; step < 24; step++) {
      await page.keyboard.press("Tab");
      if (await link.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS("outline-width", "3px");
    await link.press("Enter");
    await expect(page).toHaveURL("/admin/profit/today");
    await expect(page).toHaveTitle("Profit Report | Shop POS");
    await expect(page.getByRole("heading", { name: "Profit Report", level: 1 })).toBeVisible();
    await expect(page.getByText("Demo Data", { exact: true })).toBeVisible();
    await expect(page.getByText(/Fixed demo Today:/)).toContainText("2 November 2026 (Asia/Karachi). Fixed examples, not live sales.");
    await expect(page.getByText("Admin workspace", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "All previews", exact: true })).toHaveCount(0);
    const totals = page.getByLabel("Gross profit totals", { exact: true });
    const overall = totals.getByText("Total Gross Profit", { exact: true }).locator("..").locator("dd > span").first();
    const selected = totals.getByText("Selected Products Gross Profit", { exact: true }).locator("..").locator("dd > span").first();
    await expect(overall).toHaveText("Rs. 5,140.00");
    await expect(selected).toHaveText("Rs. 5,140.00");
    await expect(overall).toHaveText(dashboardProfit!);
    await expect(page.getByText("Profit calculated using example purchase costs for demo sales.", { exact: true })).toBeVisible();
    const table = page.getByRole("table", { name: "Mock product-wise gross profit", exact: true });
    await expect(table.getByRole("rowheader")).toHaveText(["Diapers", "Milk Powder", "Baby Wipes", "Hand Soap", "Rice", "Shampoo"]);
    for (const [name, quantity, revenue, cost, grossProfit] of [["Diapers", "6", "Rs. 7,499.50", "Rs. 6,200.00", "Rs. 1,299.50"], ["Milk Powder", "4", "Rs. 6,001.00", "Rs. 4,900.00", "Rs. 1,101.00"], ["Baby Wipes", "10", "Rs. 3,499.50", "Rs. 2,500.00", "Rs. 999.50"], ["Hand Soap", "10", "Rs. 1,255.00", "Rs. 1,000.00", "Rs. 255.00"], ["Rice", "5", "Rs. 4,250.00", "Rs. 3,500.00", "Rs. 750.00"], ["Shampoo", "7", "Rs. 3,185.00", "Rs. 2,450.00", "Rs. 735.00"]]) {
      const row = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });
      await expect(row.getByRole("cell")).toHaveText([quantity, revenue, cost, grossProfit]);
    }
    await expectReadableContrast(page);
    if (desktop && theme === "light") await page.screenshot({ path: testInfo.outputPath("profit-report-desktop.png"), fullPage: true });

    const period = page.getByRole("combobox", { name: "Reporting period", exact: true });
    const search = page.getByRole("searchbox", { name: "Search by product name", exact: true });
    await page.getByRole("link", { name: "Back to Dashboard", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(period).toBeFocused();
    await expect(period).toHaveCSS("outline-width", "3px");
    await page.keyboard.press("Tab");
    await expect(search).toBeFocused();
    await page.keyboard.type("  DIAPERS  ");
    await expect(table.getByRole("rowheader")).toHaveText(["Diapers"]);
    await expect(overall).toHaveText("Rs. 5,140.00");
    await expect(selected).toHaveText("Rs. 1,299.50");
    await search.fill("no-such-product");
    await expect(page.getByText("No products match your search in this period.", { exact: true })).toBeVisible();
    await expect(overall).toHaveText("Rs. 5,140.00");
    await expect(selected).toHaveText("Rs. 0.00");
    await page.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(search).toBeFocused();
    await expect(table.getByRole("rowheader")).toHaveCount(6);
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
    await period.selectOption("monthly");
    const month = page.getByLabel("Month and year", { exact: true });
    await expect(page.getByText("Selected month: November 2026", { exact: true })).toBeVisible();
    await expect(overall).toHaveText("Rs. 5,140.00");
    await month.fill("2026-10");
    await expect(page.getByText("No sales for this period.", { exact: true })).toBeVisible();
    await expect(overall).toHaveText("Rs. 0.00");
    await month.fill("");
    await expect(page.locator("#profit-period-error")).toHaveText("Choose a valid month and year.");
    await expect(overall).toHaveText("\u2014");
    await period.selectOption("custom");
    const from = page.getByLabel("From Date", { exact: true });
    const to = page.getByLabel("To Date", { exact: true });
    await expect(page.getByText("From: 02 Nov 2026", { exact: true })).toBeVisible();
    await expect(page.getByText("To: 02 Nov 2026", { exact: true })).toBeVisible();
    await expect(overall).toHaveText("Rs. 5,140.00");
    await from.fill("2026-11-03");
    await expect(page.locator("#profit-period-error")).toHaveText("From Date must be on or before To Date.");
    await expect(from).toHaveAttribute("aria-invalid", "true");
    await expect(overall).toHaveText("\u2014");
    await expect(selected).toHaveText("\u2014");
    await to.fill("2026-11-03");
    await expect(page.getByText("No sales for this period.", { exact: true })).toBeVisible();
    await expect(overall).toHaveText("Rs. 0.00");
    await from.fill("2026-11-01");
    await to.fill("2026-11-02");
    await expect(overall).toHaveText("Rs. 5,140.00");
    await expect(table.getByRole("rowheader")).toHaveCount(6);
    await from.fill("");
    await expect(page.locator("#profit-period-error")).toHaveText("Enter valid From and To dates.");
    await period.selectOption("today");
    await expect(overall).toHaveText("Rs. 5,140.00");

    await page.getByLabel("Theme", { exact: true }).selectOption("system");
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "light" ? "dark" : "light");
    await page.reload();
    await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
    await expectReadableContrast(page);
    await page.getByRole("link", { name: "Back to Dashboard", exact: true }).click();
    await expect(page).toHaveURL("/admin/dashboard");
    const response = await page.goto("/pos");
    expect(await response!.text()).not.toMatch(/unitCostSnapshotPaise|costOfGoodsSoldPaise|grossProfitPaise/);
    const product = page.getByRole("combobox", { name: "Product", exact: true });
    await product.fill("diapers");
    await product.press("Enter");
    await expect(page.getByText("Suggested: Rs. 1,250.00", { exact: true })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(/purchase cost|gross profit|historical cost|margin|remaining stock/i);
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}
