import { expect, test, type Page } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

const observations = new WeakMap<Page, { external: string[]; mutations: string[]; errors: string[] }>();
test.beforeEach(async ({ page, baseURL }) => {
  const observed = { external: [] as string[], mutations: [] as string[], errors: [] as string[] };
  observations.set(page, observed);
  page.on("pageerror", (error) => observed.errors.push(error.message));
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) observed.mutations.push(request.method() + " " + request.url());
  });
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue();
    observed.external.push(route.request().url());
    return route.abort();
  });
});
test.afterEach(async ({ page }) => {
  expect(observations.get(page)).toEqual({ external: [], mutations: [], errors: [] });
});

async function selectProduct(page: Page, query = "dia", name = "Diapers") {
  const product = page.getByRole("combobox", { name: "Product" });
  await product.fill(query);
  const option = page.getByRole("option", { name, exact: true });
  if (test.info().project.name === "mobile-chromium") await option.tap();
  else await option.click();
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectSafePreview(page: Page) {
  expect(await page.locator("body").innerText()).not.toMatch(/purchase cost|remaining stock|profit|sale recorded/i);
  expect(await page.content()).not.toMatch(/stockOnHand|currentCost|unitCostSnapshot|grossProfit|availableQuantity/);
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 375, 768, 1024, 1440]) {
    test("POS " + theme + " at " + width + "px: entry, errors, simulation and reset", async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width >= 1024 ? 768 : 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((mode) => localStorage.setItem("pos-theme", mode), theme);
      const response = await page.goto("/pos");
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle("Record Sale | Shop POS");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByText("Mock UI", { exact: true })).toBeVisible();
      await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
      await expectNoOverflow(page);
      await expectReadableContrast(page);
      await expectSafePreview(page);
      const sizes = await page.locator("a,button,input,select,summary").evaluateAll((elements) => elements.filter((e) => e.getClientRects().length).map((e) => {
        const r = e.getBoundingClientRect();
        return { label: e.getAttribute("aria-label") ?? e.textContent?.trim(), width: r.width, height: r.height };
      }));
      for (const size of sizes) {
        expect(size.width, JSON.stringify(size)).toBeGreaterThanOrEqual(44);
        expect(size.height, JSON.stringify(size)).toBeGreaterThanOrEqual(44);
      }
      expect((await page.getByRole("button", { name: "Record Sale", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(56);
      await page.screenshot({ path: testInfo.outputPath("pos-entry-" + theme + "-" + width + ".png"), fullPage: true, scale: "css" });

      await page.getByLabel("Quantity", { exact: true }).fill("0");
      await page.getByRole("button", { name: "Record Sale", exact: true }).click();
      await expect(page.getByRole("combobox", { name: "Product", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(3);
      await expectReadableContrast(page);
      await expectNoOverflow(page);
      await page.screenshot({ path: testInfo.outputPath("pos-errors-" + theme + "-" + width + ".png"), fullPage: true, scale: "css" });

      await selectProduct(page);
      await page.getByLabel("Quantity", { exact: true }).fill("2");
      await page.getByLabel("Selling price per unit (PKR)").fill("1,200.50");
      await expect(page.getByTestId("sale-total")).toHaveText("Rs. 2,401.00");
      await page.getByRole("button", { name: "Record Sale", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Sale simulation complete" })).toBeFocused();
      await expect(page.getByTestId("confirmation-quantity")).toHaveText("2");
      await expect(page.getByTestId("confirmation-price")).toHaveText("Rs. 1,200.50");
      await expect(page.getByTestId("confirmation-total")).toHaveText("Rs. 2,401.00");
      await expect(page.getByText("Diapers", { exact: true })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "No sale was recorded." })).toContainText("No sale was recorded.");
      await expectSafePreview(page);
      await expectNoOverflow(page);
      await expectReadableContrast(page);
      await page.screenshot({ path: testInfo.outputPath("pos-confirmation-" + theme + "-" + width + ".png"), fullPage: true, scale: "css" });

      await page.getByRole("button", { name: "New Sale", exact: true }).click();
      await expect(page.getByRole("combobox", { name: "Product", exact: true })).toBeFocused();
      await expect(page.getByRole("combobox", { name: "Product", exact: true })).toHaveValue("");
      await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("1");
      await expect(page.getByLabel("Selling price per unit (PKR)")).toHaveValue("");
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    });
  }
}

test("POS keyboard search, list navigation, escape, stepper and deliberate submit", async ({ page }) => {
  await page.goto("/pos");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  const product = page.getByRole("combobox", { name: "Product", exact: true });
  await expect(product).toBeFocused();
  await expect(product).toHaveCSS("outline-width", "3px");
  await product.fill("not-a-product");
  await expect(page.getByText("No matching mock products. Try another name.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(product).toHaveAttribute("aria-expanded", "false");
  await product.fill("MILK");
  await expect(page.getByRole("listbox", { name: "Mock products" }).getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(product).toHaveValue("Milk Powder");
  await expect(page.getByRole("form")).toBeVisible();
  await product.fill("");
  await page.keyboard.press("End");
  await expect(product).toHaveAttribute("aria-activedescendant", "sale-option-mock-rice");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await expect(product).toHaveAttribute("aria-activedescendant", "sale-option-mock-wipes");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(product).toHaveValue("Diapers");
  await page.keyboard.press("Tab"); // The unavailable decrement is skipped at quantity 1.
  await expect(page.getByLabel("Quantity", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Increase quantity by one" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("2");
  await page.keyboard.press("Tab");
  await page.keyboard.type("0.10");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Record Sale", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Sale simulation complete" })).toBeFocused();
  await page.keyboard.press("Enter"); // A confirmation heading cannot resubmit the old form.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "New Sale" })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(product).toHaveValue("");
});

test("POS numeric errors, exact fractional/large totals, zero example and invalidated selection", async ({ page }) => {
  await page.goto("/pos");
  await selectProduct(page, "rice", "Rice");
  await page.getByLabel("Quantity", { exact: true }).fill("0.125");
  await page.getByLabel("Selling price per unit (PKR)").fill("0.10");
  await expect(page.getByTestId("sale-total")).toHaveText("Rs. 0.0125");
  await page.getByRole("button", { name: "Increase quantity by one" }).click();
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("1.125");
  await page.getByRole("button", { name: "Decrease quantity by one" }).click();
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("0.125");
  await page.getByLabel("Selling price per unit (PKR)").fill("1,20");
  await page.getByRole("button", { name: "Record Sale", exact: true }).click();
  await expect(page.getByLabel("Selling price per unit (PKR)")).toBeFocused();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("non-negative PKR amount");
  await page.getByLabel("Quantity", { exact: true }).fill("999999999999");
  await page.getByLabel("Selling price per unit (PKR)").fill("999999999999");
  await expect(page.getByTestId("sale-total")).toHaveText("Rs. 999,999,999,998,000,000,000,001.00");
  await expectNoOverflow(page);
  await page.getByLabel("Quantity", { exact: true }).fill("0.125");
  await page.getByLabel("Selling price per unit (PKR)").fill("0");
  await page.getByRole("combobox", { name: "Product", exact: true }).fill("Rice edited");
  await page.getByRole("button", { name: "Record Sale", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Product", exact: true })).toHaveAttribute("aria-invalid", "true");
  await selectProduct(page, "rice", "Rice");
  await page.getByRole("button", { name: "Record Sale", exact: true }).click();
  await expect(page.getByTestId("confirmation-total")).toHaveText("Rs. 0.00");
  await page.getByRole("button", { name: "New Sale" }).click();
  await selectProduct(page, "soap", "Hand Soap");
  await page.getByLabel("Selling price per unit (PKR)").fill("25");
  await page.getByRole("button", { name: "Record Sale", exact: true }).click();
  await expect(page.getByText("Hand Soap", { exact: true })).toBeVisible();
  await expect(page.getByTestId("confirmation-total")).toHaveText("Rs. 25.00");
});

test("POS System changes and reload retain theme but never retain a simulated sale", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/pos");
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await selectProduct(page);
  await page.getByLabel("Selling price per unit (PKR)").fill("100");
  await page.getByRole("button", { name: "Record Sale", exact: true }).click();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["pos-theme"]);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Product", exact: true })).toHaveValue("");
  await expect(page.getByLabel("Selling price per unit (PKR)")).toHaveValue("");
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("POS remains an explicitly local simulation when advisory health fails", async ({ page }) => {
  await page.route("**/api/health", (route) => route.abort("connectionreset"));
  await page.goto("/pos");
  await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "disconnected");
  await selectProduct(page);
  await page.getByLabel("Selling price per unit (PKR)").fill("10");
  await page.getByRole("button", { name: "Record Sale", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sale simulation complete" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "No sale was recorded." })).toContainText("No sale was recorded.");
});

test("POS 200 percent scale reflows, long values and expanded notes remain reachable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 640, height: 600 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/pos");
  await page.addStyleTag({ content: "html { zoom: 2; }" });
  await selectProduct(page);
  await page.getByLabel("Quantity", { exact: true }).fill("999999999999");
  await page.getByLabel("Selling price per unit (PKR)").fill("999999999999");
  await page.locator("summary").click();
  await expectNoOverflow(page);
  await page.getByRole("button", { name: "Record Sale", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Record Sale", exact: true })).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("pos-dark-200-percent.png"), fullPage: true, scale: "css" });
  await page.getByRole("button", { name: "Record Sale", exact: true }).click();
  await expect(page.getByTestId("confirmation-total")).toHaveText("Rs. 999,999,999,998,000,000,000,001.00");
  await expectNoOverflow(page);
  await page.getByRole("button", { name: "New Sale" }).click();
  await expect(page.getByRole("combobox", { name: "Product", exact: true })).toBeFocused();
});

test("POS without JavaScript cannot submit a native form or claim a sale", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL + "/pos");
  await expect(page.getByRole("button", { name: "Record Sale", exact: true })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Product", exact: true })).toBeDisabled();
  await expect(page.getByText("Enable JavaScript to use this simulated form. No sale can be recorded here.")).toBeVisible();
  await context.close();
});

for (const theme of ["light", "dark"] as const) {
  test("POS price precision: typing, paste, click and Enter in " + theme, async ({ page, context }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((mode) => localStorage.setItem("pos-theme", mode), theme);
    await page.goto("/pos");
    await selectProduct(page);
    await page.getByLabel("Quantity", { exact: true }).fill("2");
    const price = page.getByLabel("Selling price per unit (PKR)");
    const message = page.getByText("Enter a price with no more than 2 decimal places.", { exact: true });

    await price.pressSequentially("100.999");
    await expect(price).toHaveValue("100.999");
    await expect(price).toHaveAttribute("aria-invalid", "true");
    await expect(message).toBeVisible();
    await expect(page.getByTestId("sale-total")).toHaveText("—");
    await page.getByRole("button", { name: "Record Sale", exact: true }).click();
    await expect(price).toBeFocused();
    await price.press("Enter");
    await expect(page.getByRole("heading", { name: "Sale simulation complete" })).toHaveCount(0);
    await expect(price).toHaveValue("100.999");

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    // All concurrent contexts use the same payload to avoid OS clipboard races.
    await page.evaluate(() => navigator.clipboard.writeText("0.001"));
    await price.fill("");
    await price.press("Control+V");
    await expect(price).toHaveValue("0.001");
    await expect(message).toBeVisible();
    await page.getByRole("button", { name: "Record Sale", exact: true }).click();
    await price.press("Enter");
    await expect(price).toHaveValue("0.001");
    await expect(page.getByRole("heading", { name: "Sale simulation complete" })).toHaveCount(0);
    await expect(page.getByRole("form", { name: "Record sale preview" })).toBeVisible();
    await expectNoOverflow(page);
    await expectReadableContrast(page);

    for (const [value, unitPrice, total] of [
      ["100", "Rs. 100.00", "Rs. 200.00"],
      ["100.5", "Rs. 100.50", "Rs. 201.00"],
      ["100.50", "Rs. 100.50", "Rs. 201.00"],
      ["100.99", "Rs. 100.99", "Rs. 201.98"],
      ["1250.25", "Rs. 1,250.25", "Rs. 2,500.50"],
    ]) {
      await price.fill("");
      await price.pressSequentially(value);
      await expect(price).toHaveValue(value);
      await expect(message).toHaveCount(0);
      await expect(price).not.toHaveAttribute("aria-invalid", "true");
      await expect(page.getByTestId("sale-total")).toHaveText(total);
      await price.press("Enter");
      await expect(page.getByTestId("confirmation-price")).toHaveText(unitPrice);
      await expect(page.getByTestId("confirmation-total")).toHaveText(total);
      await page.getByRole("button", { name: "New Sale" }).click();
      await selectProduct(page);
      await page.getByLabel("Quantity", { exact: true }).fill("2");
    }
  });
}
