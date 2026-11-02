import { expect, test, type Route } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

declare global {
  interface Window { posThemeFrames: string[]; }
}

const routes = [
  { path: "/login", heading: "Login", name: "login" },
  { path: "/admin/dashboard", heading: "Dashboard", name: "admin" },
  { path: "/pos", heading: "Record sale", name: "pos" },
];
const widths = [320, 375, 768, 1024, 1440];

test.beforeEach(async ({ page, baseURL }) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|did not match/i.test(message.text())) errors.push(message.text());
  });
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  // Keep these assertions attached to each page, including navigation/reloads.
  test.info().annotations.push({ type: "network", description: "Public requests are blocked; only the local origin is allowed." });
  observations.set(page, { external, errors });
});

const observations = new WeakMap<object, { external: string[]; errors: string[] }>();
test.afterEach(async ({ page }) => {
  const observed = observations.get(page);
  expect.soft(observed?.external ?? []).toEqual([]);
  expect.soft(observed?.errors ?? []).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  for (const width of widths) {
    test(theme + " shells at " + width + "px", async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((mode) => localStorage.setItem("pos-theme", mode), theme);
      for (const route of routes) {
        await test.step(route.path, async () => {
          const response = await page.goto(route.path);
          expect(response?.status()).toBe(200);
          await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible();
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          await expect(page.getByText(route.name === "admin" ? "Demo Data" : "Mock UI", { exact: true })).toBeVisible();
          await expect(page.locator("[data-connectivity-state]")).toHaveAttribute("data-connectivity-state", "connected");
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
          if (route.name === "admin") {
            await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible({ visible: width < 1024 });
            await expect(page.getByRole("complementary", { name: "Admin sidebar" })).toBeVisible({ visible: width >= 1024 });
          }
          const sizes = await page.locator("a,button,input,select,textarea").evaluateAll((elements) => elements.filter((e) => e.getClientRects().length > 0).map((e) => {
            const r = e.getBoundingClientRect();
            return { label: e.getAttribute("aria-label") ?? e.textContent?.trim().slice(0, 40), width: r.width, height: r.height };
          }));
          for (const control of sizes) {
            expect(control.width, JSON.stringify(control)).toBeGreaterThanOrEqual(44);
            expect(control.height, JSON.stringify(control)).toBeGreaterThanOrEqual(44);
          }
          await expectReadableContrast(page);
          if (route.name === "pos") {
            expect(await page.locator("body").innerText()).not.toMatch(/purchase cost|remaining stock|profit/i);
            expect(await response!.text()).not.toMatch(/stockOnHand|currentCost|unitCostSnapshot|grossProfit/);
            await expect(page.getByRole("form", { name: "Record sale preview" })).toHaveCount(1);
          }
          await page.screenshot({ path: testInfo.outputPath(route.name + "-" + theme + "-" + width + ".png"), fullPage: true, scale: "css" });
        });
      }
    });
  }
}

test("theme survives route navigation and refresh", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { name: "Admin shell", exact: true }).click();
  await expect(page).toHaveURL("/admin/dashboard");
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/login");
  await page.getByRole("link", { name: "Salesperson shell", exact: true }).click();
  await expect(page).toHaveURL("/pos");
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("dark");
  expect(await page.evaluate(() => localStorage.getItem("pos-theme"))).toBe("dark");
});

test("System follows OS changes while explicit themes remain fixed", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("stored theme is applied before body paint and hydration", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    localStorage.setItem("pos-theme", "dark");
    const tracked = window;
    tracked.posThemeFrames = [];
    const sample = () => {
      if (document.body) tracked.posThemeFrames.push(document.documentElement.dataset.theme ?? "unset");
      if (tracked.posThemeFrames.length < 12) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.goto("/login");
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("dark");
  await expect.poll(() => page.evaluate(() => window.posThemeFrames.length)).toBe(12);
  expect(await page.evaluate(() => window.posThemeFrames)).toEqual(Array(12).fill("dark"));
});

test("theme selection remains usable with browser storage denied", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Blocked", "SecurityError"); } });
  });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { name: "Salesperson shell", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("system");
});

test("Admin navigation dialog labels, focus loop, Escape and focus restoration in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/dashboard");
  const opener = page.getByRole("button", { name: "Open navigation" });
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Admin navigation", exact: true });
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole("button", { name: "Close dialog", exact: true });
    const last = dialog.getByRole("link", { name: "Products", exact: true });
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(last).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await expectReadableContrast(page);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    await opener.click();
    await dialog.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
  }
});

test("mobile drawer closes, traps focus and restores its trigger", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto("/admin/dashboard");
  const trigger = page.locator('button[aria-label="Open navigation"]');
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Admin navigation", exact: true });
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  for (let step = 0; step < 12; step++) {
    await page.keyboard.press(step % 2 ? "Shift+Tab" : "Tab");
    expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("local health states are advisory and independent of navigator.onLine", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "onLine", { get: () => false }));
  let mode = "hold";
  let held: Route | undefined;
  await page.route("**/api/health", async (route) => {
    if (mode === "hold") { held = route; return; }
    if (mode === "fail") return route.abort("connectionreset");
    if (mode === "unknown") return route.fulfill({ json: { status: "unexpected" } });
    return route.fulfill({ json: { status: "ok", service: "pos-web" } });
  });
  await page.goto("/login");
  const indicator = page.locator("[data-connectivity-state]");
  await expect(indicator).toHaveAttribute("data-connectivity-state", "checking");
  await expect.poll(() => Boolean(held)).toBe(true);
  await held!.fulfill({ json: { status: "ok", service: "pos-web" } });
  await expect(indicator).toHaveAttribute("data-connectivity-state", "connected");
  for (const [next, expected] of [["fail", "disconnected"], ["unknown", "unknown"], ["ok", "connected"]]) {
    mode = next;
    await page.getByRole("button", { name: "Check shop server connection" }).click();
    await expect(indicator).toHaveAttribute("data-connectivity-state", expected);
  }
  await expect(page.getByText(/Advisory only/)).toHaveText(/does not confirm a transaction/);
  await expect(page.getByRole("link", { name: "Salesperson shell", exact: true })).toBeEnabled();
});

test("keyboard skip link and visible focus reach Login and the Admin preview", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.keyboard.press("Tab");
  const username = page.getByLabel("Username", { exact: true });
  await expect(username).toBeFocused();
  await expect(username).toHaveCSS("outline-width", "3px");
  const admin = page.getByRole("link", { name: "Admin shell", exact: true });
  await admin.focus();
  await expect(admin).toBeFocused();
  await expect(admin).toHaveCSS("outline-style", "solid");
  await expect(admin).toHaveCSS("outline-width", "3px");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/admin/dashboard");
});

test("200 percent scale and reduced motion preserve shell controls", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/admin/dashboard");
  await page.addStyleTag({ content: "html { zoom: 2; }" });
  await expect(page.getByLabel("Theme", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  const dialog = page.getByRole("dialog", { name: "Admin navigation", exact: true });
  await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Products", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
