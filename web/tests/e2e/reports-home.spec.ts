import { expect, test } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

for (const theme of ["light", "dark"] as const) test("Reports home and direct report navigation in " + theme, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((mode) => localStorage.setItem("pos-theme", mode), theme);
  await page.emulateMedia({ colorScheme: theme });
  await page.goto("/admin/reports", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
  const options = page.getByRole("region", { name: "Available reports", exact: true });
  await expect(options.getByRole("group")).toHaveCount(2);
  await expect(page.locator("main input,main select,main table")).toHaveCount(0);
  await expectReadableContrast(page);
  for (const kind of ["sales", "profit"] as const) {
    const label = kind === "sales" ? "Sales" : "Profit";
    const link = options.getByRole("link", { name: "View " + label + " Report", exact: true });
    await link.focus();
    await expect(link).toHaveCSS("outline-width", "3px");
    await link.press("Enter");
    await expect(page).toHaveURL("/admin/reports/" + kind);
    await expect(page.getByRole("heading", { level: 1, name: label + " Report", exact: true })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
    await expect(nav.getByRole("link", { name: "Reports", exact: true })).toHaveAttribute("aria-current", "location");
    await expect(nav.getByRole("link", { name: "Sales", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Back to Reports", exact: true }).click();
  }
  await page.setViewportSize({ width: 375, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const opener = page.getByRole("button", { name: "Open navigation", exact: true });
  await opener.click();
  const drawer = page.getByRole("dialog", { name: "Admin navigation", exact: true });
  const mobile = drawer.getByRole("navigation", { name: "Mobile navigation", exact: true });
  await expect(mobile.getByRole("link")).toHaveText(["Dashboard", "Products", "Inventory", "Reports", "Total Investment"]);
  await mobile.getByRole("link", { name: "Reports", exact: true }).press("Enter");
  await expect(drawer).toBeHidden();
  await opener.click();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});
