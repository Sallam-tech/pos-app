import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openDatabase, type SqlRow, type SqlValue } from "../../src/server/db/connection";
import { applyMigrations, loadMigrations } from "../../src/server/db/migrate";
import { validateReviewedSchema } from "../../src/server/db/validate-schema";
import { runTrustedFirstRunSetup } from "../../src/server/auth/provision";
import { openAuthorizationGateway } from "../../src/server/auth/gateway";
import { inventoryRecoveryContext } from "../../src/server/inventory/recovery-context";
import { createInventoryService } from "../../src/server/inventory/service";
interface Native {
 inTransaction: boolean; prepare(sql: string): { run(...v: SqlValue[]): unknown; get(...v: SqlValue[]): SqlRow | undefined; all(...v: SqlValue[]): SqlRow[] };
 exec(sql: string): void; pragma(sql: string): unknown; defaultSafeIntegers(v: boolean): void; close(): void;
}
const Driver = createRequire(import.meta.url)("better-sqlite3") as { new(f: string): Native; prototype: Native };
const source = path.resolve("src/server/db/migrations"), root = path.resolve("test-results/sqlite-b1b-part1"); mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "coordinated-schema35-")), legacy = path.join(run, "schema18"), auth8 = path.join(run, "auth8"), base = path.join(run, "base18");
const stable = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
const tables = ["products", "inventory_operations", "stock_balances", "product_identifiers", "stock_movements", "product_events"];
const authority = ["auth_users", "auth_credentials", "auth_principals", "auth_provisioning", "auth_enrollment_binding", "auth_login_attempts", "auth_session_authorizations"];
const passwords = { ADMIN: randomBytes(18).toString("base64url"), SALESPERSON: randomBytes(18).toString("base64url") };
const opens: (() => void | Promise<void>)[] = [];
const config = (directory: string, migrationsDirectory = source) => ({ database: { directory, filename: "test.sqlite3", mode: "test" as const, create: false }, migrationsDirectory,
 origins: { ADMIN: "https://localhost:9773", SALESPERSON: "https://127.0.0.1:9773" }, signingSecrets: { ADMIN: randomBytes(48).toString("base64url"), SALESPERSON: randomBytes(48).toString("base64url") }, sessionLifetimeSeconds: 3600 });
function copy() { const directory = mkdtempSync(path.join(run, "case-")); copyFileSync(path.join(base, "test.sqlite3"), path.join(directory, "test.sqlite3")); return directory; }
function connection(directory: string) { const db = openDatabase(config(directory).database); opens.push(() => db.close()); return db; }
function native(directory: string) { const db = new Driver(path.join(directory, "test.sqlite3")); db.pragma("foreign_keys=ON"); db.pragma("trusted_schema=OFF"); db.defaultSafeIntegers(true); opens.push(() => db.close()); return db; }
async function inspect(db: Native, version: 8 | 18 | 35) {
 db.exec("BEGIN"); try { return await validateReviewedSchema({ get: async (sql, v = []) => db.prepare(sql).get(...v), all: async (sql, v = []) => db.prepare(sql).all(...v) }, version); }
 finally { db.exec("ROLLBACK"); }
}
const history = (db: ReturnType<typeof openDatabase>) => stable(db.all("SELECT * FROM schema_migrations ORDER BY version"));
const snapshot = (db: ReturnType<typeof openDatabase>) => stable([...authority, ...tables].map(t => db.all("SELECT * FROM " + t)));
beforeAll(async () => {
 [legacy, auth8, base].forEach(d => mkdirSync(d));
 for (const file of readdirSync(source).filter(n => /^(?:000[1-9]|001[0-8])_/.test(n))) { copyFileSync(path.join(source, file), path.join(legacy, file)); if (/^000[1-8]_/.test(file)) copyFileSync(path.join(source, file), path.join(auth8, file)); }
 const opts = { ...config(base, auth8).database, create: true }; let db = openDatabase(opts); applyMigrations(db, auth8); db.close();
 await runTrustedFirstRunSetup(config(base, auth8), async () => passwords);
 db = openDatabase({ ...opts, create: false }); applyMigrations(db, legacy); db.close();
 // Generate populated inventory through the real current service on a separate
 // fresh TEST35 copy; transfer those genuine rows into the legacy18 fixture only.
 const seed = copy(), seedDb = openDatabase(config(seed).database); applyMigrations(seedDb, source); seedDb.close();
 const gateway = await openAuthorizationGateway(config(seed), 35);
 try {
  const receipt = await gateway.verifyAdminPassword(passwords.ADMIN), issued = await gateway.issueAdminSession(receipt);
  const req = new Request("https://localhost:9773/private", { headers: { origin: "https://localhost:9773", cookie: issued.headers.getSetCookie().map(c => c.split(";")[0]).join("; ") } });
  const api = createInventoryService(gateway), first = await api.createProduct(req, { requestKey: randomUUID(), name: "TEST preserved inventory", unit: "PACK", buyingPricePaisa: "1250", sellingPricePaisa: "1500", sellingActive: true, openingQuantity: "5", lowStockThreshold: "2" });
  await api.receiveStock(req, { requestKey: randomUUID(), productId: first.product.id, expectedProductVersion: "1", expectedBalanceVersion: "1", reason: "TEST", quantity: "2", unitBuyingPricePaisa: "1250" });
 } finally { await gateway.close(); }
 const read = openDatabase(config(seed).database), data = tables.map(table => ({ table, rows: read.all("SELECT * FROM " + table) })); read.close();
 db = openDatabase(config(base).database); db.transaction(tx => { for (const g of data) for (const row of g.rows) { const keys = Object.keys(row); tx.run("INSERT INTO " + g.table + "(" + keys.join(",") + ") VALUES(" + keys.map(() => "?").join(",") + ")", keys.map(k => row[k])); } }); db.close();
});
afterEach(async () => { vi.restoreAllMocks(); for (const close of opens.splice(0).reverse()) await close(); });
describe("approved atomic schema18-to35 and exact admission", () => {
 it("pins all35 migrations and the exact seventeen approved literal programs", () => {
  const loaded = loadMigrations(source); expect(loaded).toHaveLength(35);
  const approved = readFileSync(path.resolve("tests/fixtures/inventory-audit-guard-review.sql"), "utf8").split(/^-- REVIEW PROGRAM /m).slice(1).map(s => s.slice(s.indexOf("\n") + 1).trim());
  expect(loaded.slice(18).map(m => m.sql.trim())).toEqual(approved); expect(loaded.filter(m => m.objectType === "trigger")).toHaveLength(16);
 });
 it("upgrades real populated TEST18 atomically, preserves all auth/data/history, and reopens", async () => {
  const directory = copy(), db = connection(directory), before = snapshot(db), old = db.all("SELECT * FROM schema_migrations ORDER BY version");
  expect(applyMigrations(db, source)).toEqual({ applied: 17, version: BigInt(35) }); expect(snapshot(db) === before).toBe(true);
  expect(db.all("SELECT * FROM schema_migrations WHERE version<=18 ORDER BY version")).toEqual(old);
  expect(applyMigrations(db, source).applied).toBe(0); db.close(); opens.pop();
  const read = native(directory); expect(await inspect(read, 35)).toEqual({ ok: true, version: 35, scope: "SCHEMA_AND_HISTORY_ONLY" });
  expect(read.prepare("SELECT count(*) AS n FROM main.sqlite_schema WHERE type='trigger'").get()?.n).toBe(BigInt(16));
  expect(read.prepare("PRAGMA integrity_check").get()?.integrity_check).toBe("ok"); expect(read.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
 });
 it("recognizes exact historical18 and8 independently; never calls18 current35", async () => {
  const read = native(copy()); expect((await inspect(read, 18)).ok).toBe(true); expect((await inspect(read, 35)).ok).toBe(false);
  const directory = mkdtempSync(path.join(run, "empty8-")), db = openDatabase({ ...config(directory).database, create: true }); applyMigrations(db, auth8); db.close();
  const eight = native(directory); expect((await inspect(eight, 8)).ok).toBe(true); expect((await inspect(eight, 18)).ok).toBe(false);
 });
 for (const table of ["inventory_operations", "stock_movements", "product_events"]) it(`rejects existing nonpositive ${table} history and rolls back the ENTIRE suffix`, () => {
  const directory = copy(), db = connection(directory); db.transaction(tx => tx.run(`UPDATE ${table} SET rowid=-1 WHERE rowid=(SELECT min(rowid) FROM ${table})`));
  const before = snapshot(db), old = history(db); expect(() => applyMigrations(db, source)).toThrow(); expect(snapshot(db) === before).toBe(true); expect(history(db)).toBe(old);
  expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(18));
  expect(db.get("SELECT name FROM sqlite_schema WHERE name='inventory_cancellations'")).toBeUndefined(); expect(db.get("SELECT name FROM sqlite_schema WHERE type='trigger'")).toBeUndefined();
 });
 it("rolls back native COMMIT failure without partial table/trigger/history/version", () => {
  const directory = copy(), db = connection(directory), before = snapshot(db), old = history(db), execute = Driver.prototype.exec; let once = true;
  vi.spyOn(Driver.prototype, "exec").mockImplementation(function(this: Native, sql: string) {
   if (once && this.inTransaction && /^commit$/i.test(sql.trim())) { once = false; this.pragma("defer_foreign_keys=ON"); this.prepare("INSERT INTO product_identifiers VALUES('TEST_MISSING','BARCODE','TEST_ORPHAN')").run(); } return execute.call(this, sql);
  });
  expect(() => applyMigrations(db, source)).toThrow(); expect(once).toBe(false); vi.restoreAllMocks(); expect(snapshot(db) === before).toBe(true); expect(history(db)).toBe(old);
  expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(18)); expect(db.get("SELECT name FROM sqlite_schema WHERE type='trigger'")).toBeUndefined();
 });
 it("rejects changed/unpinned trigger programs before executing any suffix", () => {
  const directory = copy(), db = connection(directory), altered = mkdtempSync(path.join(run, "altered-")); for (const f of readdirSync(source)) copyFileSync(path.join(source, f), path.join(altered, f));
  const name = "0026_product_events_insert_guard.sql"; const fs = createRequire(import.meta.url)("node:fs") as typeof import("node:fs"); fs.appendFileSync(path.join(altered, name), "-- changed reviewed program\n");
  const old = history(db); expect(() => applyMigrations(db, altered)).toThrow(); expect(history(db)).toBe(old);
 });
 for (const alteration of ["extra-object", "changed-table", "temp-shadow"]) it(`rejects ${alteration} in the source before applying35`, () => {
  const directory = copy();
  if (alteration === "changed-table") { const raw = native(directory); raw.exec("ALTER TABLE products ADD COLUMN unreviewed TEXT"); raw.close(); opens.pop(); }
  const db = connection(directory);
  if (alteration === "extra-object") db.transaction(tx => tx.run("CREATE TABLE unreviewed(v INTEGER) STRICT"));
  if (alteration === "temp-shadow") db.transaction(tx => tx.run("CREATE TEMP TABLE unreviewed(v INTEGER) STRICT"));
  const old = history(db), before = snapshot(db); expect(() => applyMigrations(db,source)).toThrow(); expect(history(db)).toBe(old); expect(snapshot(db) === before).toBe(true);
  expect(db.get("SELECT name FROM main.sqlite_schema WHERE name='inventory_cancellations'")).toBeUndefined();
 });
 it("rejects structural connection clones and direct schema8-to35 adoption", () => {
  const directory = copy(), db = connection(directory), old = history(db); expect(() => applyMigrations({...db},source)).toThrow(); expect(history(db)).toBe(old);
  const empty8 = mkdtempSync(path.join(run,"gate8-")), eight = openDatabase({...config(empty8).database,create:true}); opens.push(()=>eight.close()); applyMigrations(eight,auth8);
  expect(() => applyMigrations(eight,source)).toThrow(); expect(eight.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(8));
  expect(eight.get("SELECT name FROM main.sqlite_schema WHERE name='inventory_cancellations'")).toBeUndefined();
 });
 it("preserves the genuine operational context across explicit in-place TEST18-to35 upgrade", async () => {
  const directory=copy();
  const bind=async(migrationsDirectory:string,current:boolean)=>{
   const options=config(directory,migrationsDirectory), gateway=await openAuthorizationGateway(options,current?35:undefined);
   try {const issued=await gateway.issueAdminSession(await gateway.verifyAdminPassword(passwords.ADMIN));
    const req=new Request(options.origins.ADMIN+"/private",{headers:{origin:options.origins.ADMIN,cookie:issued.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")}});
    return await gateway.withAdminTransaction(req,(tx,actor)=>inventoryRecoveryContext(tx,actor));
   } finally {await gateway.close();}
  };
  const original=await bind(legacy,false), db=connection(directory), before=snapshot(db), oldRegistry=db.all("SELECT * FROM auth_session_authorizations");
  expect(oldRegistry).toHaveLength(1); applyMigrations(db,source); expect(snapshot(db) === before).toBe(true); expect(db.all("SELECT * FROM auth_session_authorizations")).toEqual(oldRegistry); db.close(); opens.pop();
  expect(await bind(source,true)).toBe(original);
 });
 it("rejects a partial approved suffix instead of installing a schema19-34 variant", () => {
  const directory=copy(), db=connection(directory), old=history(db), partial=mkdtempSync(path.join(run,"partial-"));
  for (const f of readdirSync(source).filter(n=>Number(n.slice(0,4))<=31)) copyFileSync(path.join(source,f),path.join(partial,f));
  expect(()=>applyMigrations(db,partial)).toThrow(); expect(history(db)).toBe(old); expect(db.get("SELECT name FROM main.sqlite_schema WHERE name='inventory_cancellations'")).toBeUndefined();
 });
 for (const alteration of ["missing", "changed", "extra"]) it(`denies ${alteration} actual trigger at exact35 inspection and gateway startup`, async () => {
  const directory = copy(), db = connection(directory); applyMigrations(db, source); db.close(); opens.pop(); const read = native(directory);
  if (alteration !== "extra") read.exec("DROP TRIGGER product_events_insert_guard");
  if (alteration === "changed") read.exec("CREATE TRIGGER product_events_insert_guard BEFORE INSERT ON product_events BEGIN SELECT 1; END;");
  if (alteration === "extra") read.exec("CREATE TRIGGER unreviewed BEFORE INSERT ON product_events BEGIN SELECT 1; END;");
  expect((await inspect(read, 35)).ok).toBe(false); read.close(); opens.pop();
  await expect(openAuthorizationGateway(config(directory), 35)).rejects.toThrow("Access denied.");
  // A failed startup releases its existing process owner, not a leaked second owner.
  const other = copy(), clean = connection(other); applyMigrations(clean, source); clean.close(); opens.pop(); const gateway = await openAuthorizationGateway(config(other), 35); await gateway.close();
 });
});
