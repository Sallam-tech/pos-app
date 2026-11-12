import { createHash } from "node:crypto";
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type SqliteConnection, type SqlTransaction, type SqlValue } from "../../src/server/db/connection";
import { DatabaseFoundationError } from "../../src/server/db/errors";
import { addInt64, int64, INT64_MAX, INT64_MIN } from "../../src/server/db/integers";
import type { DatabaseOptions } from "../../src/server/db/location";
import { applyMigrations, loadMigrations } from "../../src/server/db/migrate";

const base = path.resolve("test-results/sqlite-b1b-part1");
mkdirSync(base, { recursive: true });
const run = mkdtempSync(path.join(base, "run-"));
const fixtures = path.resolve("tests/fixtures/sqlite-b1b/migrations");
const connections: SqliteConnection[] = [];
const one = BigInt(1);
const zero = BigInt(0);

function options(): DatabaseOptions {
  return { directory: mkdtempSync(path.join(run, "case-")), filename: "test.sqlite3", mode: "test", create: true };
}
function open(config = options()) {
  const db = openDatabase(config);
  connections.push(db);
  return db;
}
function ready() {
  const config = options();
  const db = open(config);
  applyMigrations(db, fixtures);
  return { db, config };
}
function insert(tx: SqlTransaction, label: string, value = one) {
  return tx.run("INSERT INTO test_parent(value, label) VALUES (?, ?)", [value, label]);
}
function count(db: SqliteConnection) { return db.get("SELECT count(*) AS n FROM test_parent")?.n; }
function migrations(count = 3): string {
  const directory = mkdtempSync(path.join(run, "sql-"));
  for (const file of readdirSync(fixtures).sort().slice(0, count)) copyFileSync(path.join(fixtures, file), path.join(directory, file));
  return directory;
}
function code(work: () => unknown, expected: string) {
  let caught: unknown;
  try { work(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(DatabaseFoundationError);
  expect(caught).toMatchObject({ code: expected });
}
function digest(filename: string) { return createHash("sha256").update(readFileSync(filename)).digest("hex"); }

afterEach(() => {
  for (const db of connections.splice(0)) db.close();
  vi.unstubAllEnvs();
});

describe("B1b Part 1: disposable file-backed SQLite foundation", () => {
  it("asserts WAL, FULL, FK, bounded busy timeout and BigInt on two connections", () => {
    const config = { ...options(), busyTimeoutMs: 75 };
    const first = open(config);
    const second = open({ ...config, create: false });
    for (const db of [first, second]) {
      expect(db.settings).toEqual({ sqliteVersion: "3.53.4", journalMode: "wal", foreignKeys: true, synchronous: "FULL", busyTimeoutMs: 75 });
      expect(db.get("SELECT * FROM pragma_journal_mode")?.journal_mode).toBe("wal");
      expect(db.get("SELECT * FROM pragma_synchronous")?.synchronous).toBe(BigInt(2));
      expect(db.get("SELECT * FROM pragma_foreign_keys")?.foreign_keys).toBe(one);
      expect(db.get("SELECT * FROM pragma_busy_timeout")?.timeout).toBe(BigInt(75));
      expect(db.get("SELECT 9007199254740993 AS exact")?.exact).toBe(BigInt("9007199254740993"));
    }
  });

  it("enforces FK/STRICT constraints and binds hostile-looking text literally", () => {
    const { db } = ready();
    const hostile = "x'); DROP TABLE test_parent; --";
    db.transaction((tx) => insert(tx, hostile));
    expect(db.get("SELECT label FROM test_parent WHERE label = ?", [hostile])?.label).toBe(hostile);
    expect(() => db.transaction((tx) => tx.run("INSERT INTO test_child(parent_id,note) VALUES (?,?)", [BigInt(999), "orphan"]))).toThrowError(expect.objectContaining({ sqliteCode: "SQLITE_CONSTRAINT_FOREIGNKEY" }));
    expect(() => db.transaction((tx) => tx.run("INSERT INTO test_parent(value,label) VALUES ('text','invalid')"))).toThrow();
    expect(count(db)).toBe(one);
  });

  it("round-trips signed int64 extremes and rejects Number, binding overflow and REAL arithmetic", () => {
    const { db } = ready();
    for (const [index, value] of [INT64_MIN, INT64_MAX, BigInt("9007199254740993")].entries()) {
      db.transaction((tx) => insert(tx, String(index), value));
      expect(db.get("SELECT value FROM test_parent WHERE label = ?", [String(index)])?.value).toBe(value);
    }
    for (const value of [1, Number.MAX_SAFE_INTEGER, "1", INT64_MIN - one, INT64_MAX + one]) code(() => int64(value), "UNSAFE_INTEGER");
    code(() => addInt64(INT64_MAX, one), "UNSAFE_INTEGER");
    code(() => addInt64(INT64_MIN, -one), "UNSAFE_INTEGER");
    code(() => db.transaction((tx) => insert(tx, "overflow", INT64_MAX + one)), "UNSAFE_INTEGER");
    code(() => db.get("SELECT ? AS invalid", [1 as unknown as SqlValue]), "UNSAFE_INTEGER");
    code(() => db.get("SELECT ? + 1 AS invalid", [INT64_MAX]), "UNSAFE_INTEGER");
    code(() => db.transaction((tx) => tx.run("UPDATE test_parent SET value = value + 1 WHERE label = '1'")), "STATEMENT_FAILED");
    expect(count(db)).toBe(BigInt(3));
  });

  it("commits parent/child effects together and rolls back every effect after a later failure", () => {
    const { db } = ready();
    db.transaction((tx) => { const parent = insert(tx, "committed"); tx.run("INSERT INTO test_child(parent_id,note) VALUES (?,?)", [parent.lastInsertRowid, "ok"]); });
    expect(() => db.transaction((tx) => { insert(tx, "must-rollback"); tx.run("INSERT INTO test_child(parent_id,note) VALUES (?,?)", [BigInt(999), "invalid"]); })).toThrow();
    expect(count(db)).toBe(one);
    expect(db.get("SELECT count(*) AS n FROM test_child")?.n).toBe(one);
  });

  it("rolls back when a deferred foreign-key violation fails at COMMIT", () => {
    const db = open();
    db.transaction((tx) => {
      tx.run("CREATE TABLE test_ref (id INTEGER PRIMARY KEY) STRICT");
      tx.run("CREATE TABLE test_deferred (id INTEGER REFERENCES test_ref(id) DEFERRABLE INITIALLY DEFERRED) STRICT");
    });
    expect(() => db.transaction((tx) => tx.run("INSERT INTO test_deferred(id) VALUES (?)", [one]))).toThrow();
    expect(db.get("SELECT count(*) AS n FROM test_deferred")?.n).toBe(zero);
    db.transaction((tx) => tx.run("INSERT INTO test_ref(id) VALUES (?)", [one]));
  });

  it("rejects recognized async/generator callbacks before entering them", () => {
    const { db } = ready();
    let entered = false;
    const asynchronous = async () => { entered = true; };
    const generator = function* () { entered = true; yield one; };
    code(() => db.transaction(asynchronous), "SQL_REJECTED");
    code(() => db.transaction(generator), "SQL_REJECTED");
    expect(entered).toBe(false);
    expect(count(db)).toBe(zero);
  });

  it("rolls back returned thenables and revokes captured transaction scopes before later work", async () => {
    const { db } = ready();
    let captured: SqlTransaction | undefined;
    code(() => db.transaction((tx) => { captured = tx; insert(tx, "rollback"); return { then() {} }; }), "SQL_REJECTED");
    await Promise.resolve();
    code(() => insert(captured!, "late"), "SCOPE_CLOSED");
    expect(count(db)).toBe(zero);
    const completed = db.transaction((tx) => { insert(tx, "saved"); return tx; });
    code(() => insert(completed, "after-commit"), "SCOPE_CLOSED");
    expect(count(db)).toBe(one);
  });

  it("revokes hidden asynchronous work before it can write after rollback", async () => {
    const { db } = ready();
    let pending: Promise<void> | undefined;
    let lateError: unknown;
    code(() => db.transaction((tx) => {
      insert(tx, "before-await");
      pending = (async () => {
        await Promise.resolve();
        try { insert(tx, "after-await"); } catch (error) { lateError = error; }
      })();
      return pending;
    }), "SQL_REJECTED");
    await pending;
    expect(lateError).toMatchObject({ code: "SCOPE_CLOSED" });
    expect(count(db)).toBe(zero);
  });
  it("rejects nested transactions and using the outer connection inside a transaction", () => {
    const { db } = ready();
    code(() => db.transaction((tx) => { insert(tx, "nested"); db.transaction(() => undefined); }), "CONNECTION_BUSY");
    code(() => db.transaction((tx) => { insert(tx, "outer"); db.get("SELECT 1"); }), "CONNECTION_BUSY");
    code(() => db.transaction(() => db.close()), "CONNECTION_BUSY");
    expect(count(db)).toBe(zero);
  });

  it("rejects SQL transaction/configuration escapes, multi-statements and writable reads", () => {
    const { db } = ready();
    code(() => db.get("PRAGMA foreign_keys = OFF"), "SQL_REJECTED");
    code(() => db.transaction((tx) => { insert(tx, "escape"); tx.run("COMMIT"); }), "SQL_REJECTED");
    expect(() => db.transaction((tx) => tx.run("INSERT INTO test_parent(value,label) VALUES (1,'a'); INSERT INTO test_parent(value,label) VALUES (2,'b')"))).toThrow();
    code(() => db.get("WITH n AS (SELECT 1) DELETE FROM test_parent RETURNING id"), "SQL_REJECTED");
    expect(count(db)).toBe(zero);
  });

  it("bounds lock contention without replaying or losing the holding transaction", () => {
    const { db, config } = ready();
    const other = open({ ...config, create: false, busyTimeoutMs: 25 });
    db.transaction((tx) => {
      insert(tx, "holder");
      expect(count(other)).toBe(zero);
      expect(() => other.transaction((otherTx) => insert(otherTx, "blocked"))).toThrowError(expect.objectContaining({ sqliteCode: "SQLITE_BUSY" }));
    });
    other.transaction((tx) => insert(tx, "after-lock"));
    expect(count(db)).toBe(BigInt(2));
  });

  it("closes idempotently and reopens exact committed data without failed effects", () => {
    const { db, config } = ready();
    db.transaction((tx) => insert(tx, "durable", INT64_MAX));
    expect(() => db.transaction((tx) => { insert(tx, "failed"); throw new Error("injected"); })).toThrow();
    db.close(); db.close();
    code(() => db.get("SELECT 1"), "CONNECTION_CLOSED");
    const reopened = open({ ...config, create: false });
    expect(count(reopened)).toBe(one);
    expect(reopened.get("SELECT value FROM test_parent WHERE label = 'durable'")?.value).toBe(INT64_MAX);
    expect(applyMigrations(reopened, fixtures).applied).toBe(0);
  });

  it("applies numbered files in order, records checksums/version and is repeatable", () => {
    const db = open();
    expect(loadMigrations(fixtures).map((migration) => migration.version)).toEqual([one, BigInt(2), BigInt(3)]);
    expect(applyMigrations(db, fixtures)).toEqual({ applied: 3, version: BigInt(3) });
    const history = db.all("SELECT version, name, checksum FROM schema_migrations ORDER BY version");
    expect(history).toEqual(loadMigrations(fixtures).map(({ version, name, checksum }) => ({ version, name, checksum })));
    expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(3));
    expect(applyMigrations(db, fixtures)).toEqual({ applied: 0, version: BigInt(3) });
  });

  it("rejects changed applied SQL bytes and renamed applied migrations", () => {
    const { db } = ready();
    const changed = migrations();
    const first = path.join(changed, "0001_test_parent.sql");
    writeFileSync(first, readFileSync(first, "utf8") + "\n");
    code(() => applyMigrations(db, changed), "MIGRATION_HISTORY_INVALID");
    const renamed = migrations();
    renameSync(path.join(renamed, "0001_test_parent.sql"), path.join(renamed, "0001_renamed.sql"));
    code(() => applyMigrations(db, renamed), "MIGRATION_HISTORY_INVALID");
    expect(db.get("SELECT count(*) AS n FROM schema_migrations")?.n).toBe(BigInt(3));
  });

  it("rejects newer, missing and inconsistent migration history", () => {
    const { db } = ready();
    code(() => applyMigrations(db, migrations(2)), "MIGRATION_HISTORY_INVALID");
    db.transaction((tx) => tx.setSchemaVersion(BigInt(99)));
    code(() => applyMigrations(db, fixtures), "MIGRATION_HISTORY_INVALID");
    db.transaction((tx) => { tx.setSchemaVersion(BigInt(2)); tx.run("DELETE FROM schema_migrations WHERE version = 2"); });
    code(() => applyMigrations(db, fixtures), "MIGRATION_HISTORY_INVALID");
  });

  it("refuses untracked schemas including names resembling SQLite internal prefixes", () => {
    const db = open();
    db.transaction((tx) => tx.run("CREATE TABLE sqliteXuntracked (value INTEGER) STRICT"));
    code(() => applyMigrations(db, fixtures), "MIGRATION_HISTORY_INVALID");
    expect(db.get("SELECT name FROM sqlite_schema WHERE name = 'schema_migrations'")).toBeUndefined();
  });

  it("rolls back a failed first batch including its history table and version marker", () => {
    const config = options();
    const db = open(config);
    const broken = migrations();
    writeFileSync(path.join(broken, "0002_test_child.sql"), "CREATE TABLE test_child (id INTEGER, broken nonsense syntax) STRICT;");
    code(() => applyMigrations(db, broken), "MIGRATION_FAILED");
    expect(db.all("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'")).toEqual([]);
    expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(zero);
    db.close();
    const reopened = open({ ...config, create: false });
    expect(applyMigrations(reopened, fixtures).applied).toBe(3);
  });

  it("preserves earlier committed schema/data when a later pending batch fails", () => {
    const db = open();
    const directory = migrations(1);
    applyMigrations(db, directory);
    db.transaction((tx) => insert(tx, "previous", INT64_MAX));
    copyFileSync(path.join(fixtures, "0002_test_child.sql"), path.join(directory, "0002_test_child.sql"));
    writeFileSync(path.join(directory, "0003_test_index.sql"), "CREATE INDEX test_bad_idx ON test_parent (missing_column);");
    code(() => applyMigrations(db, directory), "MIGRATION_FAILED");
    expect(db.get("SELECT value FROM test_parent WHERE label = 'previous'")?.value).toBe(INT64_MAX);
    expect(db.get("SELECT name FROM sqlite_schema WHERE name = 'test_child'")).toBeUndefined();
    expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(one);
    copyFileSync(path.join(fixtures, "0003_test_index.sql"), path.join(directory, "0003_test_index.sql"));
    expect(applyMigrations(db, directory).applied).toBe(2);
  });

  it("rejects destructive/control migrations, gaps and duplicate versions before any schema write", () => {
    const db = open();
    for (const sql of ["DROP TABLE anything", "ALTER TABLE anything ADD COLUMN x TEXT", "DELETE FROM anything", "PRAGMA foreign_keys=OFF", "BEGIN", "ATTACH DATABASE 'x' AS other", "VACUUM", "CREATE TABLE IF NOT EXISTS test_x (id INTEGER) STRICT"]) {
      const directory = migrations(0);
      writeFileSync(path.join(directory, "0001_rejected.sql"), sql);
      code(() => applyMigrations(db, directory), "MIGRATION_INVALID");
    }
    const gap = migrations(1);
    copyFileSync(path.join(fixtures, "0003_test_index.sql"), path.join(gap, "0003_test_index.sql"));
    code(() => applyMigrations(db, gap), "MIGRATION_INVALID");
    const duplicate = migrations(1);
    copyFileSync(path.join(fixtures, "0001_test_parent.sql"), path.join(duplicate, "0001_duplicate.sql"));
    code(() => applyMigrations(db, duplicate), "MIGRATION_INVALID");
    expect(db.all("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'")).toEqual([]);
  });

  it("rejects invalid paths/configuration without creating a database", () => {
    const config = options();
    for (const invalid of [
      { directory: "relative" }, { directory: path.join(config.directory, "missing") },
      { directory: path.resolve("public") }, { directory: "\\\\server\\share" },
      { filename: "../outside.sqlite3" }, { filename: ":memory:" }, { filename: "CON.db" },
      { filename: "test.txt" }, { busyTimeoutMs: -1 }, { busyTimeoutMs: 5001 },
      { busyTimeoutMs: 1.5 }, { busyTimeoutMs: Number.NaN }, { mode: "unknown" },
      { mode: "persistent" }, { create: false }, { create: "yes" }, { typo: true },
    ]) code(() => openDatabase({ ...config, ...invalid } as DatabaseOptions), "PATH_INVALID");
    vi.stubEnv("NODE_ENV", "production");
    code(() => openDatabase(config), "PATH_INVALID");
    expect(readdirSync(config.directory)).toEqual([]);
  });

  it("rejects redirected directories and hard-linked database/sidecar files", () => {
    const config = options();
    const link = path.join(run, "junction-" + path.basename(config.directory));
    symlinkSync(config.directory, link, "junction");
    code(() => openDatabase({ ...config, directory: link }), "PATH_INVALID");
    const original = path.join(config.directory, "original.bin");
    writeFileSync(original, "preserve");
    linkSync(original, path.join(config.directory, config.filename));
    code(() => openDatabase(config), "PATH_INVALID");
    const sidecarConfig = options();
    linkSync(original, path.join(sidecarConfig.directory, sidecarConfig.filename + "-wal"));
    code(() => openDatabase(sidecarConfig), "PATH_INVALID");
    expect(readFileSync(original, "utf8")).toBe("preserve");
  });

  it("preserves a corrupt file and reports safe open failure instead of replacing it", () => {
    const config = options();
    const filename = path.join(config.directory, config.filename);
    writeFileSync(filename, "not a SQLite database; preserve diagnostic evidence".repeat(100));
    const before = digest(filename);
    code(() => openDatabase({ ...config, create: false }), "OPEN_FAILED");
    expect(digest(filename)).toBe(before);
  });
});

describe("B1b Part 1 audit regressions", () => {
  function rejectsNonStrict(db: SqliteConnection, directory: string) {
    let failure: unknown;
    try { applyMigrations(db, directory); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: "MIGRATION_FAILED", cause: { code: "MIGRATION_SCHEMA_INVALID" } });
  }

  it("rejects misleading STRICT comments and rolls back the entire first batch", () => {
    for (const sql of [
      "CREATE TABLE test_loose (value INTEGER); -- ) STRICT",
      "CREATE TABLE test_loose (value INTEGER); /* ) STRICT */ -- ) STRICT",
      "CREATE TABLE test_loose (value INTEGER);\n-- table remains loose\n-- ) STRICT",
    ]) {
      const config = options();
      const db = open(config);
      const directory = migrations(1);
      writeFileSync(path.join(directory, "0002_test_loose.sql"), sql);
      rejectsNonStrict(db, directory);
      expect(db.all("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'")).toEqual([]);
      expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(zero);
      expect(db.get("SELECT name FROM sqlite_schema WHERE name = 'schema_migrations'")).toBeUndefined();
      db.close();
      const reopened = open({ ...config, create: false });
      expect(reopened.all("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'")).toEqual([]);
      expect(reopened.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(zero);
    }
  });

  it("checks the intended table instead of unrelated existing STRICT tables", () => {
    const db = open();
    const directory = migrations(1);
    applyMigrations(db, directory);
    db.transaction((tx) => insert(tx, "preserved", BigInt(42)));
    const historyBefore = db.all("SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version");
    expect(db.get("SELECT strict FROM pragma_table_list WHERE schema = 'main' AND name = 'test_parent'")?.strict).toBe(one);
    writeFileSync(path.join(directory, "0002_test_parent_extra.sql"), "CREATE TABLE test_parent_extra (value INTEGER); -- ) STRICT");
    rejectsNonStrict(db, directory);
    expect(db.get("SELECT name FROM sqlite_schema WHERE name = 'test_parent_extra'")).toBeUndefined();
    expect(db.get("SELECT value FROM test_parent WHERE label = 'preserved'")?.value).toBe(BigInt(42));
    expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(one);
    expect(db.all("SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version")).toEqual(historyBefore);
  });

  it("accepts actual STRICT declarations with trailing comments and valid indexes", () => {
    for (const declaration of [
      "CREATE TABLE Test_Valid (value INTEGER NOT NULL) STRICT; -- trailing note",
      "CREATE TABLE Test_Valid (value INTEGER NOT NULL) STRICT; /* trailing note */",
      "-- leading note\nCREATE TABLE Test_Valid (value INTEGER NOT NULL) STRICT;\n-- ) STRICT",
    ]) {
      const db = open();
      const directory = migrations(0);
      writeFileSync(path.join(directory, "0001_test_valid.sql"), declaration);
      writeFileSync(path.join(directory, "0002_test_valid_index.sql"), "CREATE INDEX test_valid_value_idx ON Test_Valid (value); -- index note");
      expect(applyMigrations(db, directory)).toEqual({ applied: 2, version: BigInt(2) });
      expect(db.get("SELECT schema, name, type, strict FROM pragma_table_list WHERE schema = ? AND name = ?", ["main", "Test_Valid"]))
        .toEqual({ schema: "main", name: "Test_Valid", type: "table", strict: one });
      expect(db.get("SELECT type, tbl_name FROM sqlite_schema WHERE name = 'test_valid_value_idx'"))
        .toEqual({ type: "index", tbl_name: "Test_Valid" });
      db.transaction((tx) => tx.run("INSERT INTO Test_Valid(value) VALUES (?)", [one]));
      code(() => db.transaction((tx) => tx.run("INSERT INTO Test_Valid(value) VALUES (?)", ["not an integer"])), "STATEMENT_FAILED");
      expect(db.get("SELECT count(*) AS n FROM Test_Valid")?.n).toBe(one);
      expect(applyMigrations(db, directory).applied).toBe(0);
    }
  });

  it("accepts multiline keyword whitespace for STRICT tables and unique indexes", () => {
    const db = open();
    const directory = migrations(0);
    writeFileSync(path.join(directory, "0001_test_multiline.sql"), "CREATE\nTABLE\tTest_Multiline (value INTEGER NOT NULL) STRICT;");
    writeFileSync(path.join(directory, "0002_test_multiline_index.sql"), "CREATE\nUNIQUE\tINDEX\ntest_multiline_idx\nON\tTest_Multiline (value);");
    expect(applyMigrations(db, directory)).toEqual({ applied: 2, version: BigInt(2) });
    expect(db.get("SELECT strict FROM pragma_table_list WHERE schema = 'main' AND name = 'Test_Multiline'")?.strict).toBe(one);
    db.transaction((tx) => tx.run("INSERT INTO Test_Multiline(value) VALUES (?)", [one]));
    expect(() => db.transaction((tx) => tx.run("INSERT INTO Test_Multiline(value) VALUES (?)", [one])))
      .toThrowError(expect.objectContaining({ sqliteCode: "SQLITE_CONSTRAINT_UNIQUE" }));
    expect(db.get("SELECT count(*) AS n FROM Test_Multiline")?.n).toBe(one);
  });

  it("keeps unsupported grammar and multiple statements explicitly rejected", () => {
    const db = open();
    for (const sql of [
      'CREATE TABLE "test_quoted" (value INTEGER) STRICT;',
      'CREATE INDEX "test_quoted_idx" ON test_parent (value);',
      'CREATE INDEX test_quoted_target ON "test_parent" (value);',
      "CREATE TABLE main.test_qualified (value INTEGER) STRICT;",
      "CREATE /* between keywords */ TABLE test_comment (value INTEGER) STRICT;",
      "CREATE TABLE IF NOT EXISTS test_guarded (value INTEGER) STRICT;",
      "CREATE TEMP TABLE test_temporary (value INTEGER) STRICT;",
      "CREATE VIEW test_view AS SELECT 1;",
      "ALTER TABLE test_parent ADD COLUMN extra TEXT;",
    ]) {
      const directory = migrations(0);
      writeFileSync(path.join(directory, "0001_test_unsupported.sql"), sql);
      code(() => applyMigrations(db, directory), "MIGRATION_INVALID");
    }
    const multiple = migrations(0);
    writeFileSync(path.join(multiple, "0001_test_multiple.sql"), "CREATE TABLE test_multiple (value INTEGER) STRICT; DROP TABLE test_multiple;");
    code(() => applyMigrations(db, multiple), "MIGRATION_FAILED");
    expect(db.all("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'")).toEqual([]);
    expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(zero);
  });

  it("commits ordinary synchronous values with non-callable then and next properties", () => {
    const { db } = ready();
    const values: unknown[] = [{ next: 1 }, { then: "text" }, { then: null, next: undefined }, [1, 2], null, 0];
    for (const [index, value] of values.entries()) {
      expect(db.transaction((tx) => { insert(tx, "sync-" + index); return value; })).toBe(value);
      expect(count(db)).toBe(BigInt(index + 1));
    }
  });

  it("rejects callable thenables, iterators and generators without invoking them", () => {
    const { db } = ready();
    let entered = false;
    const generator = (function* () { entered = true; yield one; })();
    const asyncGenerator = (async function* () { entered = true; yield one; })();
    const alteredGenerator = (function* () { entered = true; yield one; })();
    Object.defineProperty(alteredGenerator, "next", { value: 1 });
    const values: unknown[] = [
      { then() { entered = true; } }, { next() { entered = true; } },
      generator, asyncGenerator, alteredGenerator,
    ];
    for (const value of values) {
      code(() => db.transaction((tx) => { insert(tx, "deferred"); return value; }), "SQL_REJECTED");
      expect(count(db)).toBe(zero);
    }
    const asyncGeneratorCallback = async function* () { entered = true; yield one; };
    code(() => db.transaction(asyncGeneratorCallback), "SQL_REJECTED");
    expect(entered).toBe(false);
  });

  it("rejects actual Promises even when then is non-callable and expires their scope", async () => {
    const { db } = ready();
    let captured: SqlTransaction | undefined;
    const promise = Promise.resolve("not a synchronous result");
    Object.defineProperty(promise, "then", { value: "ordinary text" });
    code(() => db.transaction((tx) => { captured = tx; insert(tx, "promise"); return promise; }), "SQL_REJECTED");
    await Promise.resolve();
    code(() => insert(captured!, "late promise write"), "SCOPE_CLOSED");
    expect(count(db)).toBe(zero);
  });
});
