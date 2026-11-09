import { expect, test, type Page } from "@playwright/test";
import { expectReadableContrast } from "./support/contrast";
const lines = ["Developed by SalamTech", "AbdulSalam · +92-310-3698984"];
const faults = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const found: string[] = []; faults.set(page, found); page.on("pageerror", (error) => found.push(error.message)); });
test.afterEach(({ page }) => expect(faults.get(page)).toEqual([]));
async function ready(page: Page, route: string) {
  await page.goto(route); await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Shop server connected", { exact: true })).toBeVisible();
}
for (const theme of ["light", "dark"] as const) {
  test("shared Login navigation and sidebar branding in " + theme, async ({ page }, info) => {
    const desktop = info.project.name === "chromium";
    await page.addInitScript((mode) => localStorage.setItem("pos-theme", mode), theme);
    await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
    for (const [route, role, parent, parentName] of [["/admin/settings", "Admin", "/admin/dashboard", "Back to Dashboard"], ["/pos/history", "Salesperson", "/pos", "Back to Make a Sale"]]) {
      await ready(page, route);
      const header = page.getByRole("banner"), back = header.getByRole("link", { name: "Back to Login", exact: true });
      await expect(header).toHaveCSS("background-color", "rgb(25, 39, 53)");
      await expect(back).toHaveCSS("color", "rgb(255, 255, 255)"); await expect(back).toHaveAttribute("href", "/login");
      await expect(back).toHaveCSS("border-top-width", "1px");
      const themeControl = header.getByLabel("Theme", { exact: true });
      expect(await back.evaluate((node) => { const theme = node.closest("header")!.querySelector("select")!; return Boolean(theme.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING); })).toBe(true);
      if (desktop) {
        const aside = page.getByRole("complementary", { name: role + " sidebar" });
        await expect(aside.locator("[data-developer-credit] p")).toHaveText(lines);
        await aside.evaluate((node) => node.scrollTo(0, node.scrollHeight));
        const [branding, exit] = await Promise.all([aside.locator("[data-developer-credit]").boundingBox(), aside.getByRole("link", { name: "Exit Demo" }).boundingBox()]);
        expect(branding!.y).toBeGreaterThanOrEqual(exit!.y + exit!.height); expect(branding!.y + branding!.height).toBeLessThanOrEqual(900);
        const [themeBox, backBox] = await Promise.all([themeControl.boundingBox(), back.boundingBox()]);
        expect(backBox!.x).toBeGreaterThan(themeBox!.x + themeBox!.width); expect(backBox!.height).toBeGreaterThanOrEqual(44);
      } else if (role === "Admin") {
        await page.getByRole("button", { name: "Open navigation", exact: true }).click();
        const drawer = page.getByRole("dialog", { name: "Admin navigation" }); await expect(drawer.locator("[data-developer-credit] p")).toHaveText(lines); await drawer.press("Escape");
      }
      await expectReadableContrast(page);
      for (const width of [320, 375, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 720 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
      await page.setViewportSize({ width: desktop ? 1440 : 375, height: 900 });
      const arrow = page.getByRole("main").getByRole("link", { name: parentName, exact: true });
      await expect(arrow).toHaveAttribute("href", parent); await arrow.click(); await expect(page).toHaveURL(parent);
      await ready(page, route);
      await header.getByLabel("Theme", { exact: true }).selectOption("system"); await page.emulateMedia({ colorScheme: theme }); await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await back.focus(); await expect(back).toHaveCSS("outline-width", "3px"); await back.press("Enter");
      await expect(page).toHaveURL("/login"); await expect(page.getByRole("dialog", { name: "Leave this page?" })).toHaveCount(0);
      await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    }
  });
  test("unsaved checkout and Settings guards plus fixed printable branding in " + theme, async ({ page }, info) => {
    await page.addInitScript((mode) => localStorage.setItem("pos-theme", mode), theme);
    await page.setViewportSize({ width: info.project.name === "chromium" ? 1440 : 375, height: 900 });
    await ready(page, "/pos"); const login = page.getByRole("banner").getByRole("link", { name: "Back to Login", exact: true });
    const search = page.getByRole("combobox", { name: "Find Product", exact: true }); await search.fill("dia");
    await login.click(); const guard = page.getByRole("dialog", { name: "Leave this page?", exact: true });
    await expect(guard).toBeVisible(); await guard.getByRole("button", { name: "Keep editing" }).click(); await expect(login).toBeFocused(); await expect(search).toHaveValue("dia");
    await search.press("Enter"); await page.getByLabel("Diapers quantity, item 1", { exact: true }).fill("2");
    await page.getByLabel("Diapers price (PKR), item 1", { exact: true }).fill("1250.25");
    await page.getByLabel("Diapers discount (%), item 1", { exact: true }).fill("10"); await page.getByRole("button", { name: "Create Invoice", exact: true }).click();
    const receipt = page.getByRole("dialog", { name: "Sample Invoice", exact: true }), paper = receipt.locator(".receipt-sheet");
    await expect(paper.locator("[data-developer-credit] p")).toHaveText(lines); await expect(paper).not.toContainText("0310-3698894");
    await expect(receipt.getByTestId("receipt-total")).toHaveText("Rs. 2,250.45");
    await receipt.getByText("Payment Details (optional)", { exact: true }).click();
    await receipt.getByLabel("Cash Received (PKR, optional)", { exact: true }).fill("2300"); await expect(paper).toContainText("Rs. 49.55");
    await receipt.getByText("Edit Receipt Details", { exact: true }).click();
    await receipt.getByLabel("Receipt Message (optional)", { exact: true }).fill("Thank you from the shop");
    await expect(paper).toContainText("Thank you from the shop"); await expect(paper.locator("[data-developer-credit] p")).toHaveText(lines);
    await expect(receipt.getByLabel(/SalamTech|Developer|3698984/)).toHaveCount(0);
    await page.evaluate(() => { window.print = () => document.documentElement.setAttribute("data-print-called", "yes"); });
    await receipt.getByRole("button", { name: "Print", exact: true }).click(); await expect(page.locator("html")).toHaveAttribute("data-print-called", "yes");
    for (const layout of ["ordinary", "compact"]) {
      await receipt.getByLabel("Print layout", { exact: true }).selectOption(layout); await page.emulateMedia({ media: "print" });
      const print = page.locator("#shop-pos-print-receipt"); await expect(print).toBeVisible(); await expect(print.locator("[data-developer-credit]")).toHaveCount(1); await expect(print.locator("[data-developer-credit] p")).toHaveText(lines);
      await expect(print).toContainText("Rs. 2,250.45"); await expect(print).toContainText("Rs. 49.55"); await expect(print.getByRole("button")).toHaveCount(0); await expect(page.getByRole("banner")).toBeHidden();
      const brand = print.locator("[data-developer-credit]"); expect(await brand.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.emulateMedia({ media: "screen" });
    }
    await receipt.getByRole("button", { name: "Edit Sale", exact: true }).click();
    await login.click(); await guard.getByRole("link", { name: "Leave page", exact: true }).click(); await expect(page).toHaveURL("/login");
    await ready(page, "/admin/settings"); await page.getByLabel("Shop Name", { exact: true }).fill("Unsaved shop name");
    await page.getByRole("banner").getByRole("link", { name: "Back to Login", exact: true }).click(); await expect(guard).toBeVisible(); await guard.getByRole("button", { name: "Keep editing" }).click(); await expect(page.getByLabel("Shop Name", { exact: true })).toHaveValue("Unsaved shop name");
    await page.getByRole("banner").getByRole("link", { name: "Back to Login", exact: true }).click(); await guard.getByRole("link", { name: "Leave page", exact: true }).click(); await expect(page).toHaveURL("/login");
  });
}
