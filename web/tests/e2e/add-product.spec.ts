import { expect, test } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

for (const theme of ["light", "dark"] as const) {
  test("Add Product demo and independent suggested POS price in " + theme, async ({ page, baseURL }, testInfo) => {
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
    await page.goto("/admin/products");
    const table = page.getByRole("table", { name: "Mock products" });
    await expect(table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Diapers", exact: true }) })).toContainText("Rs. 1,250.00");
    await expect(table.getByText("Not set", { exact: true })).toHaveCount(6);
    const add = page.getByRole("link", { name: "Add Product", exact: true });
    await add.focus();
    await expect(add).toHaveCSS("outline-width", "3px");
    await add.press("Enter");
    await expect(page).toHaveURL("/admin/products/new");
    await expect(page).toHaveTitle("Add Product | Shop POS");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByText("Demo Data", { exact: true })).toBeVisible();
    const name = page.getByLabel("Product name *", { exact: true });
    const cost = page.getByLabel("Purchase Cost (Rs.) *", { exact: true });
    const suggestion = page.getByLabel("Suggested Selling Price (Rs.)", { exact: true });
    const quantity = page.getByLabel("Initial quantity *", { exact: true });
    const threshold = page.getByLabel("Low-stock threshold *", { exact: true });
    const save = page.getByRole("button", { name: "Save Product", exact: true });
    const confirmation = page.getByRole("status").filter({ hasText: "Demo complete" });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByRole("form", { name: "Add product preview" }).getByRole("alert")).toHaveCount(4);
    await expect(name).toBeFocused();
    await expect(name).toHaveCSS("outline-width", "3px");
    await name.fill("Demo new product");
    await cost.fill("1000.00");
    await quantity.fill("50");
    await threshold.fill("5");
    for (const invalid of ["0", "000", "0.00", "-1", "100.999", "0.001", "abc"]) {
      await suggestion.fill(invalid);
      await suggestion.press("Enter");
      await expect(suggestion).toHaveValue(invalid);
      await expect(suggestion).toHaveAttribute("aria-invalid", "true");
      await expect(confirmation).toHaveCount(0);
      if (["100.999", "0.001"].includes(invalid)) await expect(page.getByText("Enter a price with no more than 2 decimal places.", { exact: true })).toBeVisible();
    }
    // Insert pasted text through a real input event; preserve every invalid digit.
    await suggestion.evaluate((input: HTMLInputElement) => {
      input.select();
      document.execCommand("insertText", false, "100.999");
    });
    await save.click();
    await expect(suggestion).toHaveValue("100.999");
    await expect(suggestion).toHaveAttribute("aria-invalid", "true");
    await suggestion.fill("0.01");
    await save.click();
    await expect(confirmation).toBeFocused();
    await suggestion.fill("");
    for (const invalid of ["0", "00", "000", "0.0", "0.00", "-1", "abc", "100.999"]) {
      await cost.fill(invalid);
      await save.click();
      await expect(cost).toHaveValue(invalid);
      await expect(cost).toHaveAttribute("aria-invalid", "true");
      await expect(cost).toBeFocused();
      await expect(confirmation).toHaveCount(0);
    }
    await cost.fill("1000.00");
    await save.click();
    await expect(confirmation).toContainText("No product or stock was saved.");
    await expect(suggestion).toHaveValue("");
    await suggestion.fill("1250.50");
    await suggestion.press("Tab");
    await expect(quantity).toBeFocused();
    await expect(quantity).toHaveCSS("outline-width", "3px");
    await expect(cost).toHaveValue("1000.00");
    await expectReadableContrast(page);
    if (desktop && theme === "light" && process.env.POS_CAPTURE_SCREENSHOTS === "add-product") await page.screenshot({ path: testInfo.outputPath("add-product-desktop.png"), fullPage: true });
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(save).toBeVisible();
    }
    await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL("/admin/products");
    await expect(table.getByRole("rowheader")).toHaveCount(7);
    await expect(table.getByRole("rowheader", { name: "Demo new product" })).toHaveCount(0);
    await page.goto("/admin/dashboard");
    for (const [label, value] of [["Total Products", "7"], ["Available Stock", "123"], ["Low Stock Products", "3"], ["Today's Sales Revenue (PKR)", "25690.00"]]) {
      await expect(page.getByRole("group", { name: label, exact: true }).locator("data")).toHaveAttribute("value", value);
    }
    await page.goto("/pos");
    const product = page.getByRole("combobox", { name: "Product", exact: true });
    const price = page.getByLabel("Selling price per unit (PKR)", { exact: true });
    await product.fill("Demo new product");
    await expect(page.getByText("No matching mock products. Try another name.", { exact: true })).toBeVisible();
    await product.fill("dia");
    await product.press("Enter");
    await expect(page.getByText("Suggested: Rs. 1,250.00", { exact: true })).toBeVisible();
    await expect(price).toHaveValue("");
    await price.fill("1200.00");
    await page.getByLabel("Quantity", { exact: true }).fill("2");
    await expect(page.getByTestId("sale-total")).toHaveText("Rs. 2,400.00");
    await product.fill("milk");
    await product.press("Enter");
    await expect(page.getByText("No suggested price", { exact: true })).toBeVisible();
    await expect(price).toHaveValue("1200.00");
    await product.fill("dia");
    await product.press("Enter");
    await expect(price).toHaveValue("1200.00");
    expect(await page.locator("body").innerText()).not.toMatch(/purchase cost|gross profit|margin|markup|remaining stock/i);
    expect(await page.content()).not.toMatch(/stockOnHand|currentCost|unitCostSnapshot|grossProfit|availableQuantity/);
    await expectReadableContrast(page);
    if (desktop && theme === "light" && process.env.POS_CAPTURE_SCREENSHOTS === "pos") await page.screenshot({ path: testInfo.outputPath("pos-suggested-price-desktop.png"), fullPage: true });
    await price.fill("100.999");
    await price.press("Enter");
    await expect(page.getByText("Enter a price with no more than 2 decimal places.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sale simulation complete" })).toHaveCount(0);
    await price.fill("1200.00");
    await price.press("Enter");
    await expect(page.getByTestId("confirmation-price")).toHaveText("Rs. 1,200.00");
    await expect(page.getByTestId("confirmation-total")).toHaveText("Rs. 2,400.00");
    await page.getByRole("button", { name: "New Sale", exact: true }).click();
    await expect(product).toBeFocused();
    await expect(price).toHaveValue("");
    await expect(page.getByText("Suggested: Rs. 1,250.00", { exact: true })).toHaveCount(0);
    await page.getByLabel("Theme", { exact: true }).selectOption("system");
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "light" ? "dark" : "light");
    await page.goto("/admin/products/new");
    await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
    await expect(name).toHaveValue("");
    expect(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }))).toEqual({ local: ["pos-theme"], session: [] });
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}
