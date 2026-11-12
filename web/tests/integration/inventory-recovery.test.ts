import { createHash, randomUUID, X509Certificate } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fixture, initialize, login, wire, passwords, material, run, sensitive, credentialHashes, stable } from "../helpers/inventory-http-fixture";
import { startLocalRuntime, type LocalRuntime } from "../../src/server/hosting/runtime";
import type { RecoveryMarker } from "../../src/lib/inventory/recovery-store";
import type { MutationResult } from "../../src/server/inventory/contracts";
import { authorizedFileNamespace } from "../../src/server/auth/database";
const runtimes: LocalRuntime[] = [], contexts: BrowserContext[] = [];
type Fixture = Awaited<ReturnType<typeof fixture>>;
const contextPath = "/api/admin/inventory/recovery-context", operationPath = "/api/admin/inventory/operations/";
const create = () => ({ requestKey: randomUUID(), name: "TEST recovery " + randomUUID(), unit: "PACK", buyingPricePaisa: "1250", sellingPricePaisa: "1500", sellingActive: true, openingQuantity: "5", lowStockThreshold: "5" });
const poll = <T>(work: () => T | Promise<T>) => expect.poll(work, { timeout: 12000 });
async function started() { const f = await fixture(), runtime = await f.start(); runtimes.push(runtime); const cookies = await login(f.config); return { ...f, runtime, cookies }; }
async function binding(f: Fixture, cookies: string[]) { const r = await wire(f.config, contextPath, "ADMIN", cookies); expect(r.status).toBe(200); return (JSON.parse(r.body) as { context: string }).context; }
async function post(f: Awaited<ReturnType<typeof started>>, command: unknown, endpoint = "/api/admin/products", context?: string) {
 const value = context ?? await binding(f, f.cookies);
 return wire(f.config, endpoint, "ADMIN", f.cookies, command, { headers: { origin: f.config.authorization.origins.ADMIN, cookie: f.cookies.map(c => c.split(";")[0]).join("; "), "content-type": "application/json", "x-inventory-context": value } });
}
interface Native { inTransaction: boolean; pragma(sql: string): unknown; prepare(sql: string): { run(): unknown } }
const Native = createRequire(import.meta.url)("better-sqlite3") as { prototype: Native };
beforeAll(initialize);
afterEach(async () => { vi.restoreAllMocks(); for (const c of contexts.splice(0)) await c.close().catch(() => {}); for (const r of runtimes.splice(0)) await r.close(); });
describe("approved crash recovery actual SQLite/HTTPS boundary", () => {
 it("binds genuine Admin to the owned file, survives restart, and separates identical copied auth rows", async () => {
  const f = await started(), a = await binding(f, f.cookies); expect(a).toMatch(/^[0-9a-f]{64}$/);
  const before = f.snapshot(); await f.runtime.close(); const second = await f.start(); runtimes.push(second);
  expect((await wire(f.config, contextPath, "ADMIN", f.cookies)).status).toBe(403);
  const fresh = await login(f.config); expect(await binding(f, fresh)).toBe(a); expect(f.snapshot()).toBe(before);
  await second.close(); const other = await started(); expect(await binding(other, other.cookies)).not.toBe(a);
  expect(() => authorizedFileNamespace({ get: async () => undefined, all: async () => [], run: async () => ({ changes: BigInt(0) }) })).toThrow("Access denied.");
 });
 it("denies anonymous/Salesperson and returns no path, identity or secret", async () => {
  const f = await started(), staff = await login(f.config, "SALESPERSON");
  expect((await wire(f.config, contextPath)).status).toBe(403);
  expect((await wire(f.config, contextPath, "SALESPERSON", staff)).status).toBe(403);
  const result = await wire(f.config, contextPath, "ADMIN", f.cookies); expect(Object.keys(JSON.parse(result.body))).toEqual(["context"]);
  for (const v of [...sensitive, ...credentialHashes, f.config.authorization.database.directory]) expect(result.body.includes(v)).toBe(false);
  expect(result.headers["cache-control"]).toBe("no-store, private");
 });
 it("requires correct context before writes and derives CREATE/RECEIVE kind from SQL", async () => {
  const f = await started(), command = create(), before = f.snapshot();
  expect((await wire(f.config, "/api/admin/products", "ADMIN", f.cookies, command)).status).toBe(400);
  expect((await post(f, command, undefined, "0".repeat(64))).status).toBe(503); expect(f.snapshot()).toBe(before);
  const first = await post(f, command); expect(first.status).toBe(200); const saved = JSON.parse(first.body) as MutationResult;
  const one = await wire(f.config, operationPath + command.requestKey, "ADMIN", f.cookies);
  expect(one.headers["x-inventory-operation"]).toBe("CREATE"); expect(one.headers["x-inventory-context"]).toBe(await binding(f, f.cookies)); expect(one.body).toBe(first.body);
  const receive = { requestKey: randomUUID(), productId: saved.product.id, expectedProductVersion: saved.product.productVersion, expectedBalanceVersion: saved.product.balanceVersion, quantity: "2", unitBuyingPricePaisa: "1250", reason: "TEST receiving" };
  expect((await post(f, receive, "/api/admin/products/" + saved.product.id + "/receive")).status).toBe(200);
  expect((await wire(f.config, operationPath + receive.requestKey, "ADMIN", f.cookies)).headers["x-inventory-operation"]).toBe("RECEIVE");
  f.inspect(db => { expect(db.get("SELECT sellable_q FROM stock_balances")?.sellable_q).toBe(BigInt(7000000)); expect(db.get("SELECT count(*) n FROM inventory_operations")?.n).toBe(BigInt(2)); expect(db.get("SELECT integrity_check FROM pragma_integrity_check")?.integrity_check).toBe("ok"); });
 });
 it("keeps missing results unknown and repeated lookups never mutate business records", async () => {
  const f = await started(), key = randomUUID(), before = f.snapshot();
  for (let i = 0; i < 3; i++) expect((await wire(f.config, operationPath + key, "ADMIN", f.cookies)).status).toBe(404);
  expect(f.snapshot()).toBe(before); const command = create(); expect((await post(f, command)).status).toBe(200);
  const saved = f.snapshot(); for (let i = 0; i < 3; i++) expect((await wire(f.config, operationPath + command.requestKey, "ADMIN", f.cookies)).status).toBe(200);
  expect(f.snapshot()).toBe(saved);
 });
 it("rejects SQL/context corruption and rolls back actual deferred FK COMMIT failure", async () => {
  const f = await started(), context = await binding(f, f.cookies), before = f.snapshot(), prepare = Native.prototype.prepare;
  let armed = false, fail = true;
  vi.spyOn(Native.prototype, "prepare").mockImplementation(function(this: Native, sql: string) {
   if (/^INSERT INTO products/.test(sql)) armed = true;
   if (armed && fail && /^commit$/i.test(sql.trim()) && this.inTransaction) { fail = false; this.pragma("defer_foreign_keys=ON"); prepare.call(this, "INSERT INTO product_identifiers VALUES('TEST_MISSING','BARCODE','TEST_ORPHAN')").run(); }
   return prepare.call(this, sql);
  });
  expect((await post(f, create(), undefined, context)).status).toBe(503); expect(fail).toBe(false); expect(f.snapshot()).toBe(before); vi.restoreAllMocks();
  f.inspect(db => db.transaction(tx => { tx.run("DELETE FROM auth_provisioning"); })); expect((await wire(f.config, contextPath, "ADMIN", f.cookies)).status).toBe(403); expect(f.snapshot()).toBe(before);
 });
 it("denies expired/revoked authority and does not expose unintended routes", async () => {
  const f = await started(), command = create(); expect((await post(f, command)).status).toBe(200);
  f.inspect(db => db.transaction(tx => { tx.run("UPDATE auth_session_authorizations SET revoked_at_ms=created_at_ms"); }));
  for (const endpoint of [contextPath, operationPath + command.requestKey]) expect((await wire(f.config, endpoint, "ADMIN", f.cookies)).status).toBe(403);
  for (const endpoint of ["/api/auth/sign-up/email", "/api/admin/inventory/recovery-context/clear", "/api/admin/inventory/recovery-registry"]) expect((await wire(f.config, endpoint, "ADMIN", f.cookies)).status).toBe(404);
 });
});
async function browser(profile?: string) {
 const spki = createHash("sha256").update(new X509Certificate(material.certificate).publicKey.export({ type: "spki", format: "der" })).digest("base64");
 const c = await chromium.launchPersistentContext(profile ?? mkdtempSync(path.join(run, "browser-")), { headless: true, ignoreHTTPSErrors: false, serviceWorkers: "block", args: ["--enable-automation", "--ignore-certificate-errors-spki-list=" + spki] }); contexts.push(c); return c;
}
async function browserLogin(page: Page, f: Fixture) {
 await page.goto(f.config.authorization.origins.ADMIN + "/api/health");
 const status = await page.evaluate(async password => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) })).status, passwords.ADMIN); expect(status).toBe(200);
}
async function form(page: Page, f: Fixture) { await page.goto(f.config.authorization.origins.ADMIN + "/admin/products/new"); await poll(() => page.getByRole("button", { name: "Save Product", exact: true }).isEnabled()).toBe(true); }
async function fill(page: Page, name = "TEST browser recovery " + randomUUID()) {
 for (const [label, value] of [["Product Name", name], ["Buying Price (Rs.)", "12.50"], ["Selling Price (Rs.)", "15.00"], ["Stock Quantity", "5"], ["Low Stock Alert", "5"]]) await page.getByLabel(label, { exact: false }).fill(value); return name;
}
async function marker(page: Page): Promise<RecoveryMarker | null> {
 return page.evaluate(() => new Promise((resolve, reject) => {
  const r = indexedDB.open("pos-test-inventory-recovery-v1", 1); r.onerror = () => reject(Error("TEST storage")); r.onsuccess = () => { const db = r.result, tx = db.transaction("marker"), q = tx.objectStore("marker").get("active"); q.onsuccess = () => resolve(q.result ?? null); q.onerror = () => reject(Error("TEST storage")); tx.oncomplete = () => db.close(); };
 }));
}
const panel = (page: Page) => page.getByRole("region", { name: "Operation recovery", exact: true });
async function acknowledge(page: Page) { await page.getByRole("button", { name: "Acknowledge Saved Operation", exact: true }).click(); await poll(() => marker(page)).toBe(null); }
async function resolve(page: Page) { await page.getByRole("button", { name: "Resolve Previous Operation", exact: true }).click(); await poll(() => panel(page).getByText("Saved operation confirmed from SQLite.", { exact: false }).isVisible()).toBe(true); }
async function lostResponse(page: Page, pattern = "*/api/admin/products") {
 const cdp = await page.context().newCDPSession(page); await cdp.send("Fetch.enable", { patterns: [{ urlPattern: pattern, requestStage: "Response" }] });
 let finish!: () => void; const done = new Promise<void>(r => { finish = r; });
 cdp.on("Fetch.requestPaused", async event => { if (event.responseStatusCode === 200) { await cdp.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "ConnectionReset" }); finish(); } else await cdp.send("Fetch.continueRequest", { requestId: event.requestId }); });
 return { done, cdp };
}

describe("approved retained-profile real browser recovery", () => {
 it("normal CREATE then RECEIVE keeps confirmed markers until explicit authenticated acknowledgement", async () => {
  const f = await started(), c = await browser(), page = await c.newPage(); await browserLogin(page, f); await form(page, f); const name = await fill(page);
  let posts = 0; page.on("request", q => { if (q.method() === "POST" && /\/api\/admin\/products/.test(q.url())) posts++; });
  await page.getByRole("button", { name: "Save Product", exact: true }).click(); await poll(async () => (await marker(page))?.state).toBe("CONFIRMED");
  const first = await marker(page); expect(first?.kind).toBe("CREATE"); expect(Object.keys(first!).sort()).toEqual(["context", "key", "kind", "state", "v"]); expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThanOrEqual(512);
  await page.reload(); expect((await marker(page))?.key).toBe(first?.key); await resolve(page); expect(posts).toBe(1); expect(await page.getByRole("button", { name: "Save Product", exact: true }).isDisabled()).toBe(true); await acknowledge(page);
  await page.goto(f.config.authorization.origins.ADMIN + "/admin/products"); const article = page.getByRole("article", { name, exact: true }); await article.getByRole("button", { name: "Add stock for " + name }).click();
  await page.getByLabel("Quantity Bought", { exact: false }).fill("2"); await page.getByLabel("Reason", { exact: true }).fill("TEST received shipment"); await page.getByRole("button", { name: "Add Stock", exact: true }).click();
  await poll(async () => (await marker(page))?.state).toBe("CONFIRMED"); expect((await marker(page))?.kind).toBe("RECEIVE"); await acknowledge(page); expect(posts).toBe(2);
  f.inspect(db => { expect(db.get("SELECT sellable_q FROM stock_balances")?.sellable_q).toBe(BigInt(7000000)); expect(db.get("SELECT count(*) n FROM stock_movements")?.n).toBe(BigInt(2)); });
  const storage = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage), cookie: document.cookie, url: location.href }));
  for (const v of [...sensitive, ...credentialHashes, name]) expect(stable({ marker: first, storage }).includes(v)).toBe(false);
  const cookies = (await c.cookies()).filter(x => x.name.includes("pos-admin")); expect(cookies.length).toBeGreaterThan(0);
  expect(cookies.every(x => x.httpOnly && x.secure && x.sameSite === "Strict" && x.domain === "localhost")).toBe(true);
 });
 it("lost response after real COMMIT plus refresh preserves key and resolves without another POST", async () => {
  const f = await started(), c = await browser(), page = await c.newPage(); await browserLogin(page, f); await form(page, f); await fill(page); const loss = await lostResponse(page); let posts = 0;
  page.on("request", q => { if (q.method() === "POST" && q.url().endsWith("/api/admin/products")) posts++; });
  await page.getByRole("button", { name: "Save Product", exact: true }).click(); await loss.done; await loss.cdp.detach(); await poll(() => panel(page).getByText("UNKNOWN:", { exact: false }).isVisible()).toBe(true);
  const original = await marker(page), before = f.snapshot(); expect(original?.state).toBe("PENDING"); await page.reload(); await resolve(page); expect((await marker(page))?.key).toBe(original?.key); expect(posts).toBe(1); expect(f.snapshot()).toBe(before); await acknowledge(page);
 });
 it("actual Chromium crash and fresh launch with retained profile recovers only after fresh Admin login", async () => {
  const f = await started(), profile = mkdtempSync(path.join(run, "crash-profile-")), c = await browser(profile), page = await c.newPage(); await browserLogin(page, f); await form(page, f); await fill(page);
  const loss = await lostResponse(page); await page.getByRole("button", { name: "Save Product", exact: true }).click(); await loss.done; const saved = await marker(page), before = f.snapshot();
  const browserHandle = c.browser()!; const terminated = new Promise<void>(r => c.once("close", () => r()));
  const crash = await browserHandle.newBrowserCDPSession(); void crash.send("Browser.crash").catch(() => {});
  await Promise.race([terminated, new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(Error("TEST crash termination not observed")), 10000); timer.unref(); })]); await c.close().catch(() => {});
  const relaunched = await browser(profile); await relaunched.clearCookies(); const next = await relaunched.newPage(); await browserLogin(next, f); await next.goto(f.config.authorization.origins.ADMIN + "/admin/products/new");
  expect(await marker(next)).toEqual(saved); let posts = 0; next.on("request", q => { if (q.method() === "POST") posts++; }); await resolve(next); expect(posts).toBe(0); expect(f.snapshot()).toBe(before); await acknowledge(next);
 });
 it("graceful browser closure and real server restart retain binding, deny old cookies and preserve saved data", async () => {
  const f = await started(), profile = mkdtempSync(path.join(run, "close-profile-")), c = await browser(profile), page = await c.newPage(); await browserLogin(page, f); await form(page, f); await fill(page);
  await page.getByRole("button", { name: "Save Product", exact: true }).click(); await poll(async () => (await marker(page))?.state).toBe("CONFIRMED"); const saved = await marker(page), before = f.snapshot(); await c.close(); await f.runtime.close(); const restarted = await f.start(); runtimes.push(restarted);
  expect((await wire(f.config, contextPath, "ADMIN", f.cookies)).status).toBe(403); const reopened = await browser(profile), next = await reopened.newPage(); await reopened.clearCookies(); await browserLogin(next, f); await next.goto(f.config.authorization.origins.ADMIN + "/admin/products/new");
  expect(await marker(next)).toEqual(saved); await resolve(next); expect(f.snapshot()).toBe(before); await acknowledge(next);
 });
 it("two tabs atomically admit only one operation, never replace its key and share explicit acknowledgement", async () => {
  const f = await started(), c = await browser(), a = await c.newPage(), b = await c.newPage(); await browserLogin(a, f); await Promise.all([form(a, f), form(b, f)]); await fill(a); await fill(b);
  let posts = 0; c.on("request", q => { if (q.method() === "POST" && q.url().endsWith("/api/admin/products")) posts++; });
  await Promise.all([a.getByRole("button", { name: "Save Product", exact: true }).click(), b.getByRole("button", { name: "Save Product", exact: true }).click()]);
  await poll(async () => (await marker(a))?.state).toBe("CONFIRMED"); const saved = await marker(a); expect(await marker(b)).toEqual(saved); expect(posts).toBe(1);
  await poll(() => b.getByRole("button", { name: "Save Product", exact: true }).isDisabled()).toBe(true); await resolve(b); await acknowledge(b); await poll(() => marker(a)).toBe(null);
  f.inspect(db => { expect(db.get("SELECT count(*) n FROM products")?.n).toBe(BigInt(1)); expect(db.get("SELECT count(*) n FROM inventory_operations")?.n).toBe(BigInt(1)); });
 });
 it("request interrupted before arrival remains UNKNOWN after reload and 404; no expiry or replacement", async () => {
  const f = await started(), c = await browser(), page = await c.newPage(); await browserLogin(page, f); await form(page, f); await fill(page);
  let posts = 0; await page.route("**/api/admin/products", route => { if (route.request().method() === "POST") { posts++; return route.abort("connectionfailed"); } return route.continue(); });
  await page.getByRole("button", { name: "Save Product", exact: true }).click(); await poll(async () => (await marker(page))?.state).toBe("PENDING"); const original = await marker(page); await page.reload();
  await page.getByRole("button", { name: "Resolve Previous Operation", exact: true }).click(); await poll(() => panel(page).getByText("UNKNOWN:", { exact: false }).isVisible()).toBe(true); expect(await marker(page)).toEqual(original); expect(await page.getByRole("button", { name: "Acknowledge Saved Operation", exact: true }).count()).toBe(0); expect(await page.getByRole("button", { name: "Save Product", exact: true }).isDisabled()).toBe(true); expect(posts).toBe(1);
  await page.evaluate(() => { const now = Date.now(); Date.now = () => now + 365 * 86400000; }); await page.getByRole("button", { name: "Resolve Previous Operation", exact: true }).click(); expect(await marker(page)).toEqual(original);
  f.inspect(db => expect(db.get("SELECT count(*) n FROM inventory_operations")?.n).toBe(BigInt(0)));
 });
 it("unavailable or failed IndexedDB denies mutations with no RAM fallback", async () => {
  const f = await started(), c = await browser(), page = await c.newPage(); await browserLogin(page, f);
  await page.addInitScript(() => { Object.defineProperty(window, "indexedDB", { get() { throw Error("TEST unavailable storage"); } }); }); await page.goto(f.config.authorization.origins.ADMIN + "/admin/products/new");
  await poll(() => panel(page).getByText("Recovery storage unavailable.", { exact: false }).isVisible()).toBe(true); expect(await page.getByRole("button", { name: "Save Product", exact: true }).isDisabled()).toBe(true);
  f.inspect(db => expect(db.get("SELECT count(*) n FROM products")?.n).toBe(BigInt(0)));
 });
 it("SQL session expiry denies reconciliation/acknowledgement and retains the confirmed marker", async () => {
  const f = await started(), c = await browser(), page = await c.newPage(); await browserLogin(page, f); await form(page, f); await fill(page); await page.getByRole("button", { name: "Save Product", exact: true }).click(); await poll(async () => (await marker(page))?.state).toBe("CONFIRMED"); const saved = await marker(page), before = f.snapshot();
  f.inspect(db => db.transaction(tx => { tx.run("UPDATE auth_session_authorizations SET expires_at_ms=created_at_ms+1"); })); await page.getByRole("button", { name: "Acknowledge Saved Operation", exact: true }).click(); await poll(() => panel(page).getByText("UNKNOWN:", { exact: false }).isVisible()).toBe(true); expect(await marker(page)).toEqual(saved); expect(f.snapshot()).toBe(before);
  await browserLogin(page, f); await page.goto(f.config.authorization.origins.ADMIN + "/admin/products/new"); await resolve(page); await acknowledge(page);
 });
});

describe("recovery fail-closed corruption and binding regressions", () => {
 it("failed durable marker write sends zero POSTs and cannot fall back to RAM", async () => {
  const f = await started(), c = await browser(), page = await c.newPage(); await browserLogin(page, f); await form(page, f); await fill(page);
  let posts = 0; page.on("request", r => { if (r.method() === "POST") posts++; });
  await page.evaluate(() => { IDBObjectStore.prototype.put = function() { throw new DOMException("TEST write denied", "QuotaExceededError"); }; });
  await page.getByRole("button", { name: "Save Product", exact: true }).click(); await poll(() => page.getByRole("alert").filter({ hasText: "Save unconfirmed or blocked" }).isVisible()).toBe(true); expect(posts).toBe(0); expect(await marker(page)).toBe(null); f.inspect(db => expect(db.get("SELECT count(*) n FROM products")?.n).toBe(BigInt(0)));
 });
 it("misleading operation kind and corrupt marker fail closed without deletion or exposing a result", async () => {
  const f = await started(), c = await browser(), page = await c.newPage(); await browserLogin(page, f); await form(page, f); const name = await fill(page); await page.getByRole("button", { name: "Save Product", exact: true }).click(); await poll(async () => (await marker(page))?.state).toBe("CONFIRMED");
  await page.evaluate(() => new Promise<void>((resolve, reject) => { const r = indexedDB.open("pos-test-inventory-recovery-v1", 1); r.onsuccess = () => { const db = r.result, tx = db.transaction("marker", "readwrite"), store = tx.objectStore("marker"), q = store.get("active"); q.onsuccess = () => store.put({ ...q.result, kind: "RECEIVE" }, "active"); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(Error("TEST corrupt")); }; }));
  await page.reload(); await page.getByRole("button", { name: "Resolve Previous Operation", exact: true }).click(); await poll(() => panel(page).getByText("UNKNOWN:", { exact: false }).isVisible()).toBe(true); expect(await panel(page).getByText(name, { exact: true }).count()).toBe(0); expect((await marker(page))?.kind).toBe("RECEIVE");
  await page.evaluate(() => new Promise<void>(resolve => { const r = indexedDB.open("pos-test-inventory-recovery-v1", 1); r.onsuccess = () => { const db = r.result, tx = db.transaction("marker", "readwrite"); tx.objectStore("marker").put({ v: 99 }, "active"); tx.oncomplete = () => { db.close(); resolve(); }; }; })); await page.reload(); await poll(() => panel(page).getByText("Recovery storage unavailable.", { exact: false }).isVisible()).toBe(true); expect(await marker(page)).toEqual({ v: 99 }); expect(await page.getByRole("button", { name: "Save Product", exact: true }).isDisabled()).toBe(true);
 });
 it("replacing the TEST database at the same origin cannot adopt a marker or show an unrelated same-key result", async () => {
  const f = await started(), c = await browser(), page = await c.newPage(); await browserLogin(page, f); await form(page, f); await fill(page); await page.getByRole("button", { name: "Save Product", exact: true }).click(); await poll(async () => (await marker(page))?.state).toBe("CONFIRMED"); const saved = await marker(page); await f.runtime.close();
  const other = await fixture(), config = { ...other.config, port: f.config.port, authorization: { ...other.config.authorization, origins: f.config.authorization.origins } }; const runtime = await startLocalRuntime(config); runtimes.push(runtime); const cookies = await login(config);
  const alien = { ...create(), requestKey: saved!.key }; const context = await binding({ ...other, config }, cookies); const response = await wire(config, "/api/admin/products", "ADMIN", cookies, alien, { headers: { origin: config.authorization.origins.ADMIN, cookie: cookies.map(v => v.split(";")[0]).join("; "), "content-type": "application/json", "x-inventory-context": context } }); expect(response.status).toBe(200);
  await c.clearCookies(); await browserLogin(page, { ...other, config }); await page.goto(config.authorization.origins.ADMIN + "/admin/products/new"); await page.getByRole("button", { name: "Resolve Previous Operation", exact: true }).click(); await poll(() => panel(page).getByText("UNKNOWN:", { exact: false }).isVisible()).toBe(true); expect(await marker(page)).toEqual(saved); expect(await panel(page).getByText(alien.name, { exact: true }).count()).toBe(0); expect(await page.getByRole("button", { name: "Save Product", exact: true }).isDisabled()).toBe(true);
 });
 it("real reconciliation timeout retains UNKNOWN and never unlocks replacement mutation", async () => {
  const f = await started(), c = await browser(), page = await c.newPage(); await browserLogin(page, f); await form(page, f); await fill(page); const loss = await lostResponse(page); await page.getByRole("button", { name: "Save Product", exact: true }).click(); await loss.done; await loss.cdp.detach(); const original = await marker(page), before = f.snapshot();
  let reached!: () => void; const arrived = new Promise<void>(r => { reached = r; });
  await page.route("**/api/admin/inventory/operations/*", () => { reached(); });
  await page.getByRole("button", { name: "Resolve Previous Operation", exact: true }).click(); await arrived;
  await poll(() => page.getByRole("button", { name: "Resolve Previous Operation", exact: true }).isEnabled()).toBe(true);
  expect(await marker(page)).toEqual(original); expect(await page.getByRole("button", { name: "Save Product", exact: true }).isDisabled()).toBe(true); expect(f.snapshot()).toBe(before);
 });

 it("a delayed old acknowledgement cannot delete a newer marker claimed in another tab", async () => {
  const f = await started(), c = await browser(), a = await c.newPage(), b = await c.newPage(); await browserLogin(a, f); await form(a, f); await fill(a); await a.getByRole("button", { name: "Save Product", exact: true }).click(); await poll(async () => (await marker(a))?.state).toBe("CONFIRMED"); const old = await marker(a);
  await b.goto(f.config.authorization.origins.ADMIN + "/admin/products/new"); await resolve(b);
  const cdp = await c.newCDPSession(a); let release!: () => Promise<void>, paused!: () => void; const held = new Promise<void>(r => { paused = r; });
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/admin/inventory/operations/*", requestStage: "Response" }] });
  cdp.on("Fetch.requestPaused", event => { release = async () => { await cdp.send("Fetch.continueResponse", { requestId: event.requestId }); }; paused(); });
  await a.getByRole("button", { name: "Acknowledge Saved Operation", exact: true }).click(); await held;
  await acknowledge(b); await poll(() => b.getByRole("button", { name: "Save Product", exact: true }).isEnabled()).toBe(true); await fill(b); await b.getByRole("button", { name: "Save Product", exact: true }).click(); await poll(async () => (await marker(b))?.state).toBe("CONFIRMED"); const next = await marker(b); expect(next?.key).not.toBe(old?.key);
  await release(); await cdp.detach(); await poll(() => a.getByRole("button", { name: "Resolve Previous Operation", exact: true }).isEnabled()).toBe(true); expect(await marker(a)).toEqual(next);
  f.inspect(db => expect(db.get("SELECT count(*) n FROM inventory_operations")?.n).toBe(BigInt(2)));
 });

 it("lost RECEIVE response allows closing its dialog while preserving and resolving the same stock operation", async () => {
  const f = await started(), command = create(), reply = await post(f, command); expect(reply.status).toBe(200); const saved = JSON.parse(reply.body) as MutationResult;
  const c = await browser(), page = await c.newPage(); await browserLogin(page, f); await page.goto(f.config.authorization.origins.ADMIN + "/admin/products"); const article = page.getByRole("article", { name: command.name, exact: true }); await article.getByRole("button", { name: "Add stock for " + command.name }).click();
  await page.getByLabel("Quantity Bought", { exact: false }).fill("2"); await page.getByLabel("Reason", { exact: true }).fill("TEST received shipment"); const loss = await lostResponse(page, "*/api/admin/products/*/receive"); let posts = 0; page.on("request", q => { if (q.method() === "POST") posts++; });
  await page.getByRole("button", { name: "Add Stock", exact: true }).click(); await loss.done; await loss.cdp.detach(); const pending = await marker(page); expect(pending?.kind).toBe("RECEIVE");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click(); await poll(() => page.getByRole("dialog").count()).toBe(0); expect(await marker(page)).toEqual(pending); await resolve(page); await acknowledge(page);
  await page.reload(); await poll(() => page.getByRole("article", { name: command.name, exact: true }).getByText("7 PACK", { exact: true }).isVisible()).toBe(true); expect(posts).toBe(1);
  f.inspect(db => { expect(db.get("SELECT sellable_q FROM stock_balances WHERE product_id=?", [saved.product.id])?.sellable_q).toBe(BigInt(7000000)); expect(db.get("SELECT count(*) n FROM inventory_operations")?.n).toBe(BigInt(2)); });
 });

});
