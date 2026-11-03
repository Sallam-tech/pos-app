import { expect, test } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

for (const theme of ["light", "dark"] as const) {
  test("Product name correction and safe Edit Product demo in " + theme, async ({ page, baseURL }, testInfo) => {
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
    await page.goto("/admin/products/new");
    const name = page.getByLabel("Product name *", { exact: true });
    await page.getByLabel("Purchase Cost (Rs.) *", { exact: true }).fill("1000.00");
    await page.getByLabel("Initial quantity *", { exact: true }).fill("0");
    await page.getByLabel("Low-stock threshold *", { exact: true }).fill("0");
    const addConfirmation = page.getByRole("status").filter({ hasText: "Demo complete" });
    for (const invalid of ["", "  ", "0", "000"]) {
      await name.fill(invalid);
      await page.getByRole("button", { name: "Save Product", exact: true }).click();
      await expect(name).toBeFocused();
      await expect(page.getByText("Enter a valid product name.", { exact: true })).toBeVisible();
      await expect(addConfirmation).toHaveCount(0);
    }
    for (const valid of ["7UP", "3M Tape", "Water Bottle 500ml", "Soap (2-pack) / 100g"]) {
      await name.fill("  " + valid + "  ");
      await expect(addConfirmation).toHaveCount(0);
      await name.press("Enter");
      await expect(addConfirmation.locator("strong")).toHaveText(valid);
    }
    await page.getByLabel("Suggested Selling Price (Rs.)", { exact: true }).fill("abc");
    await expect(addConfirmation).toHaveCount(0);
    await page.getByRole("button", { name: "Save Product", exact: true }).click();
    await expect(page.getByLabel("Suggested Selling Price (Rs.)", { exact: true })).toHaveValue("abc");
    await expect(addConfirmation).toHaveCount(0);
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL("/admin/products");
    await page.getByRole("searchbox", { name: "Search by product name" }).fill("milk");
    const milk = page.getByRole("link", { name: "Edit Milk Powder", exact: true });
    await expect(milk).toHaveAttribute("href", "/admin/products/milk-powder/edit");
    await milk.focus();
    await expect(milk).toHaveCSS("outline-width", "3px");
    await milk.press("Enter");
    await expect(page).toHaveURL("/admin/products/milk-powder/edit");
    await expect(page).toHaveTitle("Edit Product | Shop POS");
    await expect(name).toHaveValue("Milk Powder");
    await expect(page.getByLabel("Suggested Selling Price (Rs.)", { exact: true })).toHaveValue("");
    await expect(page.getByText("Available quantity (read-only)").locator("..").locator("dd")).toHaveText("3");
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await page.getByRole("link", { name: "Edit Diapers", exact: true }).click();
    await expect(page).toHaveURL("/admin/products/diapers/edit");
    await expect(name).toHaveValue("Diapers");
    await expect(page.getByText("Demo Data", { exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByText("Available quantity (read-only)").locator("..").locator("dd")).toHaveText("5");
    await expect(page.getByText("Current purchase cost not available in demo data", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(5);
    await expect(page.getByLabel("Purchase Cost (Rs.) *", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Initial quantity *", { exact: true })).toHaveCount(0);
    const suggestion = page.getByLabel("Suggested Selling Price (Rs.)", { exact: true });
    const threshold = page.getByLabel("Low-stock threshold *", { exact: true });
    await expect(suggestion).toHaveValue("1250.00");
    await expect(threshold).toHaveValue("5");
    const save = page.getByRole("button", { name: "Save Changes (Demo)", exact: true });
    const confirmation = page.getByRole("status").filter({ hasText: /Demo only — (?:changes were not saved|purchase cost was not updated)\./ });
    await expect(save).toBeEnabled();
    await expectReadableContrast(page);
    if (desktop) {
      await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Products", exact: true })).toHaveAttribute("aria-current", "location");
    }
    if (desktop && theme === "light") await page.screenshot({ path: testInfo.outputPath("edit-product-desktop.png"), fullPage: true });
    await save.click();
    await expect(confirmation).toBeFocused();
    const proposal = page.getByLabel("New Purchase Cost (Demo)", { exact: true });
    await expect(proposal).toHaveValue("");
    for (const value of ["000", "0.00", "-1", "abc", "100.999"]) {
      await proposal.fill(value);
      await expect(confirmation).toHaveCount(0);
      await save.click();
      await expect(proposal).toHaveValue(value);
      await expect(proposal).toBeFocused();
      await expect(proposal).toHaveAttribute("aria-invalid", "true");
      await expect(confirmation).toHaveCount(0);
      if (["000", "0.00"].includes(value)) await expect(page.getByText("Enter a purchase cost greater than Rs. 0.00.", { exact: true })).toBeVisible();
    }
    await proposal.fill("1100.50");
    await save.click();
    await expect(confirmation).toContainText("Demo only — purchase cost was not updated.");
    await expect(page.getByText("Current purchase cost not available in demo data", { exact: true })).toBeVisible();
    await expect(page.getByText("Available quantity (read-only)").locator("..").locator("dd")).toHaveText("5");
    await proposal.fill("");
    await expect(confirmation).toHaveCount(0);
    await save.click();
    await expect(confirmation).toContainText("Demo only — changes were not saved.");
    await name.fill("0");
    await expect(confirmation).toHaveCount(0);
    await name.press("Enter");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveCSS("outline-width", "3px");
    await name.fill("Diapers - Demo");
    for (const value of ["0", "000", "0.00", "-1", "abc", "100.999"]) {
      await suggestion.fill(value);
      await suggestion.press("Enter");
      await expect(suggestion).toHaveValue(value);
      await expect(suggestion).toHaveAttribute("aria-invalid", "true");
      await expect(confirmation).toHaveCount(0);
    }
    await suggestion.fill("0.01");
    await threshold.fill("0");
    await save.click();
    await expect(confirmation).toBeFocused();
    await page.getByLabel("Category", { exact: true }).fill("Demo category");
    await expect(confirmation).toHaveCount(0);
    await save.click();
    await expect(confirmation).toBeVisible();
    await threshold.fill("-1");
    await expect(confirmation).toHaveCount(0);
    await save.click();
    await expect(threshold).toHaveValue("-1");
    await expect(threshold).toBeFocused();
    await threshold.fill("0");
    await suggestion.fill("");
    await save.click();
    await expect(confirmation).toBeVisible();
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.reload();
    await expect(name).toHaveValue("Diapers");
    await expect(suggestion).toHaveValue("1250.00");
    await expect(threshold).toHaveValue("5");
    await expect(proposal).toHaveValue("");
    await expect(page.getByLabel("Category", { exact: true })).toHaveValue("");
    await expect(confirmation).toHaveCount(0);
    await page.goto("/admin/products/no-such-product/edit");
    await expect(page.getByRole("heading", { name: "Product not found", exact: true })).toBeVisible();
    await expect(page.getByRole("form")).toHaveCount(0);
    await page.getByRole("link", { name: "Back to Products", exact: true }).click();
    await expect(page).toHaveURL("/admin/products");
    await expect(page.getByRole("table", { name: "Mock products" }).getByRole("rowheader")).toHaveCount(7);
    expect(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }))).toEqual({ local: ["pos-theme"], session: [] });
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}
