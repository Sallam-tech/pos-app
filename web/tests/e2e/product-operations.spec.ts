import { expect, test } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

for (const theme of ["light", "dark"] as const) {
  test("separate stock correction and selling-status demos in " + theme, async ({ page, baseURL }, testInfo) => {
    const unexpected: string[] = [];
    const errors: string[] = [];
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
    await page.goto("/admin/products/baby-wipes/edit");
    await expect(page.getByRole("button", { name: "Save Changes (Demo)", exact: true })).toBeEnabled();
    await expect(page.getByLabel("Product name *", { exact: true })).toHaveValue("Baby Wipes");
    await expect(page.getByLabel("New Purchase Cost (Demo)", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Suggested Selling Price (Rs.)", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Correct Quantity", { exact: true })).toHaveCount(0);
    const operations = page.getByRole("region", { name: "Product operations preview", exact: true });
    const disclosure = operations.locator("summary");
    await disclosure.focus();
    await expect(disclosure).toHaveCSS("outline-width", "3px");
    await disclosure.press("Enter");
    const quantity = operations.getByLabel("Correct Quantity", { exact: true });
    const reason = operations.getByLabel("Reason for Correction", { exact: true });
    const preview = operations.getByRole("button", { name: "Preview Correction", exact: true });
    const difference = operations.getByLabel("Difference", { exact: true });
    const confirmation = operations.getByTestId("correction-confirmation");
    await expect(operations.getByTestId("correction-current-quantity")).toHaveText("20");
    await preview.click();
    await expect(quantity).toBeFocused();
    await expect(quantity).toHaveAttribute("aria-invalid", "true");
    await expect(operations.getByText("Enter a reason explaining the correction.", { exact: true })).toBeVisible();
    await reason.fill("3 damaged items");
    for (const value of ["-1", "abc", "0.0000001", "1000000000000"]) {
      await quantity.fill(value);
      await quantity.press("Enter");
      await expect(quantity).toHaveValue(value);
      await expect(quantity).toHaveAttribute("aria-invalid", "true");
      await expect(difference).toHaveText("—");
      await expect(confirmation).toHaveCount(0);
    }
    for (const [value, delta] of [["25", "+5"], ["0", "-20"], ["20.000001", "+0.000001"]]) {
      await quantity.fill(value);
      await expect(confirmation).toHaveCount(0);
      await expect(difference).toHaveText(delta);
      await preview.click();
      await expect(confirmation).toContainText("Demo only — stock was not changed.");
      await expect(operations.getByTestId("correction-current-quantity")).toHaveText("20");
    }
    await quantity.fill("20");
    await preview.click();
    await expect(operations.getByText("No correction is needed. The quantity is unchanged.", { exact: true })).toBeVisible();
    await expect(confirmation).toHaveCount(0);
    await quantity.fill("17");
    await reason.fill("");
    await preview.click();
    await expect(reason).toBeFocused();
    await expect(confirmation).toHaveCount(0);
    await reason.fill("3 damaged items");
    // Ordinary Save Changes does not preview a stock correction or a status change.
    await page.getByRole("button", { name: "Save Changes (Demo)", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Demo only — changes were not saved." })).toBeVisible();
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await preview.click();
    await expect(difference).toHaveText("-3");
    await expect(confirmation).toContainText("No inventory record or history entry was created.");
    await expectReadableContrast(page);
    if (desktop && theme === "light") await operations.screenshot({ path: testInfo.outputPath("product-operations-desktop.png") });
    await reason.fill("Counted again");
    await expect(confirmation).toHaveCount(0);

    const status = operations.getByRole("region", { name: "Product Status", exact: true });
    const stop = status.getByRole("button", { name: "Stop Selling (Demo)", exact: true });
    await expect(status.getByText("Active (demo preview)", { exact: true })).toBeVisible();
    await stop.click();
    let dialog = page.getByRole("dialog", { name: "Stop Selling (Demo)", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close dialog", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(stop).toBeFocused();
    await expect(status.getByText("Active (demo preview)", { exact: true })).toBeVisible();
    await stop.click();
    await dialog.getByRole("button", { name: "Confirm Stop Selling (Demo)", exact: true }).click();
    await expect(status.getByText("Inactive (demo preview)", { exact: true })).toBeVisible();
    await expect(status.getByRole("status")).toContainText("the product is not actually deactivated");
    await expect(operations.getByTestId("correction-current-quantity")).toHaveText("20");
    await status.getByRole("button", { name: "Resume Selling (Demo)", exact: true }).click();
    await expect(status.getByRole("status")).toHaveCount(0);
    dialog = page.getByRole("dialog", { name: "Resume Selling (Demo)", exact: true });
    await dialog.getByRole("button", { name: "Confirm Resume Selling (Demo)", exact: true }).click();
    await expect(status.getByText("Active (demo preview)", { exact: true })).toBeVisible();
    await expect(status.getByRole("status")).toContainText("the product is not actually reactivated");
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.getByLabel("Theme", { exact: true }).selectOption("system");
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "light" ? "dark" : "light");
    await page.reload();
    await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
    await expect(status.getByText("Active (demo preview)", { exact: true })).toBeVisible();
    await expect(status.getByRole("status")).toHaveCount(0);
    await expect(quantity).toHaveCount(0);
    await disclosure.click();
    await expect(quantity).toHaveValue("");
    await expect(operations.getByTestId("correction-current-quantity")).toHaveText("20");
    await page.goto("/admin/products/toothpaste/edit");
    await expect(status.getByText("Active (demo preview)", { exact: true })).toBeVisible();
    await disclosure.click();
    await expect(operations.getByTestId("correction-current-quantity")).toHaveText("0");
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL("/admin/products");
    await expect(page.getByRole("table", { name: "Mock products" }).getByRole("rowheader")).toHaveCount(7);
    await page.goto("/admin/dashboard");
    for (const [label, value] of [["Total Products", "7"], ["Available Stock", "123"], ["Low Stock Products", "3"], ["Today's Sales Revenue (PKR)", "25690.00"]]) {
      await expect(page.getByRole("group", { name: label, exact: true }).locator("data")).toHaveAttribute("value", value);
    }
    await page.goto("/pos");
    const product = page.getByRole("combobox", { name: "Product", exact: true });
    await product.fill("dia");
    await product.press("Enter");
    await expect(page.getByText("Suggested: Rs. 1,250.00", { exact: true })).toBeVisible();
    const price = page.getByLabel("Selling price per unit (PKR)", { exact: true });
    await expect(price).toHaveValue("");
    await price.fill("1100.00");
    await page.getByLabel("Quantity", { exact: true }).fill("2");
    await expect(page.getByTestId("sale-total")).toHaveText("Rs. 2,200.00");
    expect(await page.locator("body").innerText()).not.toMatch(/purchase cost|remaining stock|profit|Correct Stock|Product Status/i);
    expect(await page.content()).not.toMatch(/stockOnHand|currentCost|unitCostSnapshot|grossProfit|availableQuantity/);
    expect(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }))).toEqual({ local: ["pos-theme"], session: [] });
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}
