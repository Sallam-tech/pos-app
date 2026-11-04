import { expect, test } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

for (const kind of ["sales", "profit"] as const) for (const theme of ["light", "dark"] as const) {
  test(kind + " charts, period safety and accessible layout in " + theme, async ({ page, baseURL }, testInfo) => {
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
    await page.setViewportSize({ width: desktop ? 1440 : 375, height: 1000 });
    const title = kind === "sales" ? "Sales Charts" : "Profit Charts";
    const rankingTitle = kind === "sales" ? "Which Products Sold the Most?" : "Which Products Earned the Most Profit?";
    const timeTitle = kind === "sales" ? "Sales Over Time" : "Profit Over Time";
    await page.goto("/admin/reports/" + kind);
    await expect(page).toHaveTitle(title + " | Shop POS");
    await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.getByText("Demo Data", { exact: true })).toBeVisible();
    await expect(page.getByText("Admin workspace", { exact: true })).toHaveCount(0);
    const summaries = page.getByLabel(kind === "sales" ? "Sales summary" : "Profit summary", { exact: true });
    const amounts = summaries.locator("dd");
    await expect(amounts).toHaveCount(3);
    await expect(amounts).toHaveText(kind === "sales"
      ? ["Rs. 25,690.00", "42 units", "6"] : ["Rs. 5,140.00", "Rs. 20,550.00", "Diapers - Rs. 1,299.50"]);
    const ranking = page.getByRole("region", { name: rankingTitle, exact: true });
    const timeline = page.getByRole("region", { name: timeTitle, exact: true });
    await expect(ranking.getByRole("listitem")).toHaveCount(5);
    await expect(timeline.getByRole("listitem")).toHaveCount(1);
    await expect(ranking.locator("[data-comparison-bar]")).toHaveCount(5);
    await expect(ranking.getByRole("img")).toHaveCount(0);
    await expect(timeline.getByRole("img")).toHaveCount(0);
    await expect(timeline.getByText("2 November 2026", { exact: true })).toBeVisible();
    await expect(timeline.getByText(kind === "sales" ? "Rs. 25,690.00" : "Rs. 5,140.00", { exact: true })).toBeVisible();
    await expect(timeline.getByText("More sales dates are needed to compare " + kind + " over time.", { exact: true })).toHaveCount(1);
    await expect(page.locator("main svg,[data-axis]")).toHaveCount(0);
    expect((await timeline.boundingBox())!.height).toBeLessThan(320);
    if (kind === "sales") {
      await expect(ranking.getByRole("listitem").first()).toHaveText("Baby Wipes10 units");
      await expect(page.locator("main")).not.toContainText(/purchase costs|gross profit|cost of sold/i);
    }
    let nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
    if (!desktop) {
      await page.getByRole("button", { name: "Open navigation", exact: true }).click();
      nav = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
    }
    await expect(nav.getByRole("link", { name: "Reports", exact: true })).toHaveAttribute("aria-current", "location");
    await expect(nav.getByRole("button", { name: "Sales", exact: true })).not.toHaveAttribute("aria-current");
    await expect(nav.getByRole("button", { name: "Inventory", exact: true })).not.toHaveAttribute("aria-current");
    if (!desktop) await page.keyboard.press("Escape");

    const showAll = ranking.getByRole("button", { name: "Show All", exact: true });
    await showAll.focus();
    await expect(showAll).toHaveCSS("outline-width", "3px");
    await showAll.press("Enter");
    await expect(ranking.getByRole("listitem")).toHaveCount(6);
    await expect(ranking.locator("[data-comparison-bar]")).toHaveCount(6);
    await ranking.getByRole("button", { name: "Show Top 5", exact: true }).press("Enter");
    await expect(ranking.getByRole("listitem")).toHaveCount(5);
    await expectReadableContrast(page);
    if (desktop && theme === "light") {
      await page.getByRole("heading", { level: 1, name: title, exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath(kind + "-charts-desktop.png"), fullPage: true });
    }
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const entries = ranking.getByRole("listitem");
      for (const entry of await entries.all()) {
        await expect(entry).toBeVisible();
        for (const label of await entry.locator(":scope > span").all()) {
          const bounds = (await label.boundingBox())!;
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        }
      }
      if (width >= 640) {
        const bars = ranking.locator("[data-comparison-bar]");
        const origin = (await bars.first().boundingBox())!.x;
        for (const bar of await bars.all()) {
          expect(Math.abs((await bar.boundingBox())!.x - origin)).toBeLessThan(1);
        }
      }
      await expect(timeline.getByRole("img")).toHaveCount(0);
    }
    await page.getByLabel("Show by", { exact: true }).selectOption("monthly");
    await expect(timeline.getByRole("listitem")).toHaveCount(1);
    await expect(timeline.getByText("November 2026", { exact: true })).toBeVisible();
    await expect(timeline.getByRole("img")).toHaveCount(0);
    await page.getByLabel("Reporting period", { exact: true }).selectOption("monthly");
    await page.getByLabel("Month and year", { exact: true }).fill("2026-10");
    await expect(amounts).toHaveText(kind === "sales" ? ["Rs. 0.00", "0 units", "0"] : ["Rs. 0.00", "Rs. 0.00", "No sales"]);
    await expect(ranking.getByRole("listitem")).toHaveCount(0);
    await expect(timeline.getByRole("listitem")).toHaveCount(0);
    await expect(page.getByText("No sales for this period.", { exact: true })).toHaveCount(2);
    await page.getByLabel("Month and year", { exact: true }).fill("");
    await expect(page.locator("#" + kind + "-charts-period-error")).toHaveText("Choose a valid month and year.");
    await expect(amounts).toHaveText(["\u2014", "\u2014", "\u2014"]);
    await page.getByLabel("Reporting period", { exact: true }).selectOption("custom");
    await page.getByLabel("From Date", { exact: true }).fill("2026-11-03");
    await expect(page.locator("#" + kind + "-charts-period-error")).toHaveText("From Date must be on or before To Date.");
    await expect(page.getByLabel("From Date", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(amounts).toHaveText(["\u2014", "\u2014", "\u2014"]);
    await page.getByLabel("From Date", { exact: true }).fill("2026-11-02");
    await expect(amounts.first()).toHaveText(kind === "sales" ? "Rs. 25,690.00" : "Rs. 5,140.00");
    await expect(page.getByText("From: 02 Nov 2026 to 02 Nov 2026 (Asia/Karachi)", { exact: true })).toBeVisible();
    await expect(ranking.getByRole("listitem")).toHaveCount(5);
    await expect(timeline.getByRole("listitem")).toHaveCount(1);
    await page.getByLabel("Theme", { exact: true }).selectOption("system");
    const opposite = theme === "light" ? "dark" : "light";
    await page.emulateMedia({ colorScheme: opposite });
    await expect(page.locator("html")).toHaveAttribute("data-theme", opposite);
    await page.reload();
    await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
    await expectReadableContrast(page);
    const back = page.getByRole("link", { name: "Back to Reports", exact: true });
    await back.focus();
    await expect(back).toHaveCSS("outline-width", "3px");
    await back.press("Enter");
    await expect(page).toHaveURL("/admin/reports");
    await expect(page.getByRole("region", { name: "Available reports", exact: true }).getByRole("group")).toHaveCount(2);
    await page.getByRole("link", { name: kind === "sales" ? "View Sales Charts" : "View Profit Charts", exact: true }).click();
    await expect(page).toHaveURL("/admin/reports/" + kind);
    await page.getByRole("link", { name: kind === "sales" ? "View Detailed Sales Report" : "View Detailed Profit Report", exact: true }).click();
    await expect(page).toHaveURL(kind === "sales" ? "/admin/sales/today" : "/admin/profit/today");
    await expect(page.locator("main")).toContainText(kind === "sales" ? "Rs. 25,690.00" : "Rs. 5,140.00");
    if (kind === "sales" && theme === "light" && desktop) {
      await page.goto("/pos");
      await expect(page.locator("main")).not.toContainText(/purchase cost|gross profit|stock quantity|cost of sold/i);
    }
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}
