import { createHash, randomBytes, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sql } from "kysely";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { validateReviewedSchema, type ReviewedSchemaVersion } from "../../src/server/db/validate-schema";
import { schemaTokens } from "../../src/server/db/schema-sql";
import { openAsyncOwner } from "../../src/server/auth/database";
import { openAuthorizationGateway } from "../../src/server/auth/gateway";
import { runTrustedFirstRunSetup } from "../../src/server/auth/provision";
import type { AuthorizationConfiguration, AuthorizationGateway, AuthorizedTransaction, Role } from "../../src/server/auth/types";
import { createInventoryService } from "../../src/server/inventory/service";
const probe = vi.hoisted(() => ({ badManifest: false }));
vi.mock("../../src/server/db/migrate", async original => {
 const actual = await original<typeof import("../../src/server/db/migrate")>();
 return { ...actual, loadMigrations: (...args: Parameters<typeof actual.loadMigrations>) => {
  const result = actual.loadMigrations(...args);
  return probe.badManifest ? result.map((m, i) => i ? m : { ...m, checksum: "0".repeat(64) }) : result;
 } };
});
const source = path.resolve("src/server/db/migrations"), root = path.resolve("test-results/sqlite-b1b-part1");
mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "schema-b2-")), auth8 = path.join(run, "auth8");
const bases = new Map<number, string>(), owners: ReturnType<typeof openAsyncOwner>[] = [], gateways: AuthorizationGateway[] = [];
const stable = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const configuration = (directory: string, version: number) => ({ database: { directory, filename: "test.sqlite3", mode: "test" as const, create: false, busyTimeoutMs: 75 }, migrationsDirectory: version === 8 ? auth8 : source });
function fixture(version: ReviewedSchemaVersion = 18) {
 const directory = mkdtempSync(path.join(run, "case-"));
 copyFileSync(bases.get(version)!, path.join(directory, "test.sqlite3"));
 const config = configuration(directory, version), owner = openAsyncOwner(config); owners.push(owner);
 const execute = (statement: string) => sql.raw(statement).execute(owner.db);
 const inspect = (requested: ReviewedSchemaVersion = version, wrap?: (scope: AuthorizedTransaction) => Pick<AuthorizedTransaction, "get" | "all">) => owner.db.transaction().execute(async () => {
  let live = true;
  const scope = owner.scope(() => { if (!live || !owner.inTransaction()) throw new Error("Expired TEST scope."); });
  try { return await validateReviewedSchema(wrap ? wrap(scope) : scope, requested); }
  finally { live = false; }
 });
 return { directory, config, owner, execute, inspect };
}
beforeAll(() => {
 mkdirSync(auth8);
 for (const name of readdirSync(source).filter(n => /^000[1-8]_/.test(n))) copyFileSync(path.join(source, name), path.join(auth8, name));
 for (const version of [8, 18]) {
  const directory = path.join(run, "base" + version); mkdirSync(directory);
  const db = openDatabase({ ...configuration(directory, version).database, create: true });
  try { expect(applyMigrations(db, version === 8 ? auth8 : source).version).toBe(BigInt(version)); }
  finally { db.close(); }
  bases.set(version, path.join(directory, "test.sqlite3"));
 }
});
afterEach(async () => {
 probe.badManifest = false; vi.restoreAllMocks();
 for (const gateway of gateways.splice(0)) await gateway.close();
 for (const owner of owners.splice(0)) await owner.close();
});
describe("B2 Part3 real SQLite read-only exact schema inspection", () => {
 it.each([8, 18] as const)("accepts exact reviewed schema %i and its real SQLite canonical SQL/internal indexes", async version => {
  const f = fixture(version);
  expect(await f.inspect()).toEqual({ ok: true, version, scope: "SCHEMA_AND_HISTORY_ONLY" });
  expect(f.owner.all("SELECT name FROM main.sqlite_schema WHERE type='index' AND sql IS NULL")).toHaveLength(version === 8 ? 14 : 28);
 });
 it("accepts actual SQLite normalization of CREATE prefixes/layout/comments without folding literals", async () => {
  const f = fixture(); await f.execute("DROP INDEX products_search");
  await f.execute("  create  index products_search ON products ( name_key /* TEST layout */ , id ) ; -- TEST trailing");
  const stored = f.owner.get("SELECT sql FROM main.sqlite_schema WHERE name='products_search'")?.sql;
  expect(typeof stored).toBe("string"); expect((stored as string).startsWith("CREATE INDEX")).toBe(true);
  expect(await f.inspect()).toMatchObject({ ok: true });
 });
 it("accepts genuine SQLite ANALYZE internal tables but never arbitrary sqlite-prefixed objects", async () => {
  const f = fixture(); await f.execute("ANALYZE");
  expect(f.owner.all("SELECT name FROM main.sqlite_schema WHERE name='sqlite_stat1'")).toHaveLength(1);
  expect(await f.inspect()).toMatchObject({ ok: true });
 });
 it("rejects a missing table even though its migration history remains valid", async () => {
  const f = fixture(); await f.execute("DROP TABLE product_events");
  expect(await f.inspect()).toEqual({ ok: false, code: "MISSING_OBJECT" });
 });
 it("rejects an unexpected table without returning its attacker-controlled name or SQL", async () => {
  const f = fixture(), secretName = "test_" + randomBytes(20).toString("hex");
  await f.execute('CREATE TABLE "' + secretName + '"(v TEXT) STRICT');
  const result = await f.inspect(); expect(result).toEqual({ ok: false, code: "UNEXPECTED_OBJECT" }); expect(stable(result).includes(secretName)).toBe(false);
 });
 it("rejects a missing explicit index", async () => {
  const f = fixture(); await f.execute("DROP INDEX products_search"); expect(await f.inspect()).toEqual({ ok: false, code: "MISSING_OBJECT" });
 });
 it.each(["CREATE INDEX test_extra ON products(code)", "CREATE INDEX products_search ON products(id,name_key)"])("rejects unexpected/altered index: %s", async statement => {
  const f = fixture(); if (statement.includes("products_search")) await f.execute("DROP INDEX products_search");
  await f.execute(statement); expect((await f.inspect()).ok).toBe(false);
 });
 it("rejects removal of a partial unique predicate", async () => {
  const f = fixture(); await f.execute("DROP INDEX stock_opening_unique");
  await f.execute("CREATE UNIQUE INDEX stock_opening_unique ON stock_movements(product_id)");
  expect(await f.inspect()).toEqual({ ok: false, code: "OBJECT_CHANGED" });
 });
 it.each(["CREATE VIEW test_view AS SELECT id FROM products", "CREATE TRIGGER test_trigger AFTER INSERT ON products BEGIN SELECT 1; END"])("rejects unreviewed schema object: %s", async statement => {
  const f = fixture(); await f.execute(statement); expect(await f.inspect()).toEqual({ ok: false, code: "UNEXPECTED_OBJECT" });
 });
 it("rejects an altered table definition with unchanged history", async () => {
  const f = fixture(); await f.execute("ALTER TABLE products ADD COLUMN test_unreviewed INTEGER");
  expect(await f.inspect()).toEqual({ ok: false, code: "OBJECT_CHANGED" });
 });
 it("rejects a non-STRICT replacement table with valid history", async () => {
  const f = fixture(); await f.execute("DROP TABLE product_identifiers");
  const migration = readFileSync(path.join(source, "0012_product_identifiers.sql"), "utf8");
  await f.execute(migration.replace(") STRICT;", ");"));
  expect(await f.inspect()).toEqual({ ok: false, code: "OBJECT_CHANGED" });
 });
 it.each(["UPDATE schema_migrations SET checksum='" + "0".repeat(64) + "' WHERE version=9", "DELETE FROM schema_migrations WHERE version=9", "UPDATE schema_migrations SET name='0009_test_changed.sql' WHERE version=9"])("rejects damaged ordered migration history: %s", async statement => {
  const f = fixture(); await f.execute(statement); expect(await f.inspect()).toEqual({ ok: false, code: "HISTORY_MISMATCH" });
 });
 it("rejects missing history table before querying arbitrary replacement content", async () => {
  const f = fixture(); await f.execute("DROP TABLE schema_migrations"); expect(await f.inspect()).toEqual({ ok: false, code: "MISSING_OBJECT" });
 });
 it.each([19, -1, 2147483647, 8])("rejects unknown/inconsistent stored version %i", async version => {
  const f = fixture(); await f.execute("PRAGMA user_version=" + version); expect(await f.inspect()).toEqual({ ok: false, code: "VERSION_MISMATCH" });
 });
 it("does not confuse valid schema18 with enrollment baseline8", async () => {
  const f = fixture(); expect(await f.inspect(8)).toEqual({ ok: false, code: "VERSION_MISMATCH" });
  const baseline = fixture(8); expect(await baseline.inspect(18)).toEqual({ ok: false, code: "VERSION_MISMATCH" });
 });
 it("rejects a partially applied schema even when marker/history say18", async () => {
  const f = fixture(); await f.execute("DROP INDEX inventory_operations_product");
  expect(f.owner.get("SELECT count(*) AS n FROM schema_migrations")?.n).toBe(BigInt(18));
  expect(await f.inspect()).toEqual({ ok: false, code: "MISSING_OBJECT" });
 });
 it("rejects unreviewed manifest checksums before issuing any database query", async () => {
  const f = fixture(); probe.badManifest = true; let reads = 0;
  expect(await f.inspect(18, scope => ({ async get(...args) { reads++; return scope.get(...args); }, async all(...args) { reads++; return scope.all(...args); } }))).toEqual({ ok: false, code: "MANIFEST_UNAVAILABLE" });
  expect(reads).toBe(0);
 });
 it("rejects unsupported requested versions instead of inferring approval from a database", async () => {
  const f = fixture(); expect(await f.inspect(19 as ReviewedSchemaVersion)).toEqual({ ok: false, code: "UNSUPPORTED_VERSION" });
 });
 it("fails closed for actual SQL errors and discards native error details", async () => {
  const f = fixture(); let once = true;
  const result = await f.inspect(18, scope => ({ ...scope, async get(...args) {
   if (once) { once = false; return scope.get("SELECT * FROM test_missing_private_table"); } return scope.get(...args);
  } }));
  expect(result).toEqual({ ok: false, code: "READ_FAILED" }); expect(stable(result)).not.toContain("test_missing_private_table");
 });
 it("requires a live owned scope and cannot reuse an expired transaction", async () => {
  const f = fixture(); let expired: AuthorizedTransaction | undefined;
  await f.inspect(18, scope => { expired = scope; return scope; });
  expect(await validateReviewedSchema(expired!, 18)).toEqual({ ok: false, code: "READ_FAILED" });
 });
 it("rejects TEMP shadowing and attached database ambiguity", async () => {
  const f = fixture(); await f.execute("CREATE TEMP TABLE test_shadow(v)");
  expect(await f.inspect()).toEqual({ ok: false, code: "UNEXPECTED_OBJECT" });
  await f.execute("DROP TABLE temp.test_shadow"); await f.execute("ATTACH DATABASE ':memory:' AS test_other");
  expect(await f.inspect()).toEqual({ ok: false, code: "AMBIGUOUS_SNAPSHOT" });
 });
 it("bounds object and SQL materialization", async () => {
  const f = fixture();
  for (let i = 0; i < 130; i++) await f.execute("CREATE TABLE test_extra_" + i + "(v)");
  expect(await f.inspect()).toEqual({ ok: false, code: "LIMIT_EXCEEDED" });
  const g = fixture(); await g.execute("CREATE TABLE test_large(/*" + "x".repeat(65537) + "*/v)");
  expect(await g.inspect()).toEqual({ ok: false, code: "LIMIT_EXCEEDED" });
 });
 it("performs only bounded SELECTs with zero changes to main/WAL files, history or owner configuration", async () => {
  const f = fixture(), file = path.join(f.directory, "test.sqlite3"), files = () => ["", "-wal"].filter(s => existsSync(file + s)).map(s => [s, digest(file + s)]);
  const beforeFiles = files(), history = stable(f.owner.all("SELECT * FROM schema_migrations ORDER BY version"));
  const before = f.owner.get("SELECT total_changes() AS n"), statements: string[] = [];
  const result = await f.inspect(18, scope => ({ async get(...args) { statements.push(args[0]); return scope.get(...args); }, async all(...args) { statements.push(args[0]); return scope.all(...args); } }));
  expect(result.ok).toBe(true); expect(statements.length).toBeGreaterThan(50);
  expect(statements.every(s => /^SELECT /.test(s))).toBe(true);
  expect(f.owner.get("SELECT total_changes() AS n")).toEqual(before); expect(files()).toEqual(beforeFiles);
  expect(stable(f.owner.all("SELECT * FROM schema_migrations ORDER BY version")) === history).toBe(true);
  expect(f.owner.get("SELECT foreign_keys FROM pragma_foreign_keys")?.foreign_keys).toBe(BigInt(1));
  expect(f.owner.get("SELECT synchronous FROM pragma_synchronous")?.synchronous).toBe(BigInt(2));
 });
 it("rejects corrupt SQLite files at existing-owner admission without repairing them", () => {
  const directory = mkdtempSync(path.join(run, "corrupt-")), file = path.join(directory, "test.sqlite3");
  const bytes = Buffer.from(readFileSync(bases.get(18)!)); bytes.fill(0, 0, 100); writeFileSync(file, bytes);
  const before = digest(file); expect(() => openAsyncOwner(configuration(directory, 18))).toThrow(); expect(digest(file)).toBe(before);
 });
 it("compares SQL tokens without collapsing literal spaces/comment text, and rejects ambiguity", () => {
  expect(schemaTokens("CREATE TABLE t(v TEXT CHECK(v='a  -- /* b'));" )).not.toBe(schemaTokens("CREATE TABLE t(v TEXT CHECK(v='a -- /* b'));"));
  expect(schemaTokens("create table t ( v text ) /* TEST */;")).toBe(schemaTokens("CREATE TABLE t(v TEXT)"));
  for (const s of ["CREATE TABLE t(v); DROP TABLE t", "CREATE TABLE t(v) /*", "CREATE TABLE t(v TEXT DEFAULT 'x)", "CREATE TABLE t(v)\0", "x".repeat(65537)]) expect(() => schemaTokens(s)).toThrow();
 });
});

describe("B2 Part3 metadata failures and real authorization preservation", () => {
 it("retains native catalog-write protection and validates real internal-index metadata", async () => {
  const f = fixture();
  await expect(f.execute("UPDATE sqlite_schema SET sql=NULL WHERE name='sqlite_autoindex_products_1'")).rejects.toBeDefined();
  const keys = f.owner.all('SELECT name,origin,"unique" FROM pragma_index_list(?,?)', ["products", "main"]);
  expect(keys.filter(r => r.origin === "pk" || r.origin === "u")).toHaveLength(3);
  expect(await f.inspect()).toMatchObject({ ok: true });
 });
 it("rejects rebuilt UNIQUE constraints and byte-distinct CHECK literals with unchanged history", async () => {
  const migration = readFileSync(path.join(source, "0012_product_identifiers.sql"), "utf8");
  const f = fixture(); await f.execute("DROP TABLE product_identifiers");
  await f.execute(migration.replace("value TEXT NOT NULL UNIQUE", "value TEXT NOT NULL"));
  expect(await f.inspect()).toEqual({ ok: false, code: "OBJECT_CHANGED" });
  const g = fixture(); await g.execute("DROP TABLE product_identifiers");
  await g.execute(migration.replace("kind='BARCODE'", "kind='BARCODE '"));
  expect(await g.inspect()).toEqual({ ok: false, code: "OBJECT_CHANGED" });
 });
 it("denies a mid-inspection scope cancellation and ambiguous generation rather than reporting success", async () => {
  const f = fixture(); let live = true, count = 0;
  const result = await f.inspect(18, scope => ({
   async get(...args) { if (!live) throw new Error("TEST cancelled"); return scope.get(...args); },
   async all(...args) { if (++count === 5) live = false; if (!live) throw new Error("TEST cancelled"); return scope.all(...args); },
  }));
  expect(result).toEqual({ ok: false, code: "READ_FAILED" });
  let reads = 0;
  expect(await f.inspect(18, scope => ({ ...scope, async get(...args) {
   const row = await scope.get(...args); if (args[0].includes("schema_version") && ++reads === 2) return { schema_version: BigInt(-1) }; return row;
  } }))).toEqual({ ok: false, code: "AMBIGUOUS_SNAPSHOT" });
 });
 it("survives owner reopen and concurrent queued read transactions without a second owner", async () => {
  const f = fixture(); expect((await Promise.all([f.inspect(), f.inspect(), f.inspect()])).every(r => r.ok)).toBe(true);
  await f.owner.close(); const owner = openAsyncOwner(f.config); owners.push(owner);
  const result = await owner.db.transaction().execute(async () => validateReviewedSchema(owner.scope(() => {
   if (!owner.inTransaction()) throw new Error("Expired TEST scope");
  }), 18));
  expect(result).toEqual({ ok: true, version: 18, scope: "SCHEMA_AND_HISTORY_ONLY" });
 });
 it("preserves real auth/inventory data under the same signed-cookie Admin gateway; anonymous and Salesperson cannot invoke it", async () => {
  const directory = mkdtempSync(path.join(run, "enrolled-")); copyFileSync(bases.get(8)!, path.join(directory, "test.sqlite3"));
  const passwords = { ADMIN: randomBytes(18).toString("base64url"), SALESPERSON: randomBytes(18).toString("base64url") };
  await runTrustedFirstRunSetup(configuration(directory, 8), async () => passwords);
  let db = openDatabase(configuration(directory, 8).database);
  try {
   db.transaction(tx => { tx.run("INSERT INTO auth_enrollment_binding VALUES(?,?,?,?,?,?,?)", [BigInt(1), BigInt(1), BigInt(1), randomUUID(), randomUUID(), randomUUID(), "0".repeat(64)]); });
   // Non-authorizing disposable TEST binding only; no vault/anchor or production enrollment.
   expect(applyMigrations(db, source).version).toBe(BigInt(18));
  } finally { db.close(); }
  const origins = { ADMIN: "https://localhost:9773", SALESPERSON: "https://127.0.0.1:9773" };
  const signingSecrets = { ADMIN: randomBytes(48).toString("base64url"), SALESPERSON: randomBytes(48).toString("base64url") };
  const config: AuthorizationConfiguration = { ...configuration(directory, 18), origins, signingSecrets, sessionLifetimeSeconds: 3600 };
  const gateway = await openAuthorizationGateway(config); gateways.push(gateway);
  const sensitive = [...Object.values(passwords), ...Object.values(signingSecrets)];
  async function login(role: Role) {
   const proof = await (role === "ADMIN" ? gateway.verifyAdminPassword(passwords.ADMIN) : gateway.verifySalespersonPassword(passwords.SALESPERSON));
   const response = await (role === "ADMIN" ? gateway.issueAdminSession(proof) : gateway.issueSalespersonSession(proof));
   const cookie = response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
   sensitive.push(cookie);
   for (const c of cookie.split("; ")) {
    const value = decodeURIComponent(c.split("=").slice(1).join("="));
    if (value) sensitive.push(value, value.split(".")[0]);
   }
   return new Request(origins[role] + "/private-schema-review", { headers: { origin: origins[role], cookie } });
  }
  const admin = await login("ADMIN"), salesperson = await login("SALESPERSON"), inventory = createInventoryService(gateway);
  const product = await inventory.createProduct(admin, { requestKey: randomUUID(), name: "TEST schema sentinel", unit: "PACK", buyingPricePaisa: "1250", sellingPricePaisa: "1800", sellingActive: true, openingQuantity: "5", lowStockThreshold: "2" });
  await inventory.receiveStock(admin, { requestKey: randomUUID(), productId: product.product.id, expectedProductVersion: product.product.productVersion,
   expectedBalanceVersion: product.product.balanceVersion, quantity: "2", unitBuyingPricePaisa: "1250", reason: "TEST receipt" });
  db = openDatabase(configuration(directory, 18).database);
  try {
   const tables = ["auth_users", "auth_credentials", "auth_principals", "auth_provisioning", "auth_enrollment_binding", "auth_session_authorizations", "auth_login_attempts", "schema_migrations",
    "products", "stock_balances", "inventory_operations", "stock_movements", "product_events", "product_identifiers"];
   const snapshot = () => stable(tables.map(t => db.all("SELECT * FROM main." + t + " ORDER BY rowid")));
   const before = snapshot(); const calls: string[] = [];
   const result = await gateway.withAdminTransaction(admin, async tx => validateReviewedSchema({
    async get(...args) { calls.push(args[0]); return tx.get(...args); }, async all(...args) { calls.push(args[0]); return tx.all(...args); },
   }, 18));
   expect(result).toEqual({ ok: true, version: 18, scope: "SCHEMA_AND_HISTORY_ONLY" }); expect(calls.every(c => c.startsWith("SELECT "))).toBe(true);
   expect(snapshot() === before).toBe(true); expect(db.all("SELECT * FROM pragma_foreign_key_check")).toEqual([]);
   const ledger = db.all("SELECT before_q,delta_q,after_q FROM stock_movements WHERE product_id=? ORDER BY balance_version", [product.product.id]);
   expect(ledger).toHaveLength(2); expect(ledger[0]).toEqual({ before_q: BigInt(0), delta_q: BigInt(5000000), after_q: BigInt(5000000) });
   expect(ledger[1]).toEqual({ before_q: BigInt(5000000), delta_q: BigInt(2000000), after_q: BigInt(7000000) });
   expect(db.get("SELECT sellable_q FROM stock_balances WHERE product_id=?", [product.product.id])?.sellable_q).toBe(ledger[1].after_q);
   expect(() => db.transaction(tx => { tx.run("UPDATE stock_movements SET after_q=after_q+1000000 WHERE product_id=?", [product.product.id]); })).toThrow();
   expect(snapshot() === before).toBe(true);
   let invoked = 0;
   for (const request of [new Request(origins.ADMIN + "/private-schema-review", { headers: { origin: origins.ADMIN } }), salesperson]) {
    await expect(gateway.withAdminTransaction(request, async tx => { invoked++; return validateReviewedSchema(tx, 18); })).rejects.toMatchObject({ name: "AuthorizationDenied" });
   }
   expect(invoked).toBe(0); expect(snapshot() === before).toBe(true);
   expect(sensitive.filter(s => s.length >= 8).some(s => stable(result).includes(s))).toBe(false);
   const credentials = db.all("SELECT password FROM auth_credentials").map(r => r.password);
   expect(credentials.some(s => typeof s === "string" && stable(result).includes(s))).toBe(false);
   for (const suffix of ["", "-wal"]) if (existsSync(path.join(directory, "test.sqlite3") + suffix)) {
    const bytes = readFileSync(path.join(directory, "test.sqlite3") + suffix);
    expect(sensitive.filter(s => s.length >= 8).some(s => bytes.includes(Buffer.from(s)))).toBe(false);
   }
  } finally { db.close(); }
 });
});

describe("B2 Part3 defensive metadata and historical corruption bounds", () => {
 it("rejects an unknown extra migration row even when user_version remains18", async () => {
  const f = fixture(); await f.execute("INSERT INTO schema_migrations VALUES(19,'0019_test_unknown.sql','" + "0".repeat(64) + "',1)");
  expect(await f.inspect()).toEqual({ ok: false, code: "HISTORY_MISMATCH" });
 });
 it("denies impossible page metadata and changed internal index metadata (read-fault injection, real SQL underneath)", async () => {
  const f = fixture();
  expect(await f.inspect(18, scope => ({ ...scope, async get(...args) {
   const row = await scope.get(...args); return args[0].includes("pragma_page_count") ? { page_count: BigInt(1) } : row;
  } }))).toEqual({ ok: false, code: "METADATA_MISMATCH" });
  expect(await f.inspect(18, scope => ({ ...scope, async all(...args) {
   const rows = await scope.all(...args);
   return args[0].includes("pragma_index_xinfo") ? rows.map((r, i) => i === 0 ? { ...r, coll: "NOCASE" } : r) : rows;
  } }))).toEqual({ ok: false, code: "METADATA_MISMATCH" });
 });
});
