import { expect, test, type Page } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const theme of ["light", "dark"] as const) test("separate stock purchase, preserved Edit and honest investment in " + theme, async ({ page, baseURL }, info) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const request = route.request();
    if (new URL(request.url()).origin === baseURL && ["GET", "HEAD"].includes(request.method())) return route.continue();
    errors.push(request.method() + " " + request.url()); return route.abort();
  });
  await page.addInitScript((value) => localStorage.setItem("pos-theme", value), theme);
  const desktop = info.project.name === "chromium";
  await page.setViewportSize({ width: desktop ? 1440 : 375, height: desktop ? 900 : 720 });
  await page.goto("/admin/products");
  await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
  const diapers = page.getByRole("article", { name: "Diapers", exact: true });
  const stock = diapers.getByRole("button", { name: "Add stock for Diapers", exact: true });
  await stock.focus(); await expect(stock).toHaveCSS("outline-width", "3px"); await stock.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Add Stock — Diapers", exact: true });
  await expect(dialog).toBeVisible(); await expect(page).toHaveURL("/admin/products");
  await expect(dialog).toHaveAccessibleDescription(/Unsaved demo stock purchase/);
  const close = dialog.getByRole("button", { name: "Close dialog", exact: true });
  await expect(close).toBeFocused();
  await expect(dialog.getByText("5 units", { exact: true })).toBeVisible();
  const quantity = dialog.getByLabel("Quantity Bought", { exact: true });
  const buying = dialog.getByLabel("Buying Price per Unit (Rs.)", { exact: true });
  const selling = dialog.getByLabel("Selling Price per Unit (Rs.)", { exact: true });
  await expect(buying).toHaveValue(""); await expect(selling).toHaveValue("1250.00");
  await expectReadableContrast(page);
  if (desktop && theme === "light") await page.screenshot({ path: info.outputPath("add-stock-light.png"), scale: "css" });
  await page.keyboard.press("Tab"); await expect(quantity).toBeFocused();
  await quantity.press("Enter");
  await expect(quantity).toBeFocused(); await expect(dialog.getByText("Enter a buying price in PKR.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("stock-purchase-notice")).toHaveCount(0);
  await quantity.pressSequentially("0"); await quantity.press("Enter");
  await expect(dialog.getByText("Enter a quantity greater than zero.", { exact: true })).toBeVisible();
  await quantity.fill("2");
  for (const invalid of ["-1", "0", "abc", "100.999"]) {
    await buying.fill(invalid); await buying.press("Enter");
    await expect(buying).toBeFocused(); await expect(buying).toHaveValue(invalid);
    await expect(buying).toHaveAttribute("aria-invalid", "true"); await expect(dialog).toBeVisible();
  }
  await buying.fill("1250.25"); await selling.fill("1500.00");
  const add = dialog.getByRole("button", { name: "Add Stock", exact: true });
  await add.focus(); await page.keyboard.press("Tab"); await expect(close).toBeFocused();
  await close.press("Shift+Tab"); await expect(add).toBeFocused();
  await add.press("Enter");
  await expect(dialog).toHaveCount(0); await expect(stock).toBeFocused();
  await expect(page.getByTestId("stock-purchase-notice")).toContainText("Rs. 2,500.50");
  await expect(page.getByTestId("stock-purchase-notice")).toContainText("No stock, prices or investment were saved or changed.");
  await expect(diapers).toContainText("5 units"); await expect(diapers).toContainText("Rs. 1,250.00");
  await stock.press("Enter"); await expect(quantity).toHaveValue(""); await expect(selling).toHaveValue("1250.00");
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 600 }); await noOverflow(page);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport();
  }
  await page.setViewportSize({ width: 512, height: 384 }); await noOverflow(page);
  await dialog.press("Escape"); await expect(stock).toBeFocused();
  await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
  await diapers.getByRole("link", { name: "Edit Diapers", exact: true }).press("Enter");
  await expect(page).toHaveURL("/admin/products/diapers/edit");
  await expect(page.getByRole("heading", { name: "Edit Product", exact: true })).toBeVisible();
  await expect(page.getByTestId("edit-stock-quantity")).toHaveText("5");
  await expect(page.getByLabel("Selling Price (Rs.)", { exact: true })).toHaveValue("1250.00");
  await expect(page.getByLabel("Buying Price (Rs.)", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Stop Selling (Demo)", exact: true })).toBeVisible();
  await expect(page.locator("#stock-correction > summary")).toContainText("Correct Stock (Demo)");
  await expectReadableContrast(page);
  if (desktop && theme === "light") await page.screenshot({ path: info.outputPath("edit-product-light.png"), fullPage: true, scale: "css" });
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(page.getByTestId("edit-stock-quantity")).toHaveText("5");
  await expect(page.getByRole("main").getByRole("status")).toContainText("changes were not saved");
  await page.goto("/admin/dashboard");
  const overview = page.getByRole("region", { name: "Shop overview" });
  await expect(overview.getByRole("group")).toHaveCount(7);
  await expect(overview.getByText("Rs. 25,690.00", { exact: true })).toBeVisible();
  await expect(overview.getByText("Rs. 5,140.00", { exact: true })).toBeVisible();
  for (const label of ["Stock Value"]) {
    const card = overview.getByRole("group", { name: label, exact: true });
    await expect(card.getByText("Not available", { exact: true })).toBeVisible();
    const link = card.getByRole("link", { name: label, exact: true });
    await link.focus(); await expect(link).toHaveCSS("outline-width", "3px"); await link.press("Enter");
    await expect(page).toHaveURL("/admin/investment");
    await expect(page).toHaveTitle("Stock Value | Shop POS");
    await expect(page.getByRole("heading", { name: "Stock Value", exact: true })).toBeVisible();
    await expect(page.getByText("Not available — buying costs not recorded", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("group", { name: "Total Stock Value", exact: true })).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("form")).toHaveCount(0);
    await expect(page.getByRole("table")).toHaveCount(0);
    await page.getByText("View Product Details", { exact: true }).click();
    const table = page.getByRole("table", { name: "Demo stock value by product" });
    await expect(table.getByRole("rowheader")).toHaveCount(7);
    await expect(table.getByText("Not available", { exact: true })).toHaveCount(14);
    const toothpaste = table.getByRole("rowheader", { name: "Toothpaste", exact: true }).locator("..");
    await expect(toothpaste).toContainText("0 units"); await expect(toothpaste).not.toContainText("Rs. 0.00");
    await expectReadableContrast(page);
    if (label === "Stock Value") {
      await expect(page.locator(".investment-workspace")).toHaveCSS("background-color", theme === "light" ? "rgb(241, 245, 243)" : "rgb(20, 28, 38)");
      await expect(page.getByRole("group", { name: "Total Stock Value", exact: true })).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(28, 39, 51)");
      if (desktop) await page.screenshot({ path: info.outputPath("investment-" + theme + ".png"), fullPage: true, scale: "css" });
      for (const width of [320, 375, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 720 }); await noOverflow(page); }
      await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
    }
    await page.getByRole("link", { name: "Back to Dashboard", exact: true }).click();
  }
  await page.goto("/admin/investment");
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" }); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" }); await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["pos-theme"]);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  expect(errors).toEqual([]);
});
