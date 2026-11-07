import { expect, test, type Page } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

test.use({ actionTimeout: 10_000 });

for (const theme of ["light", "dark"] as const) {
  test("single demo entry, return navigation and restrained interactions in " + theme, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const unexpected: string[] = [], errors: string[] = [];
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

    async function navigation() {
      if (page.viewportSize()!.width >= 1024) return page.getByRole("navigation", { name: "Main navigation", exact: true });
      await page.getByRole("button", { name: "Open navigation", exact: true }).click();
      return page.getByRole("navigation", { name: "Mobile navigation", exact: true });
    }
    async function noOverflow() {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    async function responsive(target: Page) {
      for (const width of [320, 375, 768, 1024, 1440]) {
        await target.setViewportSize({ width, height: 720 });
        await noOverflow();
        const drawerExit = target.url().includes("/admin/") && width < 1024;
        if (drawerExit) await target.getByRole("button", { name: "Open navigation", exact: true }).click();
        const back = target.getByRole("link", { name: "Exit Demo", exact: true });
        await expect(back).toHaveCount(1);
        await expect(back).toBeVisible();
        const bounds = (await back.boundingBox())!;
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        if (drawerExit) await target.getByRole("dialog", { name: "Admin navigation", exact: true }).press("Escape");
      }
      await target.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
    }

    const redirect = await page.request.get("/", { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expect(redirect.headers().location).toBe("/login");
    await page.goto("/");
    await expect(page).toHaveURL("/login");
    await expect(page).toHaveTitle("Login | Shop POS");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Shop POS", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Explore Demo" })).toBeVisible();
    const admin = page.getByRole("link", { name: "Preview Admin", exact: true });
    const salesperson = page.getByRole("link", { name: "Preview Salesperson", exact: true });
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 720 });
      await noOverflow();
      await expect(admin).toBeVisible();
      await expect(salesperson).toBeVisible();
    }
    await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
    await expectReadableContrast(page);
    if (desktop && theme === "light") await page.screenshot({ path: testInfo.outputPath("login-demo-entry.png"), fullPage: true });
    const password = page.getByLabel("Password", { exact: true });
    await page.getByRole("button", { name: "Open Shop", exact: true }).click();
    await expect(password).toBeFocused();
    await expect(password).toHaveCSS("outline-width", "3px");
    await password.fill("made-up-details");
    const toggle = page.getByRole("button", { name: /^(Show|Hide) password$/ });
    await toggle.click();
    await expect(password).toHaveAttribute("type", "text");
    expect(await toggle.evaluate((element) => element.matches(":focus-visible"))).toBe(false);
    await expect(toggle).toHaveCSS("box-shadow", "none");
    await toggle.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveCSS("outline-width", "3px");
    await toggle.press("Space");
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Open Shop", exact: true }).click();
    await expect(page.getByRole("form").getByRole("alert")).toContainText("Sign-in is unavailable");
    await expect(page).toHaveURL("/login");
    await expect(password).toHaveValue("");

    await admin.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(admin).toHaveCSS("outline-width", "3px");
    await admin.press("Enter");
    await expect(page).toHaveURL("/admin/dashboard");
    await page.goBack();
    await expect(page).toHaveURL("/login");
    await page.goForward();
    await expect(page).toHaveURL("/admin/dashboard");
    await responsive(page);
    await expectReadableContrast(page);
    let nav = await navigation();
    await nav.getByRole("link", { name: "Products", exact: true }).click();
    await expect(page).toHaveURL("/admin/products");
    await page.getByRole("link", { name: "Add Product", exact: true }).click();
    await expect(page).toHaveURL("/admin/products/new");
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await page.getByRole("link", { name: "Edit Diapers", exact: true }).click();
    await expect(page).toHaveURL("/admin/products/diapers/edit");
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    nav = await navigation();
    await nav.getByRole("button", { name: "Inventory", exact: true }).click();
    await nav.getByRole("link", { name: "Available Stock", exact: true }).click();
    await expect(page).toHaveURL("/admin/inventory/available-stock");
    nav = await navigation();
    await nav.getByRole("link", { name: "Low Stock Products", exact: true }).click();
    await expect(page).toHaveURL("/admin/inventory/low-stock");
    await expect(page.getByText("Toothpaste", { exact: true })).toBeVisible();
    nav = await navigation();
    await nav.getByRole("link", { name: "Reports", exact: true }).click();
    await page.getByRole("link", { name: "View Sales Charts", exact: true }).click();
    await expect(page).toHaveURL("/admin/reports/sales");
    await page.getByRole("link", { name: "View Detailed Sales Report", exact: true }).click();
    await expect(page).toHaveURL("/admin/sales/today");
    nav = await navigation();
    await nav.getByRole("link", { name: "Reports", exact: true }).click();
    await page.getByRole("link", { name: "View Profit Charts", exact: true }).click();
    await expect(page).toHaveURL("/admin/reports/profit");
    await page.getByRole("link", { name: "View Detailed Profit Report", exact: true }).click();
    await expect(page).toHaveURL("/admin/profit/today");
    if (page.url().includes("/admin/") && page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("link", { name: "Exit Demo", exact: true }).click();
  if (await page.getByRole("dialog", { name: "Leave this page?", exact: true }).isVisible()) await page.getByRole("link", { name: "Leave page", exact: true }).click();
    await expect(page).toHaveURL("/login");

    await salesperson.click();
    await expect(page).toHaveURL("/pos");
    await responsive(page);
    await expectReadableContrast(page);
    await expect(page.locator("main")).not.toContainText(/purchase cost|gross profit|remaining stock|stock quantity/i);
    expect(await page.content()).not.toMatch(/unitCostSnapshot|currentCost|stockOnHand|grossProfit/);
    const product = page.getByRole("combobox", { name: "Find Product", exact: true });
    await product.fill("diap");
    await page.getByRole("option", { name: "Diapers", exact: true }).click();
    await expect(page.getByText(/Suggested: Rs. 1,250.00/)).toBeVisible();
    const increase = page.getByRole("button", { name: "Increase quantity by one", exact: true });
    await increase.hover();
    const before = (await increase.boundingBox())!;
    const hoverColor = await increase.evaluate((element) => getComputedStyle(element).backgroundColor);
    await page.mouse.down();
    await expect.poll(() => increase.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(hoverColor);
    expect((await increase.boundingBox())!.height).toBe(before.height);
    await page.mouse.up();
    expect(await increase.evaluate((element) => element.matches(":focus-visible"))).toBe(false);
    await expect(increase).toHaveCSS("box-shadow", "none");
    await page.getByLabel("Diapers quantity, item 1", { exact: true }).fill("2");
    const price = page.getByLabel("Diapers price (PKR), item 1", { exact: true });
    await price.fill("100.999");
    await page.getByRole("button", { name: "Create Invoice", exact: true }).click();
    await expect(page.getByText("Enter a price with no more than 2 decimal places.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sale simulation complete", exact: true })).toHaveCount(0);
    await price.fill("1250.25");
    
    await expect(page.getByTestId("sale-total")).toHaveText("Rs. 2,500.50");
    const record = page.getByRole("button", { name: "Create Invoice", exact: true });
    await record.hover();
    await page.mouse.down();
    await expectReadableContrast(page);
    await page.mouse.up();
    await expect(page.getByRole("dialog", { name: "Sample Invoice" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Sample Invoice" }).getByTestId("receipt-total")).toHaveText("Rs. 2,500.50");
    await expect(page.getByRole("dialog", { name: "Sample Invoice" })).toContainText("No sale, payment or stock change was saved");
    await page.getByRole("dialog", { name: "Sample Invoice" }).getByRole("button", { name: "Done", exact: true }).click();
    await expect(product).toBeFocused();
    await expect(price).toHaveCount(0);
    await page.getByLabel("Theme", { exact: true }).selectOption("system");
    const opposite = theme === "light" ? "dark" : "light";
    await page.emulateMedia({ colorScheme: opposite });
    await expect(page.locator("html")).toHaveAttribute("data-theme", opposite);
    if (page.url().includes("/admin/") && page.viewportSize()!.width < 1024) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("link", { name: "Exit Demo", exact: true }).click();
  if (await page.getByRole("dialog", { name: "Leave this page?", exact: true }).isVisible()) await page.getByRole("link", { name: "Leave page", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await page.reload();
    await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
    await expect(page.locator("html")).toHaveAttribute("data-theme", opposite);
    await expectReadableContrast(page);
    expect(await page.context().cookies()).toEqual([]);
    expect(await page.evaluate(() => Object.entries(sessionStorage))).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key !== "pos-theme"))).toEqual([]);
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}
