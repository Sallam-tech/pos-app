import { expect, test } from "@playwright/test";
for (const theme of ["light", "dark"] as const) test("optional discounted invoice preserves the actual sale price in " + theme, async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem("pos-theme", value), theme); await page.goto("/pos");
  const product = page.getByRole("combobox", { name: "Find Product", exact: true }); await product.fill("dia"); await product.press("Enter");
  await page.getByLabel("Diapers quantity, item 1", { exact: true }).fill("2"); await page.getByLabel("Diapers price (PKR), item 1", { exact: true }).fill("1200");
  
  const discount = page.getByLabel("Diapers discount (%), item 1", { exact: true });
  for (const invalid of ["-1", "101", "10.001"]) { await discount.fill(invalid); await page.getByRole("button", { name: "Create Invoice", exact: true }).click(); await expect(discount).toBeFocused(); await expect(page.getByRole("dialog")).toHaveCount(0); }
  await discount.fill("10"); await expect(page.getByTestId("sale-total")).toHaveText("Rs. 2,160.00"); await page.getByRole("button", { name: "Create Invoice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Sample Invoice" }); await expect(dialog.getByTestId("receipt-total")).toHaveText("Rs. 2,160.00");
  await expect(dialog.getByRole("table")).toContainText("1,200.00"); await expect(dialog.locator(".receipt-sheet")).not.toContainText(/Cash Received|Change/);
  await dialog.getByRole("button", { name: "Done", exact: true }).click(); await expect(product).toBeFocused(); await expect(discount).toHaveCount(0);
});
