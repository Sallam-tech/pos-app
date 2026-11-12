import { createHash, randomUUID, X509Certificate } from "node:crypto";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fixture, initialize, passwords, material, run, sensitive, credentialHashes, wire, login } from "../helpers/inventory-http-fixture";
import type { LocalRuntime } from "../../src/server/hosting/runtime";
import type { RecoveryMarker } from "../../src/lib/inventory/recovery-store";
const contexts: BrowserContext[] = [], runtimes: LocalRuntime[] = [];
type Fixture = Awaited<ReturnType<typeof fixture>>;
const poll = <T>(work: () => T | Promise<T>) => expect.poll(work, { timeout: 12000 });
async function started() { const f = await fixture(), runtime = await f.start(); runtimes.push(runtime); return { ...f, runtime }; }
async function browser(profile = mkdtempSync(path.join(run, "terminal-browser-"))) {
 const spki = createHash("sha256").update(new X509Certificate(material.certificate).publicKey.export({ type: "spki", format: "der" })).digest("base64");
 const context = await chromium.launchPersistentContext(profile, { headless: true, ignoreHTTPSErrors: false, serviceWorkers: "block", args: ["--enable-automation", "--ignore-certificate-errors-spki-list=" + spki] }); contexts.push(context); return context;
}
async function signin(page: Page, f: Fixture) {
 await page.goto(f.config.authorization.origins.ADMIN + "/api/health");
 expect(await page.evaluate(async password => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) })).status, passwords.ADMIN)).toBe(200);
}
async function form(page: Page, f: Fixture, ready = true) { await page.goto(f.config.authorization.origins.ADMIN + "/admin/products/new"); if (ready) await poll(() => page.getByRole("button", { name: "Save Product", exact: true }).isEnabled()).toBe(true); }
async function fill(page: Page) { for (const [label, value] of [["Product Name", "TEST terminal " + randomUUID()], ["Buying Price (Rs.)", "12.50"], ["Selling Price (Rs.)", "15.00"], ["Stock Quantity", "5"], ["Low Stock Alert", "2"]]) await page.getByLabel(label, { exact: false }).fill(value); }
async function marker(page: Page): Promise<RecoveryMarker | null> {
 return page.evaluate(() => new Promise((resolve, reject) => { const request = indexedDB.open("pos-test-inventory-recovery-v1", 1); request.onerror = () => reject(Error("TEST storage")); request.onsuccess = () => { const db = request.result, tx = db.transaction("marker"), read = tx.objectStore("marker").get("active"); read.onsuccess = () => resolve(read.result ?? null); read.onerror = () => reject(Error("TEST storage")); tx.oncomplete = () => db.close(); }; }));
}
const panel = (page: Page) => page.getByRole("region", { name: "Operation recovery", exact: true });
async function unknown(page: Page, f: Fixture) {
 await form(page, f); await fill(page);
 await page.route("**/api/admin/products", route => route.request().method() === "POST" ? route.abort("connectionfailed") : route.continue());
 await page.getByRole("button", { name: "Save Product", exact: true }).click(); await poll(async () => (await marker(page))?.state).toBe("PENDING");
 await poll(() => panel(page).getByText("UNKNOWN:", { exact: false }).isVisible()).toBe(true); return (await marker(page))!;
}
async function cancel(page: Page) {
 await page.getByRole("button", { name: "Review Cancellation", exact: true }).click();
 await page.getByRole("button", { name: "Confirm Resolve or Cancel", exact: true }).click();
}
async function resolved(page: Page, outcome: "Saved" | "Cancelled") { await page.getByRole("button", { name: "Resolve Previous Operation", exact: true }).click(); await poll(() => panel(page).getByText(outcome + " operation confirmed from SQLite.", { exact: false }).isVisible()).toBe(true); }
async function ack(page: Page, outcome: "Saved" | "Cancelled") { await page.getByRole("button", { name: "Acknowledge " + outcome + " Operation", exact: true }).click(); await poll(() => marker(page)).toBe(null); }
async function dropResponse(page: Page, pattern: string) {
 const cdp = await page.context().newCDPSession(page); await cdp.send("Fetch.enable", { patterns: [{ urlPattern: pattern, requestStage: "Response" }] });
 let complete!: () => void; const done = new Promise<void>(r => { complete = r; });
 cdp.on("Fetch.requestPaused", async event => { if (event.request.method === "POST" && event.responseStatusCode === 200) { await cdp.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "ConnectionReset" }); complete(); } else await cdp.send("Fetch.continueRequest", { requestId: event.requestId }); });
 return { cdp, done };
}
beforeAll(initialize);
afterEach(async () => { vi.restoreAllMocks(); for (const c of contexts.splice(0)) await c.close().catch(() => {}); for (const r of runtimes.splice(0)) await r.close(); });
describe("approved terminal cancellation real Chromium/SQLite", () => {
 it("requires explicit Admin cancellation and fresh acknowledgement; fences the original key before new user save", async () => {
  const f = await started(), context = await browser(), page = await context.newPage(); await signin(page, f); const original = await unknown(page, f);
  await page.reload(); await page.getByRole("button", { name: "Resolve Previous Operation", exact: true }).click(); await poll(() => panel(page).getByText("UNKNOWN:", { exact: false }).isVisible()).toBe(true);
  expect(await marker(page)).toEqual(original); expect(await page.getByRole("button", { name: "Save Product", exact: true }).isDisabled()).toBe(true);
  await page.getByRole("button", { name: "Review Cancellation", exact: true }).click(); await page.getByRole("button", { name: "Keep Blocked", exact: true }).click();
  f.inspect(db => expect(db.get("SELECT count(*) AS n FROM inventory_cancellations")?.n).toBe(BigInt(0)));
  await cancel(page); await poll(() => panel(page).getByText("Cancelled operation confirmed from SQLite.", { exact: false }).isVisible()).toBe(true);
  expect((await marker(page))?.key).toBe(original.key); expect((await marker(page))?.state).toBe("CONFIRMED");
  f.inspect(db => { expect(db.get("SELECT count(*) AS n FROM inventory_cancellations")?.n).toBe(BigInt(1)); expect(db.get("SELECT count(*) AS n FROM products")?.n).toBe(BigInt(0)); });
  await page.reload(); await resolved(page, "Cancelled"); await ack(page, "Cancelled");
  await page.unroute("**/api/admin/products"); await fill(page); await poll(() => page.getByRole("button", { name: "Save Product", exact: true }).isEnabled()).toBe(true);
  await page.getByRole("button", { name: "Save Product", exact: true }).click(); await poll(async () => (await marker(page))?.state).toBe("CONFIRMED");
  expect((await marker(page))?.key).not.toBe(original.key);
  f.inspect(db => { expect(db.get("SELECT count(*) AS n FROM products")?.n).toBe(BigInt(1)); expect(db.get("SELECT sellable_q FROM stock_balances")?.sellable_q).toBe(BigInt(5000000)); });
 });
 it("resolves a lost committed CREATE response as Saved even when Admin requests cancellation", async () => {
  const f = await started(), context = await browser(), page = await context.newPage(); await signin(page, f); await form(page, f); await fill(page);
  const lost = await dropResponse(page, "*/api/admin/products"); await page.getByRole("button", { name: "Save Product", exact: true }).click(); await lost.done; await lost.cdp.detach();
  await poll(() => panel(page).getByText("UNKNOWN:", { exact: false }).isVisible()).toBe(true); const original = await marker(page); await cancel(page);
  await poll(() => panel(page).getByText("Saved operation confirmed from SQLite.", { exact: false }).isVisible()).toBe(true); expect((await marker(page))?.key).toBe(original?.key);
  f.inspect(db => { expect(db.get("SELECT count(*) AS n FROM products")?.n).toBe(BigInt(1)); expect(db.get("SELECT count(*) AS n FROM inventory_cancellations")?.n).toBe(BigInt(0)); }); await ack(page, "Saved");
 });
 it("recovers lost cancellation response after actual browser crash and server restart with the SAME durable key", async () => {
  const f = await started(), profile = mkdtempSync(path.join(run, "cancel-crash-")), context = await browser(profile), page = await context.newPage(); await signin(page, f); const original = await unknown(page, f);
  const lost = await dropResponse(page, "*/api/admin/inventory/operations/*/recovery"); await cancel(page); await lost.done;
  f.inspect(db => expect(db.get("SELECT count(*) AS n FROM inventory_cancellations WHERE request_key=?", [original.key])?.n).toBe(BigInt(1)));
  const closed = new Promise<void>(r => context.once("close", () => r())), cdp = await context.browser()!.newBrowserCDPSession(); void cdp.send("Browser.crash").catch(() => {});
  await Promise.race([closed, new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(Error("TEST crash not observed")), 10000); timer.unref(); })]); await context.close().catch(() => {});
  await f.runtime.close(); const nextRuntime = await f.start(); runtimes.push(nextRuntime);
  const relaunched = await browser(profile), next = await relaunched.newPage(); await next.goto(f.config.authorization.origins.ADMIN + "/api/health"); expect(await next.evaluate(async () => (await fetch("/api/auth/session", { cache: "no-store" })).json())).toEqual({ authenticated: false });
  await signin(next, f); await form(next, f, false); expect(await marker(next)).toEqual(original); await resolved(next, "Cancelled"); await ack(next, "Cancelled");
  const cookies = await login(f.config), delayed = { requestKey: original.key, name: "TEST delayed", unit: "PACK", buyingPricePaisa: "1250", sellingPricePaisa: "1500", sellingActive: true, openingQuantity: "5", lowStockThreshold: "2" };
  expect((await wire(f.config, "/api/admin/products", "ADMIN", cookies, delayed, { headers: { origin: f.config.authorization.origins.ADMIN, cookie: cookies.map(c => c.split(";")[0]).join("; "), "content-type": "application/json", "x-inventory-context": original.context } })).status).toBe(409);
  f.inspect(db => expect(db.get("SELECT count(*) AS n FROM products")?.n).toBe(BigInt(0)));
 });
 it("coordinates cancellation across two tabs and prevents stale acknowledgement deleting a newer marker", async () => {
  const f = await started(), context = await browser(), a = await context.newPage(), b = await context.newPage(); await signin(a, f); const original = await unknown(a, f); await form(b, f, false);
  let admit!: () => void, both!: () => void, waiting = 0; const admission = new Promise<void>(r => { admit = r; }), simultaneous = new Promise<void>(r => { both = r; });
  for (const page of [a,b]) await page.route("**/api/admin/inventory/operations/" + original.key + "/recovery", async route => { if (route.request().method() === "POST") { if (++waiting === 2) both(); await admission; } await route.continue(); });
  await Promise.all([cancel(a), cancel(b)]); await simultaneous; admit(); await poll(async () => (await marker(a))?.state).toBe("CONFIRMED"); await resolved(a, "Cancelled"); await resolved(b, "Cancelled");
  for (const page of [a,b]) await page.unroute("**/api/admin/inventory/operations/" + original.key + "/recovery");
  f.inspect(db => expect(db.get("SELECT count(*) AS n FROM inventory_cancellations")?.n).toBe(BigInt(1)));
  let release!: () => void, reached!: () => void; const held = new Promise<void>(r => { release = r; }), arrived = new Promise<void>(r => { reached = r; });
  const paused = await context.newCDPSession(a); await paused.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/admin/inventory/operations/" + original.key + "/recovery", requestStage: "Response" }] });
  paused.on("Fetch.requestPaused", async event => { reached(); await held; await paused.send("Fetch.continueRequest", { requestId: event.requestId }); });
  await a.getByRole("button", { name: "Acknowledge Cancelled Operation", exact: true }).click(); await arrived; await ack(b, "Cancelled");
  await b.route("**/api/admin/products", route => route.request().method() === "POST" ? route.abort("connectionfailed") : route.continue()); await fill(b); await poll(() => b.getByRole("button", { name: "Save Product", exact: true }).isEnabled()).toBe(true); await b.getByRole("button", { name: "Save Product", exact: true }).click();
  await poll(async () => (await marker(b))?.state).toBe("PENDING"); const newer = await marker(b); expect(newer?.key).not.toBe(original.key); release();
  await poll(() => panel(a).getByText("UNKNOWN:", { exact: false }).isVisible()).toBe(true); expect(await marker(a)).toEqual(newer); expect(await marker(b)).toEqual(newer); await paused.detach();
 });
 it("retains a terminal marker if session expires before acknowledgement; unavailable storage denies every save", async () => {
  const f = await started(), context = await browser(), page = await context.newPage(); await signin(page, f); const original = await unknown(page, f); await cancel(page);
  await poll(() => panel(page).getByText("Cancelled operation confirmed from SQLite.", { exact: false }).isVisible()).toBe(true);
  f.inspect(db => db.transaction(tx => tx.run("UPDATE auth_session_authorizations SET expires_at_ms=created_at_ms+1")));
  await page.getByRole("button", { name: "Acknowledge Cancelled Operation", exact: true }).click(); await poll(() => panel(page).getByText("UNKNOWN:", { exact: false }).isVisible()).toBe(true); expect((await marker(page))?.key).toBe(original.key);
  await signin(page, f); await form(page, f, false); await resolved(page, "Cancelled"); await ack(page, "Cancelled");
  await page.addInitScript(() => { Object.defineProperty(window, "indexedDB", { get() { throw Error("TEST storage failure"); } }); }); await page.reload();
  await poll(() => panel(page).getByText("Recovery storage unavailable.", { exact: false }).isVisible()).toBe(true); expect(await page.getByRole("button", { name: "Save Product", exact: true }).isDisabled()).toBe(true);
  f.inspect(db => expect(db.get("SELECT count(*) AS n FROM products")?.n).toBe(BigInt(0)));
 });
 it("stores only the bounded original marker and exposes no credentials in ordinary JSON, URLs or browser storage", async () => {
  const f = await started(), context = await browser(), page = await context.newPage(); await signin(page, f); const original = await unknown(page, f); await cancel(page);
  await poll(async () => (await marker(page))?.state).toBe("CONFIRMED"); const saved = await marker(page); expect(Object.keys(saved!).sort()).toEqual(["context", "key", "kind", "state", "v"]); expect(Buffer.byteLength(JSON.stringify(saved))).toBeLessThanOrEqual(512);
  const visible = await page.evaluate(async key => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage), cookies: document.cookie, url: location.href,
   result: await (await fetch("/api/admin/inventory/operations/" + key.key + "/recovery", { headers: { "X-Inventory-Context": key.context, "X-Inventory-Operation": key.kind } })).text() }), original);
  for (const secret of [...sensitive, ...credentialHashes]) expect(JSON.stringify({ marker: saved, ...visible }).includes(secret)).toBe(false);
  expect(visible.cookies).not.toMatch(/pos-admin|session_token|session_data/); expect(JSON.parse(visible.result)).toEqual({ outcome: "CANCELLED" });
 });
});
