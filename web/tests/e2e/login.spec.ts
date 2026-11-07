import { expect, test } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

const observations = new WeakMap<object, {
  external: string[];
  errors: string[];
  requests: { method: string; url: string; body: string | null }[];
}>();

test.beforeEach(async ({ page, baseURL }) => {
  const observed = { external: [] as string[], errors: [] as string[], requests: [] as { method: string; url: string; body: string | null }[] };
  observations.set(page, observed);
  page.on("pageerror", (error) => observed.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|did not match/i.test(message.text())) observed.errors.push(message.text());
  });
  page.on("request", (request) => observed.requests.push({ method: request.method(), url: request.url(), body: request.postData() }));
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue();
    observed.external.push(route.request().url());
    return route.abort();
  });
});
test.afterEach(async ({ page }) => {
  expect.soft(observations.get(page)?.external).toEqual([]);
  expect.soft(observations.get(page)?.errors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 375, 768, 1024, 1440]) {
    test("Login " + theme + " at " + width + "px", async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((value) => localStorage.setItem("pos-theme", value), theme);
      await page.goto("/login");
      await expect(page).toHaveTitle("Login | Shop POS");
      await expect(page.getByRole("heading", { name: "Shop POS", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "Shop POS", exact: true })).toBeVisible();
      await expect(page.getByText("UI Preview", { exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const password = page.getByLabel("Password", { exact: true });
      const submit = page.getByRole("button", { name: "Open Shop", exact: true });
      await expect(submit).toBeEnabled();
      await expect(password).toHaveAttribute("type", "password");
      for (const field of [password]) {
        expect(await field.evaluate((element) => {
          const input = element as HTMLInputElement;
          const style = getComputedStyle(input);
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d")!;
          context.font = style.font;
          return context.measureText(input.placeholder).width <= input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        })).toBe(true);
      }
      const bounds = await Promise.all([password, submit].map((control) => control.boundingBox()));
      for (const box of bounds) expect(box).not.toBeNull();
      expect(Math.abs(bounds[0]!.x - bounds[1]!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(bounds[0]!.width - bounds[1]!.width)).toBeLessThanOrEqual(1);
      expect(bounds[1]!.height).toBeGreaterThanOrEqual(56);
      const card = await page.locator("main > div").boundingBox();
      expect(Math.abs(card!.x + card!.width / 2 - width / 2)).toBeLessThanOrEqual(1);
      const controls = await page.locator("main input,main button,main a,header select").evaluateAll((items) => items.map((item) => {
        const r = item.getBoundingClientRect();
        return { width: r.width, height: r.height };
      }));
      for (const box of controls) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expectReadableContrast(page);
      await page.screenshot({ path: testInfo.outputPath("login-" + theme + "-" + width + ".png"), fullPage: true, scale: "css" });
    });
  }

  test("Login validation and loading/error preview in " + theme, async ({ page }, testInfo) => {
    await page.clock.install({ time: new Date("2026-11-01T09:00:00Z") });
    await page.clock.pauseAt(new Date("2026-11-01T09:00:01Z"));
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/login");
    const password = page.getByLabel("Password", { exact: true });
    const submit = page.getByRole("button", { name: "Open Shop", exact: true });
    await submit.click();
    await expect(password).toBeFocused();
    await expect(password).toHaveAccessibleDescription("Enter a password.");
    await expect(page.getByText("Check the form", { exact: true })).toBeVisible();
    await expectReadableContrast(page);
    await page.screenshot({ path: testInfo.outputPath("login-validation-" + theme + ".png"), fullPage: true, scale: "css" });
    await submit.click();
    await expect(password).toBeFocused();
    await password.fill("not-a-real-password");
    await page.getByRole("button", { name: "Show password", exact: true }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("not-a-real-password");
    await page.getByRole("button", { name: "Hide password", exact: true }).click();
    await expect(password).toHaveAttribute("type", "password");
    await submit.click();
    const loading = page.getByRole("button", { name: "Previewing…", exact: true });
    await expect(loading).toBeDisabled();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect(password).toHaveValue("");
    await expect(page.getByText("Loading preview only. No sign-in request is sent.", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("login-loading-" + theme + ".png"), fullPage: true, scale: "css" });
    await page.clock.runFor(700);
    const error = page.getByRole("form", { name: "Login UI preview" }).getByRole("alert");
    await expect(error).toHaveText(/Sign-in is unavailable in this UI preview/);
    await expect(error).toBeFocused();
    await expect(page).toHaveURL("/login");
    await expect(submit).toBeEnabled();
    await expectReadableContrast(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("login-unavailable-" + theme + ".png"), fullPage: true, scale: "css" });
    const requests = observations.get(page)!.requests;
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(JSON.stringify(requests)).not.toMatch(/preview-user-only|not-a-real-password|\/api\/auth/);
    expect(await page.evaluate(() => Object.entries(sessionStorage))).toEqual([]);
    expect(await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key !== "pos-theme"))).toEqual([]);
    expect(await page.context().cookies()).toEqual([]);
    await page.reload();
    await expect(password).toHaveValue("");
  });
}

test("Login keyboard order, visible focus and password toggle", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  for (const control of [
    page.getByLabel("Password", { exact: true }),
    page.getByRole("button", { name: "Show password", exact: true }),
    page.getByRole("button", { name: "Open Shop", exact: true }),
  ]) {
    await page.keyboard.press("Tab");
    await expect(control).toBeFocused();
    await expect(control).toHaveCSS("outline-width", "3px");
    await expect(control).toHaveCSS("outline-style", "solid");
  }
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password", exact: true })).toBeFocused();
});

test("Login theme preference persists and System responds live", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  const theme = page.getByLabel("Theme", { exact: true });
  await theme.selectOption("dark");
  await page.reload();
  await expect(theme).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await theme.selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(theme).toHaveValue("system");
});

test("Login stays a disabled safe preview without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  try {
    await page.goto(baseURL + "/login");
    await expect(page).toHaveTitle("Login | Shop POS");
    await expect(page.getByLabel("Password", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Open Shop", exact: true })).toBeDisabled();
    await expect(page.getByText("JavaScript is required to try the form preview.", { exact: false })).toBeVisible();
    await expect(page.locator("form input[name]")).toHaveCount(0);
    expect(requests.every((url) => !new URL(url).search)).toBe(true);
  } finally { await context.close(); }
});

test("Login supports 200 percent scale, reduced motion and short viewports", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 600 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/login");
  await page.addStyleTag({ content: "html { zoom: 2; }" });
  await page.getByRole("button", { name: "Open Shop", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
});

test("Login server status is compact and never claims an auth result", async ({ page }) => {
  let connected = false;
  await page.route("**/api/health", (route) => connected
    ? route.fulfill({ json: { status: "ok", service: "pos-web" } })
    : route.abort("connectionreset"));
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/login");
  const indicator = page.locator("[data-connectivity-state]");
  await expect(indicator).toHaveAttribute("data-connectivity-state", "disconnected");
  await expect(page.getByText("Cannot reach shop server", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Shop", exact: true })).toBeEnabled();
  await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
  connected = true;
  await page.getByRole("button", { name: "Check shop server connection" }).click();
  await expect(indicator).toHaveAttribute("data-connectivity-state", "connected");
  expect((await indicator.boundingBox())!.height).toBeLessThanOrEqual(44);
  await expect(page.getByText("UI Preview", { exact: true })).toBeVisible();
});
