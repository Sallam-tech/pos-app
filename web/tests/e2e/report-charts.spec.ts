import { expect, test } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

test.beforeAll(async ({ request }) => {
  test.setTimeout(90_000);
  for (const route of ["/admin/reports", "/admin/reports/sales", "/admin/reports/profit", "/admin/sales/today", "/admin/profit/today", "/admin/dashboard"]) expect((await request.get(route)).ok()).toBe(true);
});

for (const kind of ["sales", "profit"] as const) for (const theme of ["light", "dark"] as const) {
  test(kind + " unified report in " + theme, async ({ page }, info) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((mode) => { if (!localStorage.getItem("pos-theme")) localStorage.setItem("pos-theme", mode); }, theme);
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const title = kind === "sales" ? "Sales Report" : "Profit Report";
    const detailsTitle = kind === "sales" ? "Sales Details" : "Profit Details";
    const chartTitle = kind === "sales" ? "Sales by Product" : "Profit by Product";
    const url = "/admin/reports/" + kind;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
    await expect(page).toHaveTitle(title + " | Shop POS");
    await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.getByText("Demo Data", { exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
    await expect(nav.getByRole("link")).toHaveText(["Dashboard", "Products", "Inventory", "Reports", "Stock Value", "Daily Closing", "Settings"]);
    await expect(nav.getByRole("link", { name: "Reports", exact: true })).toHaveAttribute("aria-current", "location");
    await expect(nav.getByRole("link", { name: "Sales", exact: true })).toHaveCount(0);
    const totals = page.getByLabel(kind === "sales" ? "Revenue totals" : "Gross profit totals", { exact: true });
    await expect(totals.locator("dd")).toHaveCount(3);
    await expect(totals.locator("dd")).toHaveText(kind === "sales" ? ["Rs. 25,690.00", "42", "6"] : ["Rs. 5,140.00", "Rs. 20,550.00", "DiapersRs. 1,299.50"]);
    const chart = page.getByRole("region", { name: chartTitle, exact: true });
    const chartArea = chart.getByRole("region", { name: chartTitle + " chart area", exact: true });
    const graphic = chart.getByRole("img", { name: chartTitle + " chart", exact: true });
    await expect(graphic).toBeVisible();
    await expect(graphic.locator("rect[data-comparison-bar]")).toHaveCount(6);
    await expect(graphic.locator('[data-axis="PKR"]')).toBeVisible();
    await expect(chart.locator("span[data-comparison-bar]")).toHaveCount(0);
    await expect(page.getByRole("img", { name: /Over Time trend/ })).toHaveCount(0);
    const details = page.getByRole("region", { name: detailsTitle, exact: true });
    const table = details.getByRole("table");
    await expect(table.getByRole("rowheader")).toHaveCount(6);
    await expect(table.getByRole("columnheader")).toHaveText(kind === "sales" ? ["Product", "Qty", "Total Sales"] : ["Product", "Sold", "Sales", "Cost", "Profit"]);
    const period = page.getByLabel("Reporting period", { exact: true });
    const action = page.getByRole("button", { name: "View " + detailsTitle, exact: true });
    const periodBox = (await period.boundingBox())!, actionBox = (await action.boundingBox())!;
    expect(Math.abs(periodBox.y + periodBox.height - actionBox.y - actionBox.height)).toBeLessThanOrEqual(1);
    await chart.getByRole("button", { name: "Show Top 5", exact: true }).click();
    await expect(graphic.locator("rect[data-comparison-bar]")).toHaveCount(5);
    await expect(table.getByRole("rowheader")).toHaveCount(6);
    await chart.getByRole("button", { name: "Show All", exact: true }).click();
    await expect(graphic.locator("rect[data-comparison-bar]")).toHaveCount(6);
    const search = page.getByRole("searchbox", { name: "Search by product name", exact: true });
    await search.fill("  DIAPERS  ");
    await expect(table.getByRole("rowheader")).toHaveCount(1);
    await expect(graphic.locator("rect[data-comparison-bar]")).toHaveCount(1);
    const selected = page.getByLabel(kind === "sales" ? "Selected products revenue" : "Selected products gross profit", { exact: true });
    await expect(selected).toContainText(kind === "sales" ? "Rs. 7,499.50" : "Rs. 1,299.50");
    await expect(totals.locator("dd").first()).toHaveText(kind === "sales" ? "Rs. 25,690.00" : "Rs. 5,140.00");
    await action.focus();
    await expect(action).toHaveCSS("outline-width", "3px");
    await action.press("Enter");
    await expect(page.getByRole("heading", { name: detailsTitle, exact: true })).toBeFocused();
    await expect(page).toHaveURL(url);
    await expect(search).toHaveValue("  DIAPERS  ");
    if (kind === "sales") {
      const trigger = table.getByRole("button", { name: "View sales for Diapers", exact: true });
      await trigger.focus();
      await trigger.press("Enter");
      const individual = page.getByRole("table", { name: "Original mock sales for Diapers", exact: true });
      await expect(individual.getByRole("rowheader")).toHaveText(["demo-sale-1", "demo-sale-2"]);
      await expect(individual.getByRole("row").nth(1).getByRole("cell")).toHaveText(["2026-11-02", "2", "Rs. 1,250.25", "Rs. 2,500.50"]);
      await expect(individual.getByRole("row").nth(2).getByRole("cell")).toHaveText(["2026-11-02", "4", "Rs. 1,249.75", "Rs. 4,999.00"]);
      await table.getByRole("button", { name: "Hide sales for Diapers", exact: true }).click();
      await expect(page.locator("main")).not.toContainText(/gross profit|purchase cost|cost of sold/i);
    } else {
      await expect(page.getByText(/Purchase costs are fictional demo examples/)).toBeVisible();
      await expect(table.getByRole("cell")).toHaveText(["6", "Rs. 7,499.50", "Rs. 6,200.00", "Rs. 1,299.50"]);
    }
    await search.fill("no-such-product");
    await expect(details.getByText("No products match your search in this period.", { exact: true })).toBeVisible();
    await expect(chart.getByRole("img")).toHaveCount(0);
    await page.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(search).toBeFocused();
    if (theme === "light") {
      await period.selectOption("monthly");
      await page.getByLabel("Month and year", { exact: true }).fill("2026-10");
      await expect(totals.locator("dd").first()).toHaveText("Rs. 0.00");
      await expect(table).toHaveCount(0);
      await expect(graphic).toHaveCount(0);
      await page.getByLabel("Month and year", { exact: true }).fill("");
      await expect(page.getByRole("main").getByRole("alert")).toHaveText("Choose a valid month and year.");
      await expect(totals.locator("dd")).toHaveText(["—", "—", "—"]);
      await period.selectOption("custom");
      const from = page.getByLabel("From Date", { exact: true }), to = page.getByLabel("To Date", { exact: true });
      await from.fill("2026-11-03");
      await expect(page.getByRole("main").getByRole("alert")).toHaveText("From Date must be on or before To Date.");
      await expect(totals.locator("dd")).toHaveText(["—", "—", "—"]);
      await to.fill("2026-11-03");
      await expect(totals.locator("dd").first()).toHaveText("Rs. 0.00");
      await expect(details.getByText(kind === "sales" ? "No sales found for this period." : "No sales for this period.", { exact: true })).toBeVisible();
      await from.fill("2026-11-02");
      await to.fill("2026-11-02");
      await expect(table.getByRole("rowheader")).toHaveCount(6);
      await period.selectOption("today");
    }
    for (const width of [1440, 1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(action).toBeVisible();
      await expect(search).toBeVisible();
    }
    await chartArea.focus();
    await expect(chartArea).toHaveCSS("outline-width", "3px");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => chartArea.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect.poll(() => chartArea.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
    await expectReadableContrast(page);
    if (theme === "light" || kind === "profit") {
      await page.getByRole("heading", { level: 1, name: title, exact: true }).click();
      await page.screenshot({ path: info.outputPath(kind + "-report-" + theme + ".png"), fullPage: true, scale: "css" });
    }
    await page.getByLabel("Theme", { exact: true }).selectOption("system");
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "light" ? "dark" : "light");
    expect(errors).toEqual([]);
  });
}
