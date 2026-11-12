import { execFile } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import { createHash, X509Certificate } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { beforeAll, afterEach, describe, it, expect, vi } from "vitest";
import { fixture, initialize, login, wire, sensitive, credentialHashes, stable, material, passwords } from "../helpers/inventory-http-fixture";
import type { LocalRuntime } from "../../src/server/hosting/runtime";
import type { AdminProduct, MutationResult } from "../../src/server/inventory/contracts";
import { confinedTestAuthentication } from "../../src/server/hosting/auth-http";
const clock = vi.hoisted(() => ({ offset: 0 }));
vi.mock("node:perf_hooks", async original => {
 const actual=await original<typeof import("node:perf_hooks")>();
 return {...actual,performance:{now:()=>actual.performance.now()+clock.offset}};
});
const probe = vi.hoisted(() => ({ business: false, lost: false, fail: false, beforeCommit: undefined as (() => Promise<void>) | undefined, afterCommit: undefined as (() => Promise<void>) | undefined, releases: [] as (() => void)[] }));
vi.mock("@better-auth/core/context", async original => {
 const actual = await original<typeof import("@better-auth/core/context")>();
 return { ...actual, runWithTransaction: async (...args: Parameters<typeof actual.runWithTransaction>) => {
  const result = await actual.runWithTransaction(args[0], async () => {
   const value = await args[1](); const hook = probe.business ? probe.beforeCommit : undefined;
   if (hook) { probe.beforeCommit = undefined; await hook(); } return value;
  });
  const after = probe.business ? probe.afterCommit : undefined;
  if (after) { probe.afterCommit = undefined; await after(); }
  if (probe.business && probe.lost) { probe.lost = false; throw Error("TEST lost acknowledgement"); } return result;
 } };
});
interface Native { inTransaction: boolean; pragma(sql: string): unknown; prepare(sql: string): { run(): unknown } }
const Native = createRequire(import.meta.url)("better-sqlite3") as { prototype: Native };
const runtimes: LocalRuntime[] = [];
const browsers: Browser[] = [];
const create = (extra = {}) => ({ requestKey: randomUUID(), name: "TEST product " + randomUUID(), unit: "PACK", buyingPricePaisa: "1250", sellingPricePaisa: "1500", sellingActive: true, openingQuantity: "5", lowStockThreshold: "5", ...extra });
const receive = (p: AdminProduct, extra = {}) => ({ requestKey: randomUUID(), productId: p.id, expectedProductVersion: p.productVersion, expectedBalanceVersion: p.balanceVersion, reason: "TEST delivery", quantity: "2", unitBuyingPricePaisa: p.buyingPricePaisa, ...extra });
async function started() { const f = await fixture(); const runtime = await f.start(); runtimes.push(runtime); const cookies = await login(f.config); return { ...f, runtime, cookies }; }
const api = async (f: Awaited<ReturnType<typeof started>>, endpoint = "/api/admin/products", value?: unknown) => {
 if (value === undefined) return wire(f.config, endpoint, "ADMIN", f.cookies);
 const context = await wire(f.config, "/api/admin/inventory/recovery-context", "ADMIN", f.cookies);
 const binding = context.status === 200 ? (JSON.parse(context.body) as { context: string }).context : "";
 return wire(f.config, endpoint, "ADMIN", f.cookies, value, { headers: { origin: f.config.authorization.origins.ADMIN,
  cookie: f.cookies.map(c => c.split(";")[0]).join("; "), "content-type": "application/json", "x-inventory-context": binding } });
};
const decode = <T>(result: { status: number; body: string }): T => { expect(result.status).toBe(200); return JSON.parse(result.body); };
function fault() {
 const prepare = Native.prototype.prepare;
 vi.spyOn(Native.prototype, "prepare").mockImplementation(function(this: Native, statement: string) {
  if (/^(?:INSERT INTO products|UPDATE stock_balances)/.test(statement)) probe.business = true;
  if (probe.fail && probe.business && /^commit$/i.test(statement.trim()) && this.inTransaction) {
   probe.fail = false; this.pragma("defer_foreign_keys=ON"); prepare.call(this, "INSERT INTO product_identifiers VALUES('TEST_MISSING','BARCODE','TEST_ORPHAN')").run();
  }
  return prepare.call(this, statement);
 });
}
beforeAll(initialize);
afterEach(async () => { for (const release of probe.releases.splice(0)) release(); probe.beforeCommit = probe.afterCommit = undefined; clock.offset = 0; probe.business = probe.fail = probe.lost = false; vi.restoreAllMocks(); for (const browser of browsers.splice(0)) await browser.close(); for (const runtime of runtimes.splice(0)) await runtime.close(); });
describe("B2 Part5 actual TEST HTTPS inventory security gate", () => {
 it("creates once, replays identically and rejects changed-payload reuse", async () => {
  const f = await started(), command = create(), first = decode<MutationResult>(await api(f, undefined, command));
  expect(decode(await api(f, undefined, command))).toEqual(first);
  expect((await api(f, undefined, { ...command, openingQuantity: "6" })).status).toBe(409);
  f.inspect(db => { expect(db.get("SELECT count(*) AS n FROM products")?.n).toBe(BigInt(1)); expect(db.get("SELECT count(*) AS n FROM stock_movements WHERE kind='OPENING'")?.n).toBe(BigInt(1)); });
 });
 it("provides literal search, detail, bounded pages and exact totals", async () => {
  const f = await started(), a = decode<MutationResult>(await api(f, undefined, create({ name: "TEST %_ quoted ' product" }))); await api(f, undefined, create());
  const result = decode<{ items: AdminProduct[]; overall: { quantity: string; stockValuePaisa: string }; nextCursor: string }>(await api(f, "/api/admin/products?limit=1"));
  expect(result.items).toHaveLength(1); expect(result.nextCursor).toBeTruthy(); expect(result.overall).toMatchObject({ quantity: "10", stockValuePaisa: "12500" });
  const found = decode<{ items: AdminProduct[] }>(await api(f, "/api/admin/products?query=" + encodeURIComponent("%_ quoted '"))); expect(found.items.map(p => p.id)).toEqual([a.product.id]);
  expect(decode(await api(f, "/api/admin/products/" + a.product.id))).toEqual(a.product);
  expect((await api(f, "/api/admin/products?limit=101")).status).toBe(400);
 });
 it("receives at same cost, rejects D05/stale updates and binds path to body", async () => {
  const f = await started(), a = decode<MutationResult>(await api(f, undefined, create())), endpoint = "/api/admin/products/" + a.product.id + "/receive", command = receive(a.product);
  expect(decode<MutationResult>(await api(f, endpoint, command)).product.quantity).toBe("7");
  const before = f.snapshot(); expect((await api(f, endpoint, receive(a.product))).status).toBe(409); expect(f.snapshot()).toBe(before);
  const current = decode<AdminProduct>(await api(f, "/api/admin/products/" + a.product.id));
  expect((await api(f, endpoint, receive(current, { unitBuyingPricePaisa: "1300" }))).status).toBe(409); expect(f.snapshot()).toBe(before);
  expect((await api(f, endpoint, receive(current, { productId: randomUUID() }))).status).toBe(400); expect(f.snapshot()).toBe(before);
 });
 it("includes zero in LOW and OUT, positive in AVAILABLE, with consistent ledger and value", async () => {
  const f = await started(); await api(f, undefined, create({ openingQuantity: "0" })); await api(f, undefined, create());
  for (const [stock, count] of [["LOW", 2], ["OUT", 1], ["AVAILABLE", 1]] as const) {
   const response = decode<{ items: unknown[]; filtered: { products: string } }>(await api(f, "/api/admin/inventory?stock=" + stock)); expect(response.items).toHaveLength(count); expect(response.filtered.products).toBe(String(count));
  }
  f.inspect(db => { expect(db.get("SELECT sum(delta_q) AS q FROM stock_movements")?.q).toBe(BigInt(5000000)); expect(db.get("SELECT sum(sellable_q) AS q FROM stock_balances")?.q).toBe(BigInt(5000000)); expect(db.get("SELECT sum(stock_value_m) AS v FROM stock_balances")?.v).toBe(BigInt(6250)); });
 });
 it("serializes duplicate requests and conflicting stale receiving", async () => {
  const f = await started(), command = create(), replies = await Promise.all([api(f, undefined, command), api(f, undefined, command)]);
  expect(decode(replies[0])).toEqual(decode(replies[1])); const p = (JSON.parse(replies[0].body) as MutationResult).product;
  const url = "/api/admin/products/" + p.id + "/receive", results = await Promise.all([api(f, url, receive(p)), api(f, url, receive(p))]);
  expect(results.map(r => r.status).sort()).toEqual([200, 409]); expect(decode<AdminProduct>(await api(f, "/api/admin/products/" + p.id)).quantity).toBe("7");
 });
 it("denies anonymous, forged and Salesperson cookies on both hosts without data", async () => {
  const f = await started(); await api(f, undefined, create({ name: "TEST PRIVATE COST SENTINEL" })); const staff = await login(f.config, "SALESPERSON");
  for (const [role, cookie] of [["ADMIN", []], ["ADMIN", staff], ["SALESPERSON", staff], ["SALESPERSON", f.cookies], ["ADMIN", ["role=ADMIN;session=forged"]]] as const) {
   const result = await wire(f.config, "/api/admin/products", role, cookie); expect(result.status).toBe(403); expect(result.body).not.toMatch(/SENTINEL|1250|stockValue|items/);
  }
 });
 it("denies revoked and expired signed sessions", async () => {
  const f = await started(); expect((await wire(f.config, "/api/auth/logout", "ADMIN", f.cookies, {})).status).toBe(200); expect((await api(f)).status).toBe(403);
  f.cookies = await login(f.config); const real = Date.now; vi.spyOn(Date, "now").mockImplementation(() => real() + 121000); expect((await api(f)).status).toBe(403);
 });
 it("requires same-origin CSRF, host/SNI and rejects forwarding headers", async () => {
  const f = await started(), before = f.snapshot();
  for (const headers of [{ origin: "https://evil.invalid" }, { origin: "" }, { host: "evil.invalid" }, { "x-forwarded-host": "localhost" }, { "x-forwarded-proto": "https" }, { "sec-fetch-site": "cross-site" }]) {
   expect((await wire(f.config, "/api/admin/products", "ADMIN", f.cookies, create(), { headers })).status).toBe(403);
  }
  expect(f.snapshot()).toBe(before);
 });
 it.each(["/api/admin/products/../products", "/api/admin/products%2f", "/api/admin/products?role=ADMIN", "/api/admin/products?limit=1&limit=2", "/api/admin/products?password=x", "/api/auth/sign-up/email", "/admin/../../api/admin/products"])("rejects unallowlisted path/query %s", async endpoint => {
  const f = await started(), result = await api(f, endpoint); expect([400, 404]).toContain(result.status);
 });
 it("rejects methods, duplicate keys, numeric money, unknown fields and oversized bodies", async () => {
  const f = await started(), before = f.snapshot();
  expect((await wire(f.config, "/api/admin/products", "ADMIN", f.cookies, undefined, { method: "DELETE" })).status).toBe(405);
  for (const value of ['{"name":"a","name":"b"}', { ...create(), buyingPricePaisa: 1250 }, { ...create(), role: "ADMIN" }, { ...create(), openingQuantity: "1.5" }, { ...create(), name: "x".repeat(8200) }, "{bad", { ...create(), sellingPricePaisa: "1249" }]) expect((await api(f, undefined, value)).status).toBe(400);
  expect((await wire(f.config, "/api/admin/products", "ADMIN", f.cookies, create(), { headers: { "content-type": "text/plain" } })).status).toBe(415); expect(f.snapshot()).toBe(before);
 });
 it("rolls back actual deferred-FK COMMIT failure and safely retries original key", async () => {
  const f = await started(), command = create(), before = f.snapshot(); fault(); probe.fail = true;
  expect((await api(f, undefined, command)).status).toBe(503); expect(probe.fail).toBe(false); expect(f.snapshot()).toBe(before);
  expect((await api(f, undefined, command)).status).toBe(200);
 });
 it("recovers a lost COMMIT acknowledgement through the SAME key without double stock", async () => {
  const f = await started(), command = create(); fault(); probe.lost = true;
  expect((await api(f, undefined, command)).status).toBe(503); f.inspect(db => expect(db.get("SELECT count(*) AS n FROM products")?.n).toBe(BigInt(1)));
  const replay = decode<MutationResult>(await api(f, undefined, command)); expect(replay.product.quantity).toBe("5"); f.inspect(db => expect(db.get("SELECT count(*) AS n FROM inventory_operations")?.n).toBe(BigInt(1)));
 });
 it("denies missing provisioning", async () => {
  const f = await started(); f.inspect(db => db.transaction(tx => tx.run("DELETE FROM auth_provisioning"))); expect((await api(f)).status).toBe(403);
 });
 it("checks exact18 within each request, not a cached admission", async () => {
  const f = await started(); f.inspect(db => db.transaction(tx => tx.run("CREATE TABLE test_unreviewed(v INTEGER) STRICT"))); expect((await api(f)).status).toBe(503);
 });
 it("persists products/history across real runtime restart; old signed cookie is denied", async () => {
  const f = await started(), p = decode<MutationResult>(await api(f, undefined, create())).product; await api(f, "/api/admin/products/" + p.id + "/receive", receive(p)); const before = f.snapshot();
  await f.runtime.close(); const restarted = await f.start(); runtimes.push(restarted); expect((await api(f)).status).toBe(403); f.cookies = await login(f.config);
  expect(decode<AdminProduct>(await api(f, "/api/admin/products/" + p.id)).quantity).toBe("7"); expect(f.snapshot()).toBe(before);
 });
 it("keeps persistent/non-TEST activation disabled and ordinary Next routes free of DB APIs", async () => {
  const f = await fixture(); expect(confinedTestAuthentication({ ...f.config.authorization.database, mode: "persistent" })).toBe(false);
  vi.stubEnv("NODE_ENV", "production"); try { expect(confinedTestAuthentication(f.config.authorization.database)).toBe(false); await expect(f.start()).rejects.toBeDefined(); } finally { vi.unstubAllEnvs(); }
  expect(existsSync(path.resolve("src/app/api/admin"))).toBe(false); expect(existsSync(path.resolve("src/app/api/auth"))).toBe(false);
 });
 it("uses no-store and never discloses credentials in results, errors or persistent bearer storage", async () => {
  const f = await started(), logs = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
  const results = [await api(f, undefined, create()), await api(f, undefined, { password: "TEST invalid credential" })];
  for (const result of results) { expect(result.headers["cache-control"]).toContain("no-store"); expect(result.cookies).toEqual([]); for (const secret of [...sensitive, ...credentialHashes]) expect(result.body.includes(secret)).toBe(false); }
  for (const log of logs) for (const args of log.mock.calls) for (const secret of [...sensitive, ...credentialHashes]) expect(stable(args).includes(secret)).toBe(false);
  for (const suffix of ["", "-wal"]) { const filename = path.join(f.config.authorization.database.directory, "test.sqlite3") + suffix; if (existsSync(filename)) for (const secret of sensitive) expect(readFileSync(filename).includes(Buffer.from(secret))).toBe(false); }
 });
 it("resolves an uncertain mutation by non-bearer request key through Admin authorization", async () => {
  const f=await started(), command=create(), saved=decode<MutationResult>(await api(f, undefined, command));
  const endpoint="/api/admin/inventory/operations/"+command.requestKey;
  expect(decode(await api(f,endpoint))).toEqual(saved);
  expect((await wire(f.config,endpoint)).status).toBe(403);
  expect((await api(f,"/api/admin/inventory/operations/"+randomUUID())).status).toBe(404);
 });
 it("preserves five-failure 30-second cooldown before allowing real Admin login", async () => {
  const f=await started(), wrong={password:"TEST incorrect "+randomUUID()};
  for(let n=0;n<5;n++) expect((await wire(f.config,"/api/auth/login","ADMIN",[],wrong)).status).toBe(401);
  const original=Date.now;
  await expect(login(f.config)).rejects.toBeDefined();
  clock.offset = 31000; vi.spyOn(Date,"now").mockImplementation(()=>original()+clock.offset);
  expect((await login(f.config)).length).toBeGreaterThan(0);
 });
 it("denies unavailable SQL after successful login without publishing inventory", async () => {
  const f=await started(), prepare=Native.prototype.prepare;
  vi.spyOn(Native.prototype,"prepare").mockImplementation(function(this:Native,statement:string){
   if(statement.includes("auth_principals")) throw Error("TEST SQL failure detail");
   return prepare.call(this,statement);
  });
  const result=await api(f);expect([403,503]).toContain(result.status);expect(result.body).not.toMatch(/SQL|detail|items/);
 });

 it("withholds HTTP success while the real writer transaction is still uncommitted",async()=>{
  const f=await started();fault();let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});probe.releases.push(release);probe.beforeCommit=async()=>{entered();await gate;};
  let completed=false;const reply=api(f,undefined,create()).then(r=>{completed=true;return r;});await ready;
  expect(completed).toBe(false);f.inspect(db=>expect(db.get("SELECT count(*) AS n FROM products")?.n).toBe(BigInt(0)));
  release();expect((await reply).status).toBe(200);f.inspect(db=>expect(db.get("SELECT count(*) AS n FROM products")?.n).toBe(BigInt(1)));
 });
 it("shutdown after COMMIT never reports a late success and reconciles after restart",async()=>{
  const f=await started(),command=create();fault();let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});probe.releases.push(release);probe.afterCommit=async()=>{entered();await gate;};
  const reply=api(f,undefined,command);await ready;const closing=f.runtime.close();release();expect((await reply).status).toBe(503);await closing;
  const restarted=await f.start();runtimes.push(restarted);f.cookies=await login(f.config);
  const result=decode<MutationResult>(await api(f,"/api/admin/inventory/operations/"+command.requestKey));expect(result.product.quantity).toBe("5");f.inspect(db=>expect(db.get("SELECT count(*) AS n FROM products")?.n).toBe(BigInt(1)));
 });

 it("ordinary Next start cannot expose the TEST APIs or select live UI through a forged header",async()=>{
  const f=await started(),p=decode<MutationResult>(await api(f,undefined,create()));await f.runtime.close();
  // Sequential negative control ONLY: no gateway/database owner in this process,
  // no parallel backend, LAN listener, TLS bypass or actual cookie/password input.
  const child=execFile(process.execPath,[path.resolve("node_modules/next/dist/bin/next"),"start",f.config.applicationDirectory,"--hostname","127.0.0.1","--port",String(f.config.port)],{env:{...process.env,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1"},windowsHide:true});
  child.stdout?.resume();child.stderr?.resume();
  const direct=(endpoint:string)=>new Promise<{status:number;body:string}>((resolve,reject)=>{
   const request=http.get({hostname:"127.0.0.1",port:f.config.port,path:endpoint,agent:false,headers:{"x-shop-pos-inventory-test":"true"}},response=>{const chunks:Buffer[]=[];response.on("data",c=>chunks.push(c));response.on("end",()=>resolve({status:response.statusCode!,body:Buffer.concat(chunks).toString()}));});request.on("error",reject);
  });
  try{
   await eventually(async()=>{try{return(await direct("/api/health")).status;}catch{return 0;}}).toBe(200);
   for(const endpoint of ["/api/admin/products","/api/auth/login"]){expect((await direct(endpoint)).status).toBe(404);}
   const preview=await direct("/admin/products");expect(preview.status).toBe(200);expect(preview.body).toContain("Demo Data");expect(preview.body).not.toContain(p.product.name);expect(preview.body).not.toContain("Authenticated TEST inventory only.");
  }finally{if(child.exitCode===null){const ended=once(child,"exit");child.kill();await ended;}}
 });

 it("rolls back receiving COMMIT failure and preserves auth, latch, history and integrity",async()=>{
  const f=await started(),p=decode<MutationResult>(await api(f,undefined,create())).product;
  const auth=()=>f.inspect(db=>stable(["auth_users","auth_credentials","auth_principals","auth_provisioning","auth_enrollment_binding","schema_migrations"].map(t=>db.all("SELECT * FROM "+t+" ORDER BY rowid"))));
  const authBefore=auth(),before=f.snapshot(),command=receive(p),endpoint="/api/admin/products/"+p.id+"/receive";fault();probe.fail=true;
  expect((await api(f,endpoint,command)).status).toBe(503);expect(probe.fail).toBe(false);expect(f.snapshot()===before).toBe(true);
  expect(decode<MutationResult>(await api(f,endpoint,command)).product.quantity).toBe("7");expect(auth()===authBefore).toBe(true);
  f.inspect(db=>{expect(db.all("SELECT * FROM pragma_foreign_key_check")).toEqual([]);expect(db.get("SELECT quick_check FROM pragma_quick_check")?.quick_check).toBe("ok");});
 });

});

const eventually = <T>(fn: () => T | Promise<T>) => expect.poll(fn, { timeout: 10000 });
async function browserContext() {
 const spki = createHash("sha256").update(new X509Certificate(material.certificate).publicKey.export({ type: "spki", format: "der" })).digest("base64");
 const browser = await chromium.launch({ headless: true, args: ["--enable-automation", "--ignore-certificate-errors-spki-list=" + spki] }); browsers.push(browser);
 const context = await browser.newContext({ ignoreHTTPSErrors: false, serviceWorkers: "block" });
 return context;
}
async function browserLogin(page: Page, f: Awaited<ReturnType<typeof fixture>>, role: "ADMIN" | "SALESPERSON" = "ADMIN") {
 await page.goto(f.config.authorization.origins[role] + "/api/health");
 const result = await page.evaluate(async password => { const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }), cache: "no-store" }); return { status: response.status, body: await response.text() }; }, passwords[role]);
 expect(result).toEqual({ status: 200, body: '{"ok":true}' });
}
async function fillProduct(page: Page, name: string, quantity = "5") {
 await page.getByLabel("Product Name", { exact: false }).fill(name);
 await page.getByLabel("Buying Price (Rs.)", { exact: false }).fill("12.50");
 await page.getByLabel("Selling Price (Rs.)", { exact: false }).fill("15.00");
 await page.getByLabel("Stock Quantity", { exact: false }).fill(quantity);
 await page.getByLabel("Low Stock Alert", { exact: false }).fill("5");
}
async function assertNoSecrets(page: Page, context: BrowserContext) {
 const state = await page.evaluate(() => ({ text: document.cookie, local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage), url: location.href }));
 for (const secret of [...sensitive, ...credentialHashes]) expect(stable(state).includes(secret)).toBe(false);
 const cookies = await context.cookies(); expect(cookies.filter(c => c.name.includes("pos-admin")).every(c => c.httpOnly && c.secure && c.sameSite === "Strict" && c.domain === "localhost")).toBe(true);
}
describe("B2 Part5 genuine browser vertical slice", () => {
 it("creates, searches, receives, reads totals and persists after restart with fresh real authentication", async () => {
  const f=await fixture(), first=await f.start(); runtimes.push(first); const context=await browserContext(), page=await context.newPage(); await browserLogin(page,f);
  await page.goto(f.config.authorization.origins.ADMIN+"/admin/products"); await eventually(()=>page.getByText("No saved products match this view.").isVisible()).toBe(true);
  await page.getByRole("link",{name:/Add Product/}).click(); const name="TEST browser product "+randomUUID(); await fillProduct(page,name);
  await page.getByRole("button",{name:"Save Product",exact:true}).click(); await eventually(()=>page.getByRole("region",{name:"Operation recovery"}).getByText("Saved operation confirmed from SQLite.",{exact:false}).isVisible()).toBe(true);
  await page.getByRole("button",{name:"Acknowledge Saved Operation",exact:true}).click(); await eventually(()=>page.getByRole("region",{name:"Operation recovery"}).count()).toBe(0);
  await page.getByRole("link",{name:"View Products"}).click(); await page.getByRole("searchbox").fill(name); await eventually(()=>page.getByRole("article",{name,exact:true}).count()).toBe(1);
  const article=page.getByRole("article",{name,exact:true}); await article.getByText("Details",{exact:true}).click(); await eventually(()=>article.getByText("Rs. 12.50",{exact:true}).isVisible()).toBe(true);
  await article.getByRole("button",{name:"Add stock for "+name}).click(); await page.getByLabel("Quantity Bought").fill("2"); await page.getByLabel("Reason",{exact:true}).fill("TEST browser delivery");
  await page.getByRole("button",{name:"Add Stock",exact:true}).click(); await eventually(()=>page.getByRole("dialog").count()).toBe(0); await eventually(()=>article.getByText("7 PACK",{exact:true}).isVisible()).toBe(true);
  await page.goto(f.config.authorization.origins.ADMIN+"/admin/inventory/available-stock"); await eventually(()=>page.getByRole("row").filter({hasText:name}).count()).toBe(1); expect(await page.getByRole("definition").allTextContents()).toContain("Rs. 87.50");
  await page.getByRole("button",{name:"Low Stock",exact:true}).click(); await eventually(()=>page.getByText("No saved products match this view.").isVisible()).toBe(true);
  await page.goto(f.config.authorization.origins.ADMIN+"/admin/inventory/low-stock"); await eventually(()=>page.getByText("No saved products match this view.").isVisible()).toBe(true);
  const before=f.snapshot(); await first.close(); const second=await f.start(); runtimes.push(second);
  const denied=await page.reload(); expect(denied?.status()).toBe(403); expect((await page.content()).includes(name)).toBe(false);
  await browserLogin(page,f); await page.goto(f.config.authorization.origins.ADMIN+"/admin/products"); await eventually(()=>page.getByRole("article",{name,exact:true}).getByText("7 PACK",{exact:true}).isVisible()).toBe(true);
  await page.reload(); await eventually(()=>page.getByRole("article",{name,exact:true}).count()).toBe(1); expect(f.snapshot()).toBe(before);
  f.inspect(db=>{expect(db.get("SELECT count(*) AS n FROM stock_movements")?.n).toBe(BigInt(2));expect(db.get("SELECT sum(delta_q) AS q FROM stock_movements")?.q).toBe(BigInt(7000000));expect(db.get("SELECT count(*) AS n FROM product_events")?.n).toBe(BigInt(2));});
  await assertNoSecrets(page,context);
 });
 it("reports invalid fields honestly, preserves input and resolves an actually lost HTTP save without a second POST", async()=>{
  const f=await fixture(), runtime=await f.start();runtimes.push(runtime);const context=await browserContext(),page=await context.newPage();await browserLogin(page,f);await page.goto(f.config.authorization.origins.ADMIN+"/admin/products/new");
  const name="TEST uncertain browser "+randomUUID();await fillProduct(page,name);await page.getByLabel("Stock Quantity",{exact:false}).fill("1.5");await page.getByRole("button",{name:"Save Product",exact:true}).click();await eventually(()=>page.getByRole("alert").filter({ hasText: "Check required fields" }).isVisible()).toBe(true);expect(await page.getByLabel("Product Name",{exact:false}).inputValue()).toBe(name);expect(f.snapshot()).not.toContain(name);
  await page.getByLabel("Stock Quantity",{exact:false}).fill("5");const cdp=await context.newCDPSession(page);let aborted=false,posts=0;
  page.on("request",request=>{if(request.method()==="POST"&&request.url().endsWith("/api/admin/products"))posts++;});
  await cdp.send("Fetch.enable",{patterns:[{urlPattern:"*/api/admin/products",requestStage:"Response"}]});
  cdp.on("Fetch.requestPaused",event=>{void(async()=>{if(!aborted&&event.responseStatusCode===200){aborted=true;await cdp.send("Fetch.failRequest",{requestId:event.requestId,errorReason:"Aborted"});await cdp.send("Fetch.disable");}else await cdp.send("Fetch.continueRequest",{requestId:event.requestId});})();});
  await page.getByRole("button",{name:"Save Product",exact:true}).click();await eventually(()=>page.getByRole("alert").filter({hasText:"Save unconfirmed or blocked"}).isVisible()).toBe(true);expect(aborted).toBe(true);f.inspect(db=>expect(db.get("SELECT count(*) AS n FROM products")?.n).toBe(BigInt(1)));
  await page.getByRole("button",{name:"Resolve Previous Operation"}).click();await eventually(()=>page.getByRole("region",{name:"Operation recovery"}).getByText("Saved operation confirmed from SQLite.",{exact:false}).isVisible()).toBe(true);expect(posts).toBe(1);f.inspect(db=>expect(db.get("SELECT count(*) AS n FROM inventory_operations")?.n).toBe(BigInt(1)));await assertNoSecrets(page,context);
 });
 it("denies anonymous and Salesperson HTML/RSC/network access, then real Back to Login revokes stale access",async()=>{
  const f=await started(), saved=decode<MutationResult>(await api(f,undefined,create({name:"TEST browser private "+randomUUID()}))), context=await browserContext(),page=await context.newPage();
  const anonymous=await page.goto(f.config.authorization.origins.ADMIN+"/admin/products");expect(anonymous?.status()).toBe(403);expect((await page.content()).includes(saved.product.name)).toBe(false);
  await browserLogin(page,f,"SALESPERSON");for(const endpoint of ["/admin/products","/admin/products?_rsc=check","/api/admin/products"]){const reply=await page.goto(f.config.authorization.origins.SALESPERSON+endpoint);expect(reply?.status()).toBe(403);expect((await page.content()).includes(saved.product.name)).toBe(false);}
  await browserLogin(page,f);await page.goto(f.config.authorization.origins.ADMIN+"/admin/products");await eventually(()=>page.getByRole("article",{name:saved.product.name,exact:true}).count()).toBe(1);await page.getByRole("button",{name:"Back to Login",exact:true}).click();await page.waitForURL("**/api/auth/session");expect(await page.locator("body").innerText()).toContain('"authenticated":false');
  const denied=await page.goto(f.config.authorization.origins.ADMIN+"/admin/products");expect(denied?.status()).toBe(403);
 });
});
