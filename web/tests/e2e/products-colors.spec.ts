import { expect, test } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";
const screens = [
  ["products", "/admin/products", ""],
  ["add-product", "/admin/products/new", "Add product preview"],
  ["edit-product", "/admin/products/diapers/edit", "Edit product preview"],
] as const;
test.beforeAll(async ({ request }) => {
  test.setTimeout(60_000);
  for (const [, route] of screens) expect((await request.get(route)).ok()).toBe(true);
});
for (const theme of ["light", "dark"] as const) test("Products neutral surfaces in " + theme, async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript((value) => { if (!localStorage.getItem("pos-theme")) localStorage.setItem("pos-theme", value); }, theme);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  for (const [name, route, formName] of screens) {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const workspace = page.locator(".product-management-workspace");
    const surface = formName ? page.getByRole("form", { name: formName, exact: true }).locator("..") : page.getByRole("article").first();
    await expect(workspace).toHaveCSS("background-color", theme === "light" ? "rgb(241, 245, 243)" : "rgb(20, 28, 38)");
    await expect(surface).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(28, 39, 51)");
    await expect(surface).toHaveCSS("color", theme === "light" ? "rgb(32, 53, 45)" : "rgb(243, 246, 250)");
    if (!formName) await expect(page.getByRole("article")).toHaveCount(7);
    await expectReadableContrast(page);
    await page.screenshot({ path: info.outputPath(name + "-" + theme + ".png"), fullPage: true, scale: "css" });
    // Settle the existing blur validation before comparing theme-only geometry.
    await page.getByRole("heading", { level: 1 }).click();
    if (formName === "Add product preview") await expect(page.getByText("Enter a valid product name.", { exact: true })).toBeVisible();
    const before = await surface.boundingBox();
    const alternate = theme === "light" ? "dark" : "light";
    await page.getByLabel("Theme", { exact: true }).selectOption(alternate);
    await expect(surface).toHaveCSS("background-color", alternate === "light" ? "rgb(255, 255, 255)" : "rgb(28, 39, 51)");
    const after = await surface.boundingBox();
    expect(after!.width).toBe(before!.width); expect(after!.height).toBe(before!.height);
    await page.getByLabel("Theme", { exact: true }).selectOption("system");
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.setViewportSize({ width: 375, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  expect(errors).toEqual([]);
});
