// TEST ONLY. No login instance, HTTP handler, production schema or shop data.
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { getAuthTables } from "@better-auth/core/db";
import { getCurrentAdapter, runWithTransaction } from "@better-auth/core/context";
import { mkdtempSync, mkdirSync, lstatSync, realpathSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, "../..");
export const principal = "TEST-principal";
export const fakePassword = "TEST-PLACEHOLDER-NOT-A-PASSWORD-HASH-v1";
export function inside(filename) {
  const parent = realpathSync(dirname(filename));
  const base = realpathSync(join(here, "test-results"));
  assert.ok(relative(base, parent) && !relative(base, parent).startsWith(".."));
  assert.ok(!lstatSync(parent).isSymbolicLink());
  if (lstatSync(parent).nlink < 1) throw new Error("Invalid TEST directory");
  assert.equal(resolve(filename), join(parent, "test.sqlite"));
  return filename;
}
export function openNative(filename, readonly = false) {
  inside(filename);
  const native = new Database(filename, { timeout: 250, readonly, fileMustExist: readonly });
  try {
    native.pragma("foreign_keys = ON");
    if (!readonly) native.pragma("journal_mode = WAL");
    native.pragma("synchronous = FULL");
    native.pragma("busy_timeout = 250");
    native.pragma("trusted_schema = OFF");
    assert.equal(native.pragma("foreign_keys", { simple: true }), 1);
    assert.equal(native.pragma("journal_mode", { simple: true }), "wal");
    assert.equal(native.pragma("synchronous", { simple: true }), 2);
    assert.equal(native.pragma("busy_timeout", { simple: true }), 250);
    assert.equal(native.prepare("SELECT sqlite_version() AS v").get().v, "3.53.4");
    return native;
  } catch (error) { native.close(); throw error; }
}
const quote = s => {
  assert.match(s, /^[a-zA-Z][a-zA-Z0-9_]*$/);
  return '"' + s + '"';
};
function createTestSchema(native, options) {
  const schema = getAuthTables(options);
  // Exact pinned model metadata, renamed to test_* tables. DATE maps to ISO TEXT
  // as the real SQLite adapter expects. This is NOT a production migration.
  for (const key of ["user", "session", "account", "verification"]) {
    const table = schema[key];
    assert.ok(table.modelName.startsWith("test_"));
    const fields = ["id TEXT PRIMARY KEY NOT NULL"];
    for (const [keyName, f] of Object.entries(table.fields)) {
      const name = f.fieldName ?? keyName;
      const type = f.type === "boolean" || f.type === "number" ? "INTEGER" : "TEXT";
      let column = quote(name) + " " + type + (f.required ? " NOT NULL" : "") + (f.unique ? " UNIQUE" : "");
      if (f.references) {
        const target = schema[f.references.model];
        column += " REFERENCES " + quote(target.modelName) + "(" + quote(f.references.field) + ") ON DELETE CASCADE";
        if (key === "session") column += " DEFERRABLE INITIALLY DEFERRED";
      }
      if (key === "session" && keyName === "token") column += " CHECK (" + quote(name) + " LIKE 'TEST-%')";
      if (key === "account" && keyName === "password") column += " CHECK (" + quote(name) + " IS NULL OR " + quote(name) + " LIKE 'TEST-%')";
      if (key === "account" && keyName === "providerId") column += " CHECK (" + quote(name) + " = 'TEST-NOT-A-LOGIN-PROVIDER')";
      fields.push(column);
    }
    native.exec("CREATE TABLE " + quote(table.modelName) + " (" + fields.join(", ") + ") STRICT");
  }
}
export async function fixture(existingFilename) {
  mkdirSync(join(here, "test-results"), { recursive: true });
  const filename = existingFilename ?? join(mkdtempSync(join(here, "test-results/run-")), "test.sqlite");
  const native = openNative(filename);
  const db = new Kysely({ dialect: new SqliteDialect({ database: native }) });
  const options = {
    database: { db, type: "sqlite", transaction: true },
    user: { modelName: "test_principal" },
    account: { modelName: "test_credential" },
    session: { modelName: "test_session" },
    verification: { modelName: "test_challenge" },
    advanced: { database: { generateId: false, joins: false } },
    telemetry: { enabled: false }
  };
  let observer;
  try {
    if (!existingFilename) createTestSchema(native, options);
    const adapter = kyselyAdapter(db, { type: "sqlite", transaction: true })(options);
    assert.equal(typeof adapter.options.adapterConfig.transaction, "function");
    // This triggers the real adapter and its runtime schema check before tests.
    await adapter.findMany({ model: "user", limit: 10 });
    observer = openNative(filename, true);
    const operations = [];
    const tx = work => runWithTransaction(adapter, async () => work(await getCurrentAdapter(adapter)));
    const api = {
      filename, native, observer, db, adapter, options, operations, tx,
      read(sql, ...args) { return observer.prepare(sql).all(...args); },
      count(table) { assert.match(table, /^test_[a-z_]+$/); return observer.prepare("SELECT count(*) AS n FROM " + table).get().n; },
      async close() { if (observer?.open) observer.close(); await db.destroy(); },
      async seed() {
        await tx(async a => {
          await a.create({ model: "user", forceAllowId: true, data: { id: principal, name: "TEST generic principal", email: "test-record@example.invalid", emailVerified: false, createdAt: new Date(), updatedAt: new Date() } });
          await a.create({ model: "account", forceAllowId: true, data: { id: "TEST-credential", userId: principal, accountId: principal, providerId: "TEST-NOT-A-LOGIN-PROVIDER", password: fakePassword, createdAt: new Date(), updatedAt: new Date() } });
        });
      }
    };
    return api;
  } catch (error) { if (observer?.open) observer.close(); await db.destroy(); throw error; }
}
export const session = (id, userId = principal) => ({ id, userId, token: "TEST-" + id, expiresAt: new Date(Date.now() + 3600000), createdAt: new Date(), updatedAt: new Date() });
export const createSession = (a, id, userId) => a.create({ model: "session", forceAllowId: true, data: session(id, userId) });
export const delayTurn = () => new Promise(resolve => setImmediate(resolve));
export const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
export function provenance() {
  const names = ["better-auth", "@better-auth/core", "@better-auth/kysely-adapter", "kysely", "better-sqlite3", "node-addon-api"];
  return {
    runtime: { node: process.version, platform: process.platform, arch: process.arch, abi: process.versions.modules, napi: process.versions.napi },
    packages: names.map(name => ({ name, version: JSON.parse(readFileSync(join(here, "node_modules", name, "package.json"), "utf8")).version })),
    nativeSha256: createHash("sha256").update(readFileSync(join(here, "node_modules/better-sqlite3/prebuilds/win32-x64.node"))).digest("hex")
  };
}
