import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { runTrustedFirstRunSetup } from "../../src/server/auth/provision";
import { openAuthorizationGateway } from "../../src/server/auth/gateway";
import { createInventoryService } from "../../src/server/inventory/service";
import type { AdminProduct } from "../../src/server/inventory/contracts";
import type { AuthorizationGateway } from "../../src/server/auth/types";

type Value = string | bigint | null;
type Row = Record<string, Value>;
interface Native {
 prepare(sql: string): { run(...values: Value[]): unknown; all(...values: Value[]): Row[]; get(...values: Value[]): Row | undefined };
 exec(sql: string): void;
 pragma(sql: string, options?: { simple: boolean }): unknown;
 defaultSafeIntegers(value: boolean): void;
 close(): void;
}
const Driver = createRequire(import.meta.url)("better-sqlite3") as { new(file: string): Native; prototype: Native };
const source = path.resolve("src/server/db/migrations");
const parent = path.resolve("test-results/sqlite-b1b-part1"); mkdirSync(parent, { recursive: true });
const run = mkdtempSync(path.join(parent, "audit-guard-review-"));
const base = path.join(run, "base"), auth8 = path.join(run, "auth8"), legacy18 = path.join(run,"legacy18");
const reviewed = readFileSync(path.resolve("tests/fixtures/inventory-audit-guard-review.sql"), "utf8");
const programs = reviewed.split(/^-- REVIEW PROGRAM /m).slice(1).map(text => {
 const at = text.indexOf("\n"); return { name: text.slice(0, at).trim(), sql: text.slice(at + 1).trim() };
});
const original = programs.filter(p => !p.name.includes("_positive_rowid")).map(p => ({ ...p,
 sql: p.sql.replace(/WHEN EXISTS\(SELECT 1 FROM [a-z_]+ WHERE rowid=NEW.rowid\) OR\n EXISTS\(/, "WHEN EXISTS(") }));
const tables = ["inventory_operations", "stock_movements", "product_events", "inventory_cancellations"] as const;
type Table = typeof tables[number];
const stable = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
const passwords = { ADMIN: randomBytes(18).toString("base64url"), SALESPERSON: randomBytes(18).toString("base64url") };
const sensitive = new Set(Object.values(passwords));
const handles: Native[] = [], gateways: AuthorizationGateway[] = [];
const stats = { attackStatements: 0, originalRowidReplacements: 0, legitimateMutations: 0, replays: 0, modes: [0, 1] };
let authority = "", history = "";
const insert = (db: Native, table: string, row: Row, prefix = "INSERT", suffix = "") => {
 const keys = Object.keys(row); return db.prepare(`${prefix} INTO ${table}(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})${suffix}`).run(...keys.map(k => row[k]));
};
const snapshot = (db: Native) => stable(tables.map(t => db.prepare("SELECT rowid AS physical_id,* FROM " + t + " ORDER BY rowid").all()));
function native(directory: string) {
 const db = new Driver(path.join(directory, "test.sqlite3")); handles.push(db);
 db.pragma("foreign_keys=ON"); db.pragma("journal_mode=WAL"); db.pragma("synchronous=FULL"); db.pragma("trusted_schema=OFF"); db.defaultSafeIntegers(true); return db;
}
function fresh(flag: number, revision = true) {
 const directory = mkdtempSync(path.join(run, "case-")); copyFileSync(path.join(base, "test.sqlite3"), path.join(directory, "test.sqlite3"));
 if (revision) { const ready = openDatabase({directory,filename:"test.sqlite3",mode:"test",create:false}); applyMigrations(ready,source); ready.close(); }
 const db = native(directory); db.pragma("recursive_triggers=" + flag);
 expect(String(db.pragma("recursive_triggers", { simple: true }))).toBe(String(flag));
 if (!revision) { db.exec("BEGIN IMMEDIATE"); for (const p of original) db.exec(p.sql); db.exec("COMMIT"); }
 return { db, directory };
}
function seed(db: Native) {
 const product = randomUUID(), op1 = randomUUID(), op2 = randomUUID(), leaf = randomUUID();
 insert(db, "products", { id: product, code: "TEST_" + randomBytes(6).toString("hex"), name: "TEST", name_key: "test", category: null, size_label: null,
  unit: "PACK", quantity_step_q: BigInt(1000000), current_cost_m: BigInt(1250), selling_price_m: BigInt(1800), low_stock_q: BigInt(0), selling_active: BigInt(1), archived_at_ms: null, version: BigInt(1), created_at_ms: BigInt(1), updated_at_ms: BigInt(1) });
 const operation = (): Row => ({ id: randomUUID(), request_key: randomUUID(), product_id: product, kind: "EDIT", actor_id: "ADMIN", actor_session_ref: "TEST-non-bearer-reference", payload_hash: "0".repeat(64), payload_json: "{}", result_json: "{}", reason: "TEST", reference: null, recorded_at_ms: BigInt(1) });
 const ops: Row[] = [op1, op2, leaf].map(id => ({ ...operation(), id })); for (const row of ops) insert(db, "inventory_operations", row);
 const movement = (): Row => ({ id: randomUUID(), operation_id: leaf, product_id: product, kind: "RECEIVE", before_q: BigInt(2000000), delta_q: BigInt(1000000), after_q: BigInt(3000000), cost_snapshot_m: BigInt(1250), balance_version: BigInt(3) });
 const opening: Row = { ...movement(), operation_id: op1, kind: "OPENING", before_q: BigInt(0), after_q: BigInt(1000000), balance_version: BigInt(1) };
 const receiving: Row = { ...movement(), operation_id: op2, before_q: BigInt(1000000), after_q: BigInt(2000000), balance_version: BigInt(2) };
 insert(db, "stock_movements", opening); insert(db, "stock_movements", receiving);
 const event = (): Row => ({ operation_id: leaf, product_id: product, before_json: null, after_json: "{}", recorded_at_ms: BigInt(2) });
 const savedEvent: Row = { ...event(), operation_id: op1 }; insert(db, "product_events", savedEvent);
 const cancellation = (): Row => ({ request_key: randomUUID(), context_fingerprint: "1".repeat(64), kind: "CREATE", actor_id: "ADMIN", actor_session_ref: "TEST-non-bearer-reference", recorded_at_ms: BigInt(1) });
 const cancelled = cancellation(); insert(db, "inventory_cancellations", cancelled);
 const existing: Record<Table, Row> = { inventory_operations: ops[2], stock_movements: receiving, product_events: savedEvent, inventory_cancellations: cancelled };
 const candidate: Record<Table, () => Row> = { inventory_operations: operation, stock_movements: movement, product_events: event, inventory_cancellations: cancellation };
 return { product, ops, opening, receiving, savedEvent, cancelled, existing, candidate };
}
function unchanged(db: Native, before: string) {
 expect(snapshot(db) === before).toBe(true);
 expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
 expect(db.prepare("PRAGMA integrity_check").get()?.integrity_check).toBe("ok");
}
beforeAll(async () => {
 mkdirSync(base); mkdirSync(auth8); mkdirSync(legacy18);
 for (const file of readdirSync(source).filter(n=>/^(?:000[1-9]|001[0-8])_/.test(n))) copyFileSync(path.join(source,file),path.join(legacy18,file));
 for (const file of readdirSync(source).filter(n => /^000[1-8]_/.test(n))) copyFileSync(path.join(source, file), path.join(auth8, file));
 const database = { directory: base, filename: "test.sqlite3", mode: "test" as const, create: true };
 let db = openDatabase(database); applyMigrations(db, auth8); db.close();
 await runTrustedFirstRunSetup({ database: { ...database, create: false }, migrationsDirectory: auth8 }, async () => passwords);
 db = openDatabase({ ...database, create: false }); applyMigrations(db, legacy18);
 authority = stable(["auth_users", "auth_credentials", "auth_principals", "auth_provisioning"].map(t => db.all("SELECT * FROM " + t + " ORDER BY id")));
 history = stable(db.all("SELECT * FROM schema_migrations ORDER BY version")); db.close();
 writeFileSync(path.join(run, "review-scope.json"), JSON.stringify({ betterSqlite3Version: createRequire(import.meta.url)("better-sqlite3/package.json").version,
  sourceMigrations: 18, candidatePrograms: programs.map(p => p.name), productionActivation: false }, null, 2));
});
afterEach(async () => {
 vi.restoreAllMocks(); for (const g of gateways.splice(0)) await g.close(); for (const db of handles.splice(0)) db.close();
 writeFileSync(path.join(run, "counts.json"), JSON.stringify(stats, null, 2));
});

describe("Owner-requested native audit guard review; candidate SQL only", () => {
 it("inspects actual PK, UNIQUE, partial indexes, rowid aliases and STRICT metadata", () => {
  const { db } = fresh(0), metadata = tables.map(table => ({ table,
   definition: db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(table)?.sql,
   columns: db.prepare("SELECT name,type,pk,hidden FROM pragma_table_xinfo(?)").all(table),
   properties: db.prepare("SELECT wr,strict FROM pragma_table_list WHERE schema='main' AND name=?").get(table),
   indexes: db.prepare("SELECT name,\"unique\",origin,partial FROM pragma_index_list(?) ORDER BY name").all(table).map(i => ({ name: i.name, unique: i.unique, origin: i.origin, partial: i.partial,
    definition: db.prepare("SELECT sql FROM sqlite_schema WHERE type='index' AND name=?").get(i.name)?.sql ?? null,
    keys: db.prepare("SELECT name,desc,coll,key FROM pragma_index_xinfo(?) ORDER BY seqno").all(i.name) })) }));
  const expected: Record<Table, string[]> = { inventory_operations: ["id", "id,product_id", "request_key"], stock_movements: ["id", "operation_id", "product_id", "product_id,balance_version"], product_events: ["operation_id"], inventory_cancellations: ["request_key"] };
  for (const entry of metadata) {
   expect(entry.properties).toEqual({ wr: BigInt(0), strict: BigInt(1) });
   expect(entry.columns.some(c => ["rowid", "_rowid_", "oid"].includes(String(c.name)))).toBe(false);
   expect(entry.indexes.filter(i => i.unique === BigInt(1)).map(i => i.keys.filter(k => k.key === BigInt(1)).map(k => k.name).join(",")).sort()).toEqual(expected[entry.table].sort());
  }
  const partial = metadata.find(e => e.table === "stock_movements")!.indexes.filter(i => i.partial === BigInt(1));
  expect(partial).toHaveLength(1); expect(String(partial[0].definition)).toContain("WHERE kind='OPENING'");
  writeFileSync(path.join(run, "actual-schema-metadata.json"), stable(metadata));
  writeFileSync(path.join(run, "sqlite-engine.json"), stable(db.prepare("SELECT sqlite_version() AS version,sqlite_source_id() AS source_id").get()));
 });
 for (const table of tables) for (const alias of ["rowid", "_rowid_", "oid"]) {
  it(`reproduces original ${table} ${alias} replacement with recursive triggers OFF; ON blocks it`, () => {
   for (const flag of [0, 1]) {
    const { db } = fresh(flag, false), f = seed(db), before = snapshot(db), row = f.existing[table];
    const idColumn = table === "inventory_cancellations" ? "request_key" : table === "product_events" ? "operation_id" : "id";
    const physical = db.prepare(`SELECT rowid AS r FROM ${table} WHERE ${idColumn}=?`).get(row[idColumn])!.r;
    const attack = { [alias]: physical, ...f.candidate[table]() };
    if (flag) { expect(() => insert(db, table, attack, "INSERT OR REPLACE")).toThrow("Inventory history is immutable."); unchanged(db, before); }
    else { insert(db, table, attack, "INSERT OR REPLACE"); expect(snapshot(db) === before).toBe(false);
     expect(db.prepare(`SELECT * FROM ${table} WHERE ${idColumn}=?`).get(row[idColumn])).toBeUndefined(); stats.originalRowidReplacements++; }
   }
  });
 }
 const conflicts: { name: string; table: Table; row(f: ReturnType<typeof seed>): Row }[] = [
  { name: "operation PK", table: "inventory_operations", row: f => ({ ...f.candidate.inventory_operations(), id: f.ops[0].id }) },
  { name: "operation request-key UNIQUE", table: "inventory_operations", row: f => ({ ...f.candidate.inventory_operations(), request_key: f.ops[0].request_key }) },
  { name: "operation composite UNIQUE", table: "inventory_operations", row: f => ({ ...f.candidate.inventory_operations(), id: f.ops[0].id, product_id: f.product }) },
  { name: "movement PK", table: "stock_movements", row: f => ({ ...f.candidate.stock_movements(), id: f.receiving.id }) },
  { name: "movement operation UNIQUE", table: "stock_movements", row: f => ({ ...f.candidate.stock_movements(), operation_id: f.receiving.operation_id }) },
  { name: "movement product/version UNIQUE", table: "stock_movements", row: f => ({ ...f.candidate.stock_movements(), balance_version: BigInt(2) }) },
  { name: "movement partial OPENING UNIQUE", table: "stock_movements", row: f => ({ ...f.candidate.stock_movements(), kind: "OPENING", before_q: BigInt(0), after_q: BigInt(1000000), balance_version: BigInt(1) }) },
  { name: "event PK", table: "product_events", row: f => ({ ...f.candidate.product_events(), operation_id: f.savedEvent.operation_id }) },
  { name: "cancellation PK", table: "inventory_cancellations", row: f => ({ ...f.candidate.inventory_cancellations(), request_key: f.cancelled.request_key }) },
  { name: "execute cancelled key", table: "inventory_operations", row: f => ({ ...f.candidate.inventory_operations(), request_key: f.cancelled.request_key }) },
  { name: "cancel committed key", table: "inventory_cancellations", row: f => ({ ...f.candidate.inventory_cancellations(), request_key: f.ops[0].request_key }) },
 ];
 for (const flag of [0, 1]) {
  for (const c of conflicts) it(`rejects ${c.name}, conflict algorithms and UPSERT; recursive=${flag}`, () => {
   const { db } = fresh(flag), f = seed(db), before = snapshot(db);
   const changed = c.table === "stock_movements" ? "cost_snapshot_m" : "recorded_at_ms";
   for (const form of ["REPLACE", "INSERT OR REPLACE", "INSERT OR IGNORE", "UPSERT"]) {
    expect(() => insert(db, c.table, c.row(f), form === "UPSERT" ? "INSERT" : form,
     form === "UPSERT" ? ` ON CONFLICT DO UPDATE SET ${changed}=excluded.${changed}` : "")).toThrow("Inventory history conflict.");
    unchanged(db, before); stats.attackStatements++;
   }
  });
  for (const table of tables) {
   for (const alias of ["rowid", "_rowid_", "oid"]) it(`fences ${table} hidden ${alias}, REPLACE and UPSERT; recursive=${flag}`, () => {
    const { db } = fresh(flag), f = seed(db), before = snapshot(db), id = table === "inventory_cancellations" ? "request_key" : table === "product_events" ? "operation_id" : "id";
    const physical = db.prepare(`SELECT rowid AS r FROM ${table} WHERE ${id}=?`).get(f.existing[table][id])!.r;
    const changed = table === "stock_movements" ? "cost_snapshot_m" : "recorded_at_ms";
    for (const form of ["REPLACE", "INSERT OR REPLACE", "UPSERT"]) {
     const row = { [alias]: physical, ...f.candidate[table]() };
     expect(() => insert(db, table, row, form === "UPSERT" ? "INSERT" : form,
      form === "UPSERT" ? ` ON CONFLICT DO UPDATE SET ${changed}=excluded.${changed}` : "")).toThrow("Inventory history conflict.");
     unchanged(db, before); stats.attackStatements++;
    }
   });
   it(`rejects UPDATE/DELETE, rolls back multi-row REPLACE and disallows nonpositive physical IDs on ${table}; recursive=${flag}`, () => {
    const { db } = fresh(flag), f = seed(db), before = snapshot(db);
    const changed = table === "stock_movements" ? "cost_snapshot_m" : "recorded_at_ms";
    for (const sql of [`UPDATE ${table} SET ${changed}=${changed}+1`, `UPDATE OR REPLACE ${table} SET ${changed}=${changed}+1`, `DELETE FROM ${table}`]) {
     expect(() => db.exec(sql)).toThrow("Inventory history is immutable."); unchanged(db, before); stats.attackStatements++;
    }
    for (const r of [BigInt(0), BigInt(-1), BigInt(-2)]) {
     expect(() => insert(db, table, { rowid: r, ...f.candidate[table]() }, "INSERT OR REPLACE")).toThrow("Inventory physical row identity is invalid.");
     unchanged(db, before); stats.attackStatements++;
    }
    const row = f.candidate[table](), duplicate = f.existing[table], columns = Object.keys(row);
    // First row is a valid append. A conflict in the second row must undo BOTH changes in this statement.
    const sql = `INSERT OR REPLACE INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")}),(${columns.map(() => "?").join(",")})`;
    expect(() => db.prepare(sql).run(...columns.map(k => row[k]), ...columns.map(k => duplicate[k]))).toThrow("Inventory history conflict.");
    unchanged(db, before); stats.attackStatements++;
    // Explicit positive rowids remain valid; no arbitrary ban on supplied physical IDs.
    insert(db, table, { rowid: BigInt(777), ...f.candidate[table]() });
    expect(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE rowid=777`).get()?.n).toBe(BigInt(1));
   });
  }
  it(`rolls back all candidate DDL on failure without changing schema18 history; recursive=${flag}`, () => {
   const directory = mkdtempSync(path.join(run, "rollback-")); copyFileSync(path.join(base, "test.sqlite3"), path.join(directory, "test.sqlite3")); const db = native(directory);
   db.pragma("recursive_triggers=" + flag);
   const schema = stable(db.prepare("SELECT type,name,sql FROM sqlite_schema ORDER BY type,name").all());
   db.exec("BEGIN IMMEDIATE"); try { for (const p of programs) db.exec(p.sql); db.exec("CREATE TABLE impossible("); } catch { db.exec("ROLLBACK"); }
   expect(stable(db.prepare("SELECT type,name,sql FROM sqlite_schema ORDER BY type,name").all())).toBe(schema);
   expect(stable(db.prepare("SELECT * FROM schema_migrations ORDER BY version").all())).toBe(history);
   expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(BigInt(18));
  });
  it(`allows every existing private inventory mutation and replay with the real gateway; recursive=${flag}`, async () => {
   const { db, directory } = fresh(flag);
   const admittedHistory = stable(db.prepare("SELECT * FROM schema_migrations ORDER BY version").all());
   // Close candidate-review writer before opening the application's sole native owner.
   db.close(); handles.splice(handles.indexOf(db), 1);
   const originalPragma = Driver.prototype.pragma;
   vi.spyOn(Driver.prototype, "pragma").mockImplementation(function (this: Native, sql: string, options?: { simple: boolean }) {
    const result = originalPragma.call(this, sql, options);
    if (sql === "trusted_schema=OFF") originalPragma.call(this, "recursive_triggers=" + flag);
    return result;
   });
   const secrets = { ADMIN: randomBytes(48).toString("base64url"), SALESPERSON: randomBytes(48).toString("base64url") }; Object.values(secrets).forEach(x => sensitive.add(x));
   const gateway = await openAuthorizationGateway({ database: { directory, filename: "test.sqlite3", mode: "test", create: false }, migrationsDirectory: source,
    origins: { ADMIN: "https://localhost:9773", SALESPERSON: "https://127.0.0.1:9773" }, signingSecrets: secrets, sessionLifetimeSeconds: 3600 }); gateways.push(gateway);
   const receipt = await gateway.verifyAdminPassword(passwords.ADMIN), response = await gateway.issueAdminSession(receipt);
   const cookie = response.headers.getSetCookie().map(c => c.split(";")[0]).join("; "); sensitive.add(cookie);
   for (const c of response.headers.getSetCookie()) { const value = c.split(";")[0].split("=").slice(1).join("="); sensitive.add(value); sensitive.add(decodeURIComponent(value)); sensitive.add(decodeURIComponent(value).split(".")[0]); }
   const req = new Request("https://localhost:9773/private-review", { headers: { origin: "https://localhost:9773", cookie } });
   const api = createInventoryService(gateway);
   const command = { requestKey: randomUUID(), name: "TEST guard compatibility", unit: "PACK", buyingPricePaisa: "1250", sellingPricePaisa: "2200", sellingActive: true, openingQuantity: "5", lowStockThreshold: "2" };
   const created = await api.createProduct(req, command); stats.legitimateMutations++;
   expect(await api.createProduct(req, command)).toEqual(created); stats.replays++;
   let product = created.product;
   const change = async (method: "updateProduct" | "setSellingPrice" | "setSellingStatus" | "archiveProduct" | "changeBuyingCost" | "receiveStock" | "correctStock", values: Record<string, unknown>) => {
    const input = { requestKey: randomUUID(), productId: product.id, expectedProductVersion: product.productVersion, expectedBalanceVersion: product.balanceVersion, reason: "TEST reviewed operation", ...values };
    // Existing metadata commands do not accept balance version.
    if (["updateProduct", "setSellingPrice", "setSellingStatus", "archiveProduct"].includes(method)) delete (input as Record<string, unknown>).expectedBalanceVersion;
    const result = await api[method](req, input); stats.legitimateMutations++;
    expect(await api[method](req, input)).toEqual(result); stats.replays++; product = result.product;
   };
   await change("updateProduct", { name: "TEST edited" });
   await change("setSellingPrice", { sellingPricePaisa: "2300" });
   await change("setSellingStatus", { sellingActive: false });
   await change("changeBuyingCost", { buyingPricePaisa: "1300", confirmAllRemaining: true });
   await change("receiveStock", { quantity: "2", unitBuyingPricePaisa: "1300" });
   await change("correctStock", { targetQuantity: "6" });
   await change("archiveProduct", {});
   expect(product as AdminProduct).toMatchObject({ quantity: "6", stockValuePaisa: "7800", sellingActive: false });
   const events = await api.listProductEvents(req, { productId: product.id }); expect(events.items).toHaveLength(8);
   const movements = await api.listMovements(req, { productId: product.id }); expect(movements.items).toHaveLength(3);
   await gateway.withAdminTransaction(req, async tx => {
    expect(String((await tx.get("SELECT recursive_triggers AS flag FROM pragma_recursive_triggers"))?.flag)).toBe(String(flag));
    for (const table of tables) expect((await tx.get(`SELECT count(*) AS n FROM ${table} WHERE rowid<=0`))?.n).toBe(BigInt(0));
   });
   await gateway.close(); gateways.splice(gateways.indexOf(gateway), 1); vi.restoreAllMocks();
   const read = native(directory);
   expect(stable(["auth_users", "auth_credentials", "auth_principals", "auth_provisioning"].map(t => read.prepare("SELECT * FROM " + t + " ORDER BY id").all())) === authority).toBe(true);
   expect(stable(read.prepare("SELECT * FROM schema_migrations ORDER BY version").all())).toBe(admittedHistory);
   expect(read.prepare("PRAGMA user_version").get()?.user_version).toBe(BigInt(35));
   expect(read.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
   for (const file of ["test.sqlite3", "test.sqlite3-wal"]) {
    try { const bytes = readFileSync(path.join(directory, file)); expect([...sensitive].filter(s => s.length >= 8).some(s => bytes.includes(Buffer.from(s)))).toBe(false); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
   }
  });
 }
 for (const flag of [0, 1]) it(`demonstrates why rowid-only guards need AFTER INSERT validation; recursive=${flag}`, () => {
  for (const table of tables) {
   const { db } = fresh(flag); const f = seed(db);
   db.exec(`DROP TRIGGER ${table}_positive_rowid`); // Review-only incomplete candidate, never application migration.
   insert(db, table, { rowid: BigInt(-1), ...f.candidate[table]() });
   const row = f.candidate[table]();
   if (table === "stock_movements" || table === "product_events") {
    const nextOperation = f.candidate.inventory_operations(); insert(db, "inventory_operations", nextOperation); row.operation_id = nextOperation.id;
    if (table === "stock_movements") { row.balance_version = BigInt(4); row.before_q = BigInt(3000000); row.after_q = BigInt(4000000); }
   }
   // Pinned engine observation: automatic BEFORE NEW.rowid is -1; a real -1 history row would obstruct ordinary appends.
   expect(() => insert(db, table, row)).toThrow("Inventory history conflict.");
   expect(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE rowid=-1`).get()?.n).toBe(BigInt(1));
  }
 });
 for (const flag of [0, 1]) it(`blocks UPDATE OR REPLACE collisions on both physical and declared keys; recursive=${flag}`, () => {
  for (const table of tables) {
   const { db } = fresh(flag), f = seed(db); insert(db, table, { rowid: BigInt(777), ...f.candidate[table]() });
   const before = snapshot(db), key = table === "inventory_cancellations" ? "request_key" : table === "product_events" ? "operation_id" : "id";
   for (const sql of [`UPDATE OR REPLACE ${table} SET rowid=1 WHERE rowid=777`, `UPDATE OR REPLACE ${table} SET ${key}=(SELECT ${key} FROM ${table} WHERE rowid=1) WHERE rowid=777`]) {
    expect(() => db.exec(sql)).toThrow("Inventory history is immutable."); unchanged(db, before);
   }
  }
 });
 it("uses exactly the same candidate SQL in the owner contract and native review fixture", () => {
  const contract = readFileSync(path.resolve("../docs/development/INVENTORY_RECOVERY_AND_AUDIT_SCHEMA_CONTRACT.md"), "utf8");
  const literal = [...contract.matchAll(/### (\d{4}_[a-z_]+\.sql)\r?\n\r?\n```sql\r?\n([\s\S]*?)```/g)].map(m => ({ name: m[1], sql: m[2].trim().replaceAll("\r\n", "\n") }));
  expect(literal).toEqual(programs);
 });
 it("keeps review fixture outside the application migration directory and contains exactly seventeen reviewed programs", () => {
  expect(programs).toHaveLength(17); expect(original).toHaveLength(13);
  expect(readdirSync(source).filter(f => f.endsWith(".sql"))).toHaveLength(35);
  expect(readdirSync(legacy18).filter(f=>f.endsWith(".sql"))).toHaveLength(18);
  expect(programs.map(p => p.name.slice(0, 4))).toEqual(Array.from({ length: 17 }, (_, i) => String(i + 19).padStart(4, "0")));
 });
});
