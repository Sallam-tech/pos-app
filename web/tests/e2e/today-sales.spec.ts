import { expect, test } from "@playwright/test";

test("Legacy Sales URL keeps the unified report and its original query string", async ({ page }) => {
  const url = "/admin/sales/today?period=monthly&month=2026-11";
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("heading", { level: 1, name: "Sales Report", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Sales by Product chart", exact: true })).toBeVisible();
  await page.getByLabel("Reporting period", { exact: true }).selectOption("monthly");
  await page.getByRole("searchbox", { name: "Search by product name", exact: true }).fill("diapers");
  await page.getByRole("button", { name: "View Sales Details", exact: true }).press("Enter");
  await expect(page).toHaveURL(url);
  await expect(page.getByLabel("Reporting period", { exact: true })).toHaveValue("monthly");
  await expect(page.getByRole("searchbox")).toHaveValue("diapers");
  await expect(page.getByRole("heading", { name: "Sales Details", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "View sales for Diapers", exact: true }).click();
  await expect(page.getByRole("table", { name: "Original mock sales for Diapers", exact: true }).getByRole("rowheader")).toHaveText(["demo-sale-1", "demo-sale-2"]);
});

test("Dashboard revenue link opens the unified Sales Report without changing figures", async ({ page }) => {
  await page.goto("/admin/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
  const card = page.getByRole("group", { name: "Today's Sales Revenue (PKR)", exact: true });
  await expect(card.locator("data")).toHaveAttribute("value", "25690.00");
  await card.getByRole("link").press("Enter");
  await expect(page).toHaveURL("/admin/sales/today");
  await expect(page.getByRole("img", { name: "Sales by Product chart", exact: true })).toBeVisible();
  await expect(page.getByLabel("Revenue totals", { exact: true }).locator("dd")).toHaveText(["Rs. 25,690.00", "42", "6"]);
});
