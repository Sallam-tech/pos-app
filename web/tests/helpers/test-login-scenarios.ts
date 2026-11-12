import { createHash, randomBytes, randomUUID, X509Certificate } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { fixture, initialize, passwords, material, run, sensitive, credentialHashes, wire, login } from "../helpers/inventory-http-fixture";
import type { LocalRuntime } from "../../src/server/hosting/runtime";
import type { Role } from "../../src/server/auth/types";
const FaultDatabase = createRequire(import.meta.url)("better-sqlite3") as new (filename: string) => { exec(sql: string): void; close(): void };
const contexts: BrowserContext[] = [], runtimes: LocalRuntime[] = [];
type Fixture = Awaited<ReturnType<typeof fixture>>;
const poll = <T>(work: () => T | Promise<T>) => expect.poll(work, { timeout: 15000 });
async function started() { const f = await fixture(), runtime = await f.start(); runtimes.push(runtime); return { ...f, runtime }; }
async function browser() {
 const spki = createHash("sha256").update(new X509Certificate(material.certificate).publicKey.export({ type: "spki", format: "der" })).digest("base64");
 const context = await chromium.launchPersistentContext(mkdtempSync(path.join(run, "login-browser-")), { headless: true, ignoreHTTPSErrors: false, serviceWorkers: "block", args: ["--enable-automation", "--ignore-certificate-errors-spki-list=" + spki] });
 contexts.push(context); return context;
}
async function open(page: Page, f: Fixture, role: Role = "ADMIN") {
 await page.goto(f.config.authorization.origins[role] + "/login");
 await poll(() => page.getByRole("button", { name: "Open Shop", exact: true }).isEnabled()).toBe(true);
 expect(await page.locator("#login-password").inputValue() === "").toBe(true);
}
// Avoid diagnostic call logs containing supplied credentials.
async function enter(page: Page, value: string) { try { await page.locator("#login-password").fill(value); } catch { throw Error("TEST credential input unavailable"); } }
async function submit(page: Page, value: string) { await enter(page,value); await page.getByRole("button", { name: "Open Shop", exact: true }).click(); }
async function status(page: Page) { return page.evaluate(async () => { const response = await fetch("/api/auth/session", { cache: "no-store" }); return { status: response.status, body: await response.json() }; }); }
async function signed(page: Page, f: Fixture, role: Role = "ADMIN") {
 await open(page,f,role); await submit(page,passwords[role]);
 if (role === "ADMIN") await poll(() => new URL(page.url()).pathname).toBe("/admin/products");
 else await poll(() => page.getByText("Salesperson signed in for this TEST session.", { exact: false }).isVisible()).toBe(true);
 expect((await status(page)).body).toEqual({ authenticated: true });
}
export function registerLoginScenario(selected: number) {
let scenario = 0;
const check: typeof it = ((name: string, work: () => Promise<void>) => { if (scenario++ === selected) return it(name,work); }) as typeof it;
beforeAll(async () => {
 if (selected === 7) { passwords.ADMIN = [...randomBytes(128)].map(n => String.fromCodePoint(0x10000 + n)).join(""); sensitive.add(passwords.ADMIN); }
 await initialize();
});
afterEach(async () => { for (const c of contexts.splice(0)) await c.close().catch(() => {}); for (const r of runtimes.splice(0)) await r.close(); });
describe("real isolated TEST Login through trusted HTTPS and authoritative SQLite", () => {
 check("admits only fixed-role Login/assets; raw framework, business pages and alternate Next routes stay closed", async () => {
  const f = await started();
  for (const role of ["ADMIN","SALESPERSON"] as const) {
   const reply = await wire(f.config,"/login",role);
   expect(reply.status).toBe(200); expect(reply.body.includes(role === "ADMIN" ? "Admin / Isolated TEST" : "Salesperson / Isolated TEST")).toBe(true);
   expect(reply.body.includes("Explore Demo")).toBe(false); expect(reply.cookies.length).toBe(0);
   for (const endpoint of ["/api/auth/sign-up/email","/api/auth/get-session","/pos","/admin/dashboard","/login?role=ADMIN"]) expect((await wire(f.config,endpoint,role)).status).toBe(404);
   expect((await wire(f.config,"/admin/products",role)).status).toBe(403);
   expect((await wire(f.config,"/login",role,[],undefined,{headers:{origin:"https://untrusted.invalid"}})).status).toBe(403);
   expect((await wire(f.config,"/login",role,[],{})).status).toBe(405);
  }
 });
 check("signs Admin in, logs out on Back to Login, and requires empty fresh input without business changes", async () => {
  const f = await started(), seedCookies = await login(f.config);
  const binding = JSON.parse((await wire(f.config,"/api/admin/inventory/recovery-context","ADMIN",seedCookies)).body).context;
  const seeded = await wire(f.config,"/api/admin/products","ADMIN",seedCookies,{requestKey:randomUUID(),name:"TEST preserved Login stock",unit:"PACK",buyingPricePaisa:"1250",sellingPricePaisa:"1500",sellingActive:true,openingQuantity:"5",lowStockThreshold:"2"}, {headers:{origin:f.config.authorization.origins.ADMIN,cookie:seedCookies.map(c=>c.split(";")[0]).join("; "),"content-type":"application/json","x-inventory-context":binding}});
  expect(seeded.status).toBe(200); expect(JSON.parse(seeded.body).product.quantity).toBe("5");
  expect((await wire(f.config,"/api/auth/logout","ADMIN",seedCookies,{})).status).toBe(200);
  const before = f.snapshot(), context = await browser(), page = await context.newPage(); await signed(page,f);
  const old = await context.cookies(f.config.authorization.origins.ADMIN);
  expect(old.length > 0).toBe(true); expect(old.every(c => c.secure && c.httpOnly && c.sameSite === "Strict" && c.domain === "localhost")).toBe(true);
  await page.getByRole("button",{name:"Back to Login",exact:true}).click(); await poll(() => new URL(page.url()).pathname).toBe("/login");
  await poll(() => page.getByRole("button",{name:"Open Shop",exact:true}).isEnabled()).toBe(true);
  expect(await page.locator("#login-password").inputValue() === "").toBe(true); expect((await status(page)).body).toEqual({authenticated:false});
  expect((await wire(f.config,"/api/admin/products","ADMIN",old.map(c => c.name + "=" + c.value))).status).toBe(403);
  await submit(page,passwords.ADMIN); await poll(() => new URL(page.url()).pathname).toBe("/admin/products");
  await open(page,f); expect((await status(page)).body).toEqual({authenticated:false}); expect(f.snapshot() === before).toBe(true);
 });
 check("isolates Salesperson, requires fresh Back to Login, and does not expose an unimplemented sales screen", async () => {
  const f = await started(), before = f.snapshot(), context = await browser(), admin = await context.newPage(), staff = await context.newPage();
  await signed(admin,f); await signed(staff,f,"SALESPERSON");
  expect(new URL(staff.url()).pathname).toBe("/login"); expect(await staff.evaluate(async () => (await fetch("/api/admin/products")).status)).toBe(403);
  const cookies = await context.cookies(); expect(cookies.some(c => c.domain === "localhost")).toBe(true); expect(cookies.some(c => c.domain === "127.0.0.1")).toBe(true);
  await staff.getByRole("button",{name:"Back to Login",exact:true}).click(); await poll(() => staff.getByRole("button",{name:"Open Shop",exact:true}).isEnabled()).toBe(true);
  expect((await status(staff)).body).toEqual({authenticated:false}); expect((await status(admin)).body).toEqual({authenticated:true});
  expect(await staff.locator("#login-password").inputValue() === "").toBe(true); expect(f.snapshot() === before).toBe(true);
 });
 check("preserves five-failure 30-second cooldown across restart; correct input cannot bypass it", async () => {
  const f = await started(), context = await browser(), page = await context.newPage(); await open(page,f);
  const wrong = randomBytes(24).toString("base64url"); sensitive.add(wrong);
  for (let i=0;i<5;i++) { await submit(page,wrong); await poll(() => page.getByText("Sign-in unavailable or details incorrect.",{exact:true}).isVisible()).toBe(true); await poll(() => page.getByRole("button",{name:"Open Shop",exact:true}).isEnabled()).toBe(true); expect(await page.locator("#login-password").inputValue() === "").toBe(true); }
  const checkpoint = f.inspect(db => db.get("SELECT * FROM auth_login_attempts WHERE bucket='ADMIN'")); expect(checkpoint !== undefined).toBe(true); expect(checkpoint!.cooldown_until_ms as bigint).toBe((checkpoint!.last_seen_ms as bigint) + BigInt(30000));
  await f.runtime.close(); const next = await f.start(); runtimes.push(next);
  const after = f.inspect(db => db.get("SELECT * FROM auth_login_attempts WHERE bucket='ADMIN'"));
  const stable = (v:unknown) => JSON.stringify(v,(_,x) => typeof x === "bigint" ? String(x) : x);
  expect(stable(after) === stable(checkpoint)).toBe(true);
  // Next custom renderers are process-lifetime cached. Restart verification uses
  // the actual HTTPS authentication dispatcher, without reusing a closed renderer.
  const denied = await wire(f.config,"/api/auth/login","ADMIN",[],{password:passwords.ADMIN});
  expect(denied.status).not.toBe(200); expect(denied.cookies.length).toBe(0);
  expect((await wire(f.config,"/api/auth/session")).body).toBe(JSON.stringify({authenticated:false}));
  expect(f.inspect(db => db.get("SELECT count(*) AS n FROM auth_session_authorizations WHERE revoked_at_ms IS NULL")?.n)).toBe(BigInt(0));
 });
 check("denies uncertain logout and unavailable SQLite, without enabling an unsafe credential submission", async () => {
  const f = await started(), context = await browser(), page = await context.newPage();
  await page.route("**/api/auth/logout",route => route.abort("connectionfailed")); await page.goto(f.config.authorization.origins.ADMIN + "/login");
  await poll(() => page.getByRole("button",{name:"Retry Secure Sign-in",exact:true}).isVisible()).toBe(true); expect(await page.getByRole("button",{name:"Open Shop",exact:true}).isDisabled()).toBe(true);
  await page.unroute("**/api/auth/logout"); await page.getByRole("button",{name:"Retry Secure Sign-in",exact:true}).click(); await poll(() => page.getByRole("button",{name:"Open Shop",exact:true}).isEnabled()).toBe(true);
  (() => { const fault = new FaultDatabase(path.join(f.config.authorization.database.directory,"test.sqlite3")); try { fault.exec("DROP TABLE auth_login_attempts"); } finally { fault.close(); } })(); await submit(page,passwords.ADMIN);
  await poll(() => page.getByText("Sign-in unavailable or details incorrect.",{exact:true}).isVisible()).toBe(true);
  expect((await status(page)).body).toEqual({authenticated:false}); expect(await page.locator("#login-password").inputValue() === "").toBe(true);
 });
 check("retains original unresolved IndexedDB marker across Back to Login and fresh authentication", async () => {
  const f = await started(), context = await browser(), page = await context.newPage(); await signed(page,f);
  const contextReply = await page.evaluate(async () => (await fetch("/api/admin/inventory/recovery-context")).json());
  const marker = {v:1,key:randomUUID(),kind:"CREATE",context:contextReply.context,state:"PENDING"};
  await page.evaluate(value => new Promise<void>((resolve,reject) => { const r=indexedDB.open("pos-test-inventory-recovery-v1",1); r.onupgradeneeded=()=>r.result.createObjectStore("marker"); r.onerror=()=>reject(Error("TEST storage")); r.onsuccess=()=>{const db=r.result,tx=db.transaction("marker","readwrite");tx.objectStore("marker").put(value,"active");tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(Error("TEST storage"));};}),marker);
  await page.getByRole("button",{name:"Back to Login",exact:true}).click(); await poll(() => page.getByRole("button",{name:"Open Shop",exact:true}).isEnabled()).toBe(true);
  await submit(page,passwords.ADMIN); await poll(() => new URL(page.url()).pathname).toBe("/admin/products");
  await poll(() => page.getByRole("region",{name:"Operation recovery",exact:true}).getByText("UNKNOWN:",{exact:false}).isVisible()).toBe(true);
  const saved = await page.evaluate(() => new Promise(resolve => {const r=indexedDB.open("pos-test-inventory-recovery-v1",1);r.onsuccess=()=>{const db=r.result,tx=db.transaction("marker"),read=tx.objectStore("marker").get("active");read.onsuccess=()=>resolve(read.result);tx.oncomplete=()=>db.close();};}));
  expect(saved).toEqual(marker); expect(f.inspect(db => db.get("SELECT count(*) AS n FROM inventory_cancellations")?.n)).toBe(BigInt(0));
 });
 check("clears submitted input and exposes no credential or bearer in ordinary JSON, storage, URL or visible cookies", async () => {
  const f = await started(), context = await browser(), page = await context.newPage(); await signed(page,f,"SALESPERSON");
  const visible = await page.evaluate(async () => ({local:JSON.stringify(localStorage),session:JSON.stringify(sessionStorage),cookies:document.cookie,url:location.href,html:document.body.innerText,status:await(await fetch("/api/auth/session")).text(),inputEmpty:(document.querySelector("#login-password") as HTMLInputElement).value === ""}));
  expect(visible.inputEmpty).toBe(true); expect(JSON.parse(visible.status)).toEqual({authenticated:true});
  for(const cookie of await context.cookies())sensitive.add(cookie.value);
  for(const secret of [...sensitive,...credentialHashes])expect(JSON.stringify(visible).includes(secret)).toBe(false);
  expect(visible.cookies).not.toMatch(/session|pos-/i); expect(visible.url.includes("?")).toBe(false); expect(await page.locator("#login-password").getAttribute("autocomplete")).toBe("off");
 });
 check("rejects oversized input without authenticating a silently truncated Unicode prefix", async () => {
  const f = await started(), context = await browser(), page = await context.newPage(); await open(page,f);
  const before = f.inspect(db => db.get("SELECT revision FROM auth_login_attempts WHERE bucket='ADMIN'")?.revision);
  const oversized = passwords.ADMIN + "x";
  await enter(page,oversized); expect(await page.locator("#login-password").inputValue() === oversized).toBe(true);
  await page.getByRole("button",{name:"Open Shop",exact:true}).click();
  await poll(() => page.getByText("Enter your 8 to 128 character password.",{exact:true}).isVisible()).toBe(true);
  expect((await status(page)).body).toEqual({authenticated:false});
  expect(f.inspect(db => db.get("SELECT revision FROM auth_login_attempts WHERE bucket='ADMIN'")?.revision)).toBe(before);
  const prevented = await page.locator("#login-password").evaluate(input => { const data = new DataTransfer(); data.setData("text","TEST\nunsupported"); return !input.dispatchEvent(new ClipboardEvent("paste",{clipboardData:data,bubbles:true,cancelable:true})); });
  expect(prevented).toBe(true); expect(await page.locator("#login-password").inputValue() === "").toBe(true);
  await submit(page,passwords.ADMIN); await poll(() => new URL(page.url()).pathname).toBe("/admin/products");
  expect((await status(page)).body).toEqual({authenticated:true});
 });

});

}
