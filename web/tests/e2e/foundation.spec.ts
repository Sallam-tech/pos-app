import { expect, test } from "@playwright/test";

test("production page and health endpoint work with public requests blocked", async ({
  page,
  baseURL,
}) => {
  const externalRequests: string[] = [];
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) {
      return route.continue();
    }
    externalRequests.push(url.href);
    return route.abort();
  });

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Shop POS | Foundation");
  await expect(
    page.getByRole("heading", { level: 1, name: "Project foundation" }),
  ).toBeVisible();
  const healthLink = page.getByRole("link", { name: "Check server health" });
  await expect(healthLink).toHaveAttribute("href", "/api/health");

  // Catch a missing Tailwind/shadcn style pipeline and small-screen overflow.
  await expect(healthLink).toHaveCSS("display", "inline-flex");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.reload();
  await healthLink.click();
  await expect(page).toHaveURL(/\/api\/health$/);
  const health = await page.evaluate(() => JSON.parse(document.body.innerText));
  expect(health).toEqual({ status: "ok", service: "pos-web" });
  expect(externalRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});
