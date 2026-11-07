import { expect, test } from "@playwright/test";

test("root opens Login and the local health endpoint works without public internet", async ({ page, baseURL }) => {
  const external: string[] = [], errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL("/login");
  await expect(page).toHaveTitle("Login | Shop POS");
  await expect(page.getByRole("heading", { name: "Shop POS", exact: true })).toBeVisible();
  const admin = page.getByRole("link", { name: "Preview Admin", exact: true });
  await expect(admin).toHaveAttribute("href", "/admin/dashboard");
  expect(await admin.evaluate((element) => getComputedStyle(element).display)).toMatch(/^(inline-)?flex$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page).toHaveURL("/login");
  await expect(admin).toBeVisible();
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok", service: "pos-web" });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
