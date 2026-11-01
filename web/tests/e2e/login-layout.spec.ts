import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";

const observations = new WeakMap<Page, { external: string[]; errors: string[] }>();
test.beforeEach(async ({ page, baseURL }) => {
  const observed = { external: [] as string[], errors: [] as string[] };
  observations.set(page, observed);
  page.on("pageerror", (error) => observed.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|did not match/i.test(message.text())) observed.errors.push(message.text());
  });
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

async function reachable(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeInViewport({ ratio: 1 });
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector("main > div > div")!;
    const button = document.querySelector('button[type="submit"]')!;
    const r = card.getBoundingClientRect(), b = button.getBoundingClientRect();
    return {
      width: innerWidth, height: innerHeight, cardTop: r.top, cardHeight: r.height,
      cardBottom: r.bottom, cardCenter: r.x + r.width / 2, signInBottom: b.bottom,
      documentHeight: document.documentElement.scrollHeight,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      clippedAncestors: [document.body, document.querySelector("main")!, card,
        document.querySelector("form")!, document.querySelector("fieldset")!]
        .filter((node) => ["hidden", "clip", "auto", "scroll"].includes(getComputedStyle(node).overflowY))
        .map((node) => node.tagName),
    };
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [320, 375, 768, 1024, 1440]) {
    test("Login vertical layout " + theme + " at " + width + "px", async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((mode) => localStorage.setItem("pos-theme", mode), theme);
      const rows: (Awaited<ReturnType<typeof measure>> & { state: "idle" | "validation" | "unavailable" })[] = [];
      for (const height of [600, 720, 768]) {
        await page.setViewportSize({ width, height });
        await page.goto("/login");
        const username = page.getByLabel("Username", { exact: true });
        const password = page.getByLabel("Password", { exact: true });
        const submit = page.getByRole("button", { name: "Sign In", exact: true });
        await expect(submit).toBeEnabled();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        for (const state of ["idle", "validation", "unavailable"] as const) {
          await test.step(height + "px / " + state, async () => {
            if (state === "validation") {
              await username.focus();
              await page.keyboard.press("Enter");
              await expect(username).toBeFocused();
              await expect(username).toHaveAccessibleDescription("Enter a username.");
              await expect(password).toHaveAccessibleDescription("Enter a password.");
            }
            if (state === "unavailable") {
              await username.fill("layout-preview-only");
              await password.fill("layout-preview-only");
              await submit.click();
              const error = page.getByRole("form").getByRole("alert").filter({ hasText: "Sign-in is unavailable" });
              await expect(error).toBeFocused();
              await expect(submit).toBeEnabled();
            }
            await page.evaluate(() => scrollTo(0, 0));
            const row = await measure(page);
            rows.push({ state, ...row });
            expect(row.horizontalOverflow).toBe(false);
            expect(row.clippedAncestors).toEqual([]);
            expect(row.cardTop).toBeGreaterThanOrEqual(8);
            expect(Math.abs(row.cardCenter - width / 2)).toBeLessThanOrEqual(1);
            // The complete card fits a laptop at 600px in the idle state,
            // and at 720/768px with current expanded errors.
            if (width >= 1024 && (state === "idle" || height >= 720)) {
              expect(row.cardBottom).toBeLessThanOrEqual(height);
              expect(row.signInBottom).toBeLessThanOrEqual(height - 8);
            }
            if (width >= 768 && state === "idle" && height >= 720) {
              expect(row.documentHeight).toBe(height);
            }
            const controls = await page.locator("input,main button,header select,main a").evaluateAll((items) =>
              items.map((item) => ({ width: item.getBoundingClientRect().width, height: item.getBoundingClientRect().height })));
            for (const box of controls) {
              expect(box.width).toBeGreaterThanOrEqual(44);
              expect(box.height).toBeGreaterThanOrEqual(44);
            }
            expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(56);
            await expectReadableContrast(page);
            const name = "login-" + theme + "-" + width + "x" + height + "-" + state;
            await page.screenshot({ path: testInfo.outputPath(name + ".png"), scale: "css" });
            if (height === 600 && [320, 1440].includes(width) && state === "validation") {
              await page.screenshot({ path: testInfo.outputPath(name + "-full.png"), fullPage: true, scale: "css" });
            }
            // Prove that off-screen content can be reached through normal
            // document scrolling, without an inner form/card scroll area.
            const alerts = page.getByRole("form").getByRole("alert");
            for (const alert of await alerts.all()) await reachable(alert);
            for (const control of [username, password,
              page.getByRole("button", { name: "Show password", exact: true }), submit,
              page.getByRole("button", { name: "Check shop server connection" }),
              page.getByRole("link", { name: "Admin shell", exact: true }),
              page.getByRole("link", { name: "Salesperson shell", exact: true }),
              page.getByRole("contentinfo"), page.getByText("Shop POS", { exact: true })]) {
              await reachable(control);
            }
          });
        }
      }
      await testInfo.attach("layout-measurements", { body: JSON.stringify(rows, null, 2), contentType: "application/json" });
      const fs = await import("node:fs/promises");
      await fs.writeFile(testInfo.outputPath("layout-measurements.json"), JSON.stringify(rows, null, 2));
    });
  }

  test("Login vertical scroll and keyboard at 200 percent in " + theme, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 640, height: 600 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/login");
    await page.addStyleTag({ content: "html { zoom: 2; }" });
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
    await page.keyboard.press("Tab");
    const username = page.getByLabel("Username", { exact: true });
    const password = page.getByLabel("Password", { exact: true });
    await expect(username).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(username).toBeFocused();
    const alerts = page.getByRole("form").getByRole("alert");
    for (const alert of await alerts.all()) await reachable(alert);
    await username.focus();
    await username.fill("layout-preview-only");
    await page.keyboard.press("Tab");
    await expect(password).toBeFocused();
    await password.fill("layout-preview-only");
    await page.keyboard.press("Tab");
    const toggle = page.getByRole("button", { name: "Show password", exact: true });
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Space");
    await expect(password).toHaveAttribute("type", "text");
    await page.keyboard.press("Tab");
    const submit = page.getByRole("button", { name: "Sign In", exact: true });
    await expect(submit).toBeFocused();
    await expect(submit).toBeInViewport({ ratio: 1 });
    await expect(submit).toHaveCSS("outline-width", "3px");
    await page.keyboard.press("Enter");
    const error = page.getByRole("form").getByRole("alert").filter({ hasText: "Sign-in is unavailable" });
    await expect(error).toBeFocused();
    await expect(error).toBeInViewport({ ratio: 1 });
    expect((await measure(page)).horizontalOverflow).toBe(false);
    expect((await measure(page)).clippedAncestors).toEqual([]);
    await expectReadableContrast(page);
    expect(await error.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit !== null && element.contains(hit);
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("login-" + theme + "-200-percent-error-viewport.png"), scale: "css" });
    // Check the actual document scroll range on both device projects.
    // Keyboard navigation/focus is checked above, independently of browser shortcuts.
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await expect(page.getByRole("contentinfo")).toBeInViewport({ ratio: 1 });
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(page.getByText("Shop POS", { exact: true })).toBeInViewport({ ratio: 1 });
    // Capture from the top: a full-page capture while scrolled can paint
    // otherwise off-screen fixed elements into the stitched image.
    await page.screenshot({ path: testInfo.outputPath("login-" + theme + "-200-percent-full.png"), fullPage: true, scale: "css" });
    expect(new URL(page.url()).pathname).toBe("/login");
  });
}

