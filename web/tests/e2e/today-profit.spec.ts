import { expect, test } from "@playwright/test";

test("Dashboard and legacy Profit URL show the unified fictional-cost report while POS remains private", async ({ page }) => {
  await page.goto("/admin/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
  const card = page.getByRole("group", { name: "Today's Gross Profit", exact: true });
  await expect(card.locator("data")).toHaveAttribute("value", "5140.00");
  await card.getByRole("link").press("Enter");
  await expect(page).toHaveURL("/admin/profit/today");
  await expect(page.getByRole("img", { name: "Profit by Product chart", exact: true })).toBeVisible();
  await expect(page.getByLabel("Gross profit totals", { exact: true }).locator("dd")).toHaveText(["Rs. 5,140.00", "Rs. 20,550.00", "DiapersRs. 1,299.50"]);
  await expect(page.getByText(/Purchase costs are fictional demo examples/)).toBeVisible();
  const url = "/admin/profit/today?period=custom&from=2026-11-02&to=2026-11-02";
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(url);
  await page.getByRole("button", { name: "View Profit Details", exact: true }).press("Enter");
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("heading", { name: "Profit Details", exact: true })).toBeFocused();
  const response = await page.goto("/pos", { waitUntil: "domcontentloaded" });
  expect(await response!.text()).not.toMatch(/unitCostSnapshotPaise|costOfGoodsSoldPaise|grossProfitPaise/);
  expect(await page.locator("main").innerText()).not.toMatch(/purchase cost|gross profit|historical cost|remaining stock/i);
});
