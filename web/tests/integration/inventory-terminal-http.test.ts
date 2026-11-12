import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fixture, initialize, login, wire, passwords, sensitive, credentialHashes } from "../helpers/inventory-http-fixture";
import type { LocalRuntime } from "../../src/server/hosting/runtime";
import type { MutationResult, Kind } from "../../src/server/inventory/contracts";
import { openAuthorizationGateway } from "../../src/server/auth/gateway";
import { createInventoryService } from "../../src/server/inventory/service";
import { inventoryRecoveryContext } from "../../src/server/inventory/recovery-context";
const runtimes: LocalRuntime[] = [];
type Fixture = Awaited<ReturnType<typeof fixture>>;
interface Native { inTransaction: boolean; pragma(sql: string): unknown; prepare(sql: string): { run(): unknown } }
const Native = createRequire(import.meta.url)("better-sqlite3") as { prototype: Native };
const create = (key = randomUUID()) => ({ requestKey: key, name: "TEST terminal " + randomUUID(), unit: "PACK", buyingPricePaisa: "1250", sellingPricePaisa: "1500", sellingActive: true, openingQuantity: "5", lowStockThreshold: "2" });
async function started() { const f = await fixture(), runtime = await f.start(); runtimes.push(runtime); const cookies = await login(f.config); return { ...f, runtime, cookies }; }
async function context(f: Fixture, cookies: string[]) { const response = await wire(f.config, "/api/admin/inventory/recovery-context", "ADMIN", cookies); expect(response.status).toBe(200); return JSON.parse(response.body).context as string; }
const route = (key: string) => "/api/admin/inventory/operations/" + key + "/recovery";
function recovery(f: Fixture, cookies: string[], key: string, binding: string, kind: Kind = "CREATE", cancel = false, options: import("node:https").RequestOptions = {}) {
 return wire(f.config, route(key), "ADMIN", cookies, cancel ? { kind, action: "RECONCILE_OR_CANCEL" } : undefined,
  { ...options, headers: { origin: f.config.authorization.origins.ADMIN, cookie: cookies.map(c => c.split(";")[0]).join("; "), "x-inventory-context": binding, "x-inventory-operation": kind,
   ...(cancel ? { "content-type": "application/json" } : {}), ...options.headers } });
}
const post = (f: Fixture, cookies: string[], binding: string, value: unknown, endpoint = "/api/admin/products") => wire(f.config, endpoint, "ADMIN", cookies, value,
 { headers: { origin: f.config.authorization.origins.ADMIN, cookie: cookies.map(c => c.split(";")[0]).join("; "), "content-type": "application/json", "x-inventory-context": binding } });
beforeAll(initialize);
afterEach(async () => { vi.restoreAllMocks(); for (const r of runtimes.splice(0)) await r.close(); });
describe("approved terminal recovery real HTTPS/Better Auth/SQLite", () => {
 it("keeps UNKNOWN read-only, cancels explicitly, and permanently fences delayed CREATE", async () => {
  const f = await started(), binding = await context(f, f.cookies), command = create(), before = f.snapshot();
  expect((await recovery(f, f.cookies, command.requestKey, binding)).status).toBe(404); expect(f.snapshot()).toBe(before);
  const cancel = await recovery(f, f.cookies, command.requestKey, binding, "CREATE", true); expect(cancel.status).toBe(200); expect(JSON.parse(cancel.body)).toEqual({ outcome: "CANCELLED" });
  expect(cancel.headers["x-inventory-context"]).toBe(binding); expect(cancel.headers["x-inventory-operation"]).toBe("CREATE");
  expect((await post(f, f.cookies, binding, command)).status).toBe(409); expect(f.snapshot()).toBe(before);
  for (let i = 0; i < 3; i++) expect((await recovery(f, f.cookies, command.requestKey, binding, "CREATE", true)).body).toBe(cancel.body);
  f.inspect(db => { expect(db.get("SELECT count(*) AS n FROM inventory_cancellations")?.n).toBe(BigInt(1)); expect(db.get("SELECT count(*) AS n FROM inventory_operations")?.n).toBe(BigInt(0)); });
 });
 it("returns committed CREATE/RECEIVE history without creating cancellation or duplicate stock", async () => {
  const f = await started(), binding = await context(f, f.cookies), command = create(), first = await post(f, f.cookies, binding, command); expect(first.status).toBe(200);
  const saved = JSON.parse(first.body) as MutationResult, before = f.snapshot();
  for (const cancel of [false, true, true]) {
   const reply = await recovery(f, f.cookies, command.requestKey, binding, "CREATE", cancel); expect(reply.status).toBe(200); expect(JSON.parse(reply.body)).toEqual({ outcome: "COMMITTED", result: saved });
  }
  expect(f.snapshot()).toBe(before); expect((await post(f, f.cookies, binding, command)).body).toBe(first.body);
  const receive = { requestKey: randomUUID(), productId: saved.product.id, expectedProductVersion: "1", expectedBalanceVersion: "1", reason: "TEST", quantity: "2", unitBuyingPricePaisa: "1250" };
  const added = await post(f, f.cookies, binding, receive, "/api/admin/products/" + saved.product.id + "/receive"); expect(added.status).toBe(200);
  const recovered = await recovery(f, f.cookies, receive.requestKey, binding, "RECEIVE", true); expect(recovered.status).toBe(200); expect(JSON.parse(recovered.body)).toEqual({ outcome: "COMMITTED", result: JSON.parse(added.body) });
  f.inspect(db => { expect(db.get("SELECT sellable_q FROM stock_balances")?.sellable_q).toBe(BigInt(7000000)); expect(db.get("SELECT count(*) AS n FROM inventory_cancellations")?.n).toBe(BigInt(0)); });
 });
 it("serializes duplicate cancellation and cancellation-versus-execution with exactly one terminal outcome", async () => {
  const f = await started(), binding = await context(f, f.cookies);
  for (const cancellationFirst of [true, false]) {
   const command = create(), actions = [() => recovery(f, f.cookies, command.requestKey, binding, "CREATE", true), () => post(f, f.cookies, binding, command)];
   if (!cancellationFirst) actions.reverse(); const replies = await Promise.all(actions.map(a => a())); expect(replies.every(r => [200, 409].includes(r.status))).toBe(true);
   const result = await recovery(f, f.cookies, command.requestKey, binding); expect(result.status).toBe(200);
   f.inspect(db => { const n = db.get("SELECT (SELECT count(*) FROM inventory_operations WHERE request_key=?)+(SELECT count(*) FROM inventory_cancellations WHERE request_key=?) AS n", [command.requestKey, command.requestKey])?.n; expect(n).toBe(BigInt(1)); });
  }
  const key = randomUUID(), replies = await Promise.all(Array.from({ length: 5 }, () => recovery(f, f.cookies, key, binding, "CREATE", true)));
  expect(replies.every(r => r.status === 200 && JSON.parse(r.body).outcome === "CANCELLED")).toBe(true);
  f.inspect(db => expect(db.get("SELECT count(*) AS n FROM inventory_cancellations WHERE request_key=?", [key])?.n).toBe(BigInt(1)));
 });
 it("retains cancellation through restart, denies old cookie, and preserves the operational context", async () => {
  const f = await started(), binding = await context(f, f.cookies), key = randomUUID(), before = f.snapshot();
  expect((await recovery(f, f.cookies, key, binding, "CREATE", true)).status).toBe(200); await f.runtime.close(); const next = await f.start(); runtimes.push(next);
  expect((await recovery(f, f.cookies, key, binding)).status).toBe(403); const cookies = await login(f.config); expect(await context(f, cookies)).toBe(binding);
  expect(JSON.parse((await recovery(f, cookies, key, binding)).body)).toEqual({ outcome: "CANCELLED" }); expect(f.snapshot()).toBe(before);
 });
 it("rolls back cancellation on actual native deferred-FK COMMIT failure and never acknowledges success", async () => {
  const f = await started(), binding = await context(f, f.cookies), key = randomUUID(), before = f.snapshot(), prepare = Native.prototype.prepare;
  let armed = false, fail = true;
  vi.spyOn(Native.prototype, "prepare").mockImplementation(function(this: Native, sql: string) {
   if (/^INSERT INTO inventory_cancellations/.test(sql)) armed = true;
   if (armed && fail && /^commit$/i.test(sql.trim()) && this.inTransaction) { fail = false; this.pragma("defer_foreign_keys=ON"); prepare.call(this, "INSERT INTO product_identifiers VALUES('TEST_MISSING','BARCODE','TEST_ORPHAN')").run(); }
   return prepare.call(this, sql);
  });
  const response = await recovery(f, f.cookies, key, binding, "CREATE", true); expect(response.status).toBe(503); expect(response.cookies.length).toBe(0); expect(fail).toBe(false); vi.restoreAllMocks();
  expect(f.snapshot()).toBe(before); f.inspect(db => expect(db.get("SELECT count(*) AS n FROM inventory_cancellations WHERE request_key=?", [key])?.n).toBe(BigInt(0)));
  expect((await recovery(f, f.cookies, key, binding)).status).toBe(404); expect((await recovery(f, f.cookies, key, binding, "CREATE", true)).status).toBe(200);
 });
 it("keeps a committed cancellation authoritative when its COMMIT acknowledgement is lost", async () => {
  const f = await started(), binding = await context(f,f.cookies), key = randomUUID(), before = f.snapshot(), prepare = Native.prototype.prepare;
  let armed = false, lost = false;
  vi.spyOn(Native.prototype,"prepare").mockImplementation(function(this: Native, sql: string) {
   if (/^INSERT INTO inventory_cancellations/.test(sql)) armed = true;
   const statement = prepare.call(this,sql);
   if (armed && !lost && /^commit$/i.test(sql.trim()) && this.inTransaction) {
    const commit = statement.run.bind(statement);
    statement.run = () => { commit(); lost = true; throw Error("TEST lost COMMIT acknowledgement"); };
   }
   return statement;
  });
  const reply = await recovery(f,f.cookies,key,binding,"CREATE",true);
  expect(lost).toBe(true); expect(reply.status).toBe(503); expect(reply.cookies.length).toBe(0); vi.restoreAllMocks();
  expect(f.snapshot() === before).toBe(true);
  expect(f.inspect(db => db.get("SELECT count(*) AS n FROM inventory_cancellations WHERE request_key=?",[key])?.n)).toBe(BigInt(1));
  // A new explicit authenticated terminal read proves the durable outcome;
  // it never retries cancellation or execution after the uncertain COMMIT.
  const reconciled = await recovery(f,f.cookies,key,binding);
  expect(reconciled.status).toBe(200); expect(JSON.parse(reconciled.body)).toEqual({outcome:"CANCELLED"});
  await f.runtime.close(); const next = await f.start(); runtimes.push(next);
  const cookies = await login(f.config);
  expect(JSON.parse((await recovery(f,cookies,key,binding)).body)).toEqual({outcome:"CANCELLED"});
  expect((await post(f,cookies,binding,create(key))).status).toBe(409); expect(f.snapshot() === before).toBe(true);
 });
 it("fails closed for unavailable SQL and live trigger corruption, including auth endpoints", async () => {
  const f = await started(), binding = await context(f, f.cookies), key = randomUUID(), before = f.snapshot(), prepare = Native.prototype.prepare;
  vi.spyOn(Native.prototype, "prepare").mockImplementation(function(this: Native, sql: string) { if (/FROM inventory_cancellations WHERE request_key/.test(sql)) throw Error("TEST SQLite unavailable"); return prepare.call(this, sql); });
  expect((await recovery(f, f.cookies, key, binding, "CREATE", true)).status).toBe(503); vi.restoreAllMocks(); expect(f.snapshot()).toBe(before);
  // Direct deliberate TEST DDL corruption: never application behavior.
  f.inspect(db => db.transaction(tx => tx.run("CREATE TRIGGER unreviewed BEFORE INSERT ON inventory_cancellations BEGIN SELECT 1; END;")));
  expect((await recovery(f, f.cookies, key, binding)).status).not.toBe(200);
  expect(JSON.parse((await wire(f.config, "/api/auth/session", "ADMIN", f.cookies)).body)).toEqual({ authenticated: false });
  expect((await wire(f.config, "/api/auth/login", "ADMIN", [], { password: passwords.ADMIN })).status).not.toBe(200);
 });
 it("requires original context/kind and genuine current Admin; no public, cross-role or stale authority", async () => {
  const f = await started(), binding = await context(f, f.cookies), key = randomUUID(), staff = await login(f.config, "SALESPERSON"), before = f.snapshot();
  expect((await recovery(f, [], key, binding, "CREATE", true)).status).toBe(403);
  expect((await recovery(f, staff, key, binding, "CREATE", true)).status).toBe(403);
  expect((await wire(f.config, route(key), "SALESPERSON", staff, { kind: "CREATE", action: "RECONCILE_OR_CANCEL" })).status).toBe(403);
  expect((await recovery(f, f.cookies, key, "0".repeat(64), "CREATE", true)).status).toBe(503);
  expect((await recovery(f, f.cookies, key, binding, "CREATE", true)).status).toBe(200);
  expect((await recovery(f, f.cookies, key, binding, "RECEIVE", true)).status).toBe(503); expect(f.snapshot()).toBe(before);
  f.inspect(db => db.transaction(tx => tx.run("UPDATE auth_session_authorizations SET revoked_at_ms=created_at_ms WHERE principal_id='ADMIN'")));
  expect((await recovery(f, f.cookies, key, binding)).status).toBe(403);
 });
 it("enforces exact method/query/body/header/origin/host and safe generic errors", async () => {
  const f = await started(), binding = await context(f, f.cookies), key = randomUUID(), before = f.snapshot();
  for (const method of ["PUT", "DELETE", "OPTIONS", "HEAD"]) expect((await recovery(f, f.cookies, key, binding, "CREATE", false, { method })).status).toBe(405);
  for (const value of [{ kind: "CREATE", action: "DELETE" }, { kind: "CREATE", action: "RECONCILE_OR_CANCEL", role: "ADMIN" }, { kind: "SALE", action: "RECONCILE_OR_CANCEL" }, '{"kind":"CREATE","kind":"RECEIVE","action":"RECONCILE_OR_CANCEL"}', "x".repeat(9000)]) {
   const reply = await wire(f.config, route(key), "ADMIN", f.cookies, value, { headers: { origin: f.config.authorization.origins.ADMIN, cookie: f.cookies.map(c => c.split(";")[0]).join("; "), "content-type": "application/json", "x-inventory-context": binding } });
   expect(reply.status).not.toBe(200); expect(reply.body).not.toMatch(/SQLITE|SELECT |INSERT |Error:|stack/);
  }
  expect((await recovery(f, f.cookies, key, binding, "CREATE", true, { headers: { origin: "https://attacker.invalid" } })).status).toBe(403);
  expect((await recovery(f, f.cookies, key, binding, "CREATE", true, { headers: { host: "attacker.invalid" } })).status).toBe(403);
  expect((await recovery(f, f.cookies, key, binding, "CREATE", true, { headers: { "x-forwarded-host": "localhost" } })).status).toBe(403);
  expect((await wire(f.config, route(key) + "?role=ADMIN", "ADMIN", f.cookies)).status).not.toBe(200);
  expect(f.snapshot()).toBe(before);
 });
 it("fences every existing private mutation kind without business writes", async () => {
  const f = await started(); await f.runtime.close(); const gateway = await openAuthorizationGateway(f.config.authorization, 35);
  try {
   const issue = await gateway.issueAdminSession(await gateway.verifyAdminPassword(passwords.ADMIN));
   const req = new Request(f.config.authorization.origins.ADMIN + "/private", { headers: { origin: f.config.authorization.origins.ADMIN, cookie: issue.headers.getSetCookie().map(c => c.split(";")[0]).join("; ") } });
   const api = createInventoryService(gateway), saved = await api.createProduct(req, create()), p = saved.product;
   const binding = await gateway.withAdminTransaction(req, (tx, actor) => inventoryRecoveryContext(tx, actor));
   const base = { productId: p.id, expectedProductVersion: p.productVersion, reason: "TEST", expectedBalanceVersion: p.balanceVersion };
   const metadata = { productId: p.id, expectedProductVersion: p.productVersion, reason: "TEST" };
   const cases = [
    ["CREATE", "createProduct", create()], ["EDIT", "updateProduct", { ...metadata, name: "TEST edited" }],
    ["SELLING_PRICE", "setSellingPrice", { ...metadata, sellingPricePaisa: "1600" }], ["STATUS", "setSellingStatus", { ...metadata, sellingActive: false }],
    ["ARCHIVE", "archiveProduct", metadata], ["REPRICE", "changeBuyingCost", { ...base, buyingPricePaisa: "1300", confirmAllRemaining: true }],
    ["RECEIVE", "receiveStock", { ...base, quantity: "2", unitBuyingPricePaisa: "1250" }], ["ADJUST", "correctStock", { ...base, targetQuantity: "3" }],
   ] as const;
   const before = f.snapshot();
   for (const [kind, method, value] of cases) {
    const key = randomUUID(); expect(await api.resolveOrCancel(req, { requestKey: key, kind, context: binding, action: "RECONCILE_OR_CANCEL" })).toEqual({ outcome: "CANCELLED" });
    await expect(api[method](req, { ...value, requestKey: key })).rejects.toMatchObject({ code: "CONFLICT" });
   }
   expect(f.snapshot()).toBe(before); f.inspect(db => expect(db.get("SELECT count(*) AS n FROM inventory_cancellations")?.n).toBe(BigInt(8)));
  } finally { await gateway.close(); }
 });
 it("keeps all eight legitimate mutation kinds, exact replays and terminal evidence valid with installed guards", async () => {
  const f = await started(); await f.runtime.close(); const gateway = await openAuthorizationGateway(f.config.authorization,35);
  try {
   const issued = await gateway.issueAdminSession(await gateway.verifyAdminPassword(passwords.ADMIN));
   const req = new Request(f.config.authorization.origins.ADMIN+"/private",{headers:{origin:f.config.authorization.origins.ADMIN,cookie:issued.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")}});
   const api = createInventoryService(gateway), command = create(), first = await api.createProduct(req,command); expect(await api.createProduct(req,command)).toEqual(first);
   const binding = await gateway.withAdminTransaction(req,(tx,actor)=>inventoryRecoveryContext(tx,actor));
   expect(await api.getRecovery(req,{requestKey:command.requestKey,kind:"CREATE",context:binding})).toEqual({outcome:"COMMITTED",result:first});
   let product=first.product;
   const changes = [["EDIT","updateProduct",{name:"TEST changed"}],["SELLING_PRICE","setSellingPrice",{sellingPricePaisa:"1600"}],
    ["STATUS","setSellingStatus",{sellingActive:false}],["REPRICE","changeBuyingCost",{buyingPricePaisa:"1300",confirmAllRemaining:true}],
    ["RECEIVE","receiveStock",{quantity:"2",unitBuyingPricePaisa:"1300"}],["ADJUST","correctStock",{targetQuantity:"6"}],["ARCHIVE","archiveProduct",{}]] as const;
   for (const [kind,method,values] of changes) {
    const requestKey=randomUUID(), stock=["REPRICE","RECEIVE","ADJUST"].includes(kind);
    const input={requestKey,productId:product.id,expectedProductVersion:product.productVersion,reason:"TEST",...(stock?{expectedBalanceVersion:product.balanceVersion}:{}),...values};
    const result=await api[method](req,input); expect(await api[method](req,input)).toEqual(result);
    expect(await api.getRecovery(req,{requestKey,kind,context:binding})).toEqual({outcome:"COMMITTED",result}); product=result.product;
   }
   expect(product).toMatchObject({quantity:"6",stockValuePaisa:"7800",sellingActive:false});
   expect((await api.listProductEvents(req,{productId:product.id})).items).toHaveLength(8);
   expect((await api.listMovements(req,{productId:product.id})).items).toHaveLength(3);
  } finally {await gateway.close();}
 });
 it("returns only terminal safe fields and never persists payloads or bearers in cancellation records", async () => {
  const f = await started(), binding = await context(f, f.cookies), key = randomUUID();
  const reply = await recovery(f, f.cookies, key, binding, "CREATE", true); expect(reply.status).toBe(200); expect(reply.headers["cache-control"]).toBe("no-store, private"); expect(reply.cookies.length).toBe(0);
  for (const secret of [...sensitive, ...credentialHashes, f.config.authorization.database.directory]) expect(reply.body.includes(secret)).toBe(false);
  f.inspect(db => { const row = db.get("SELECT * FROM inventory_cancellations WHERE request_key=?", [key])!; expect(Object.keys(row).sort()).toEqual(["request_key", "context_fingerprint", "kind", "actor_id", "actor_session_ref", "recorded_at_ms"].sort()); expect(row.actor_id).toBe("ADMIN"); expect(row.kind).toBe("CREATE"); expect(typeof row.recorded_at_ms).toBe("bigint"); });
 });
});
