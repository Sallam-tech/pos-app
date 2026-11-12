import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type SqliteConnection } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { passwordCallbacks } from "../../src/server/auth/password";
import { assertOfflinePassword } from "../../src/server/auth/offline-password";
import { openAuthorizationGateway } from "../../src/server/auth/gateway";
import type { AuthorizationConfiguration, AuthorizationGateway } from "../../src/server/auth/types";
import type { ProvisioningConfiguration, SetupPasswords } from "../../src/server/auth/provision";

const probe = vi.hoisted(() => ({
  creates: 0, transactionAdapters: 0, failAfter: 0, failBeforeCommit: false,
  detail: "", corruptCorpus: false, missingCorpus: false, sqlConstraintFailure: false,
  corpusDescriptors: new Set<number>(),
  afterCreate: undefined as undefined | ((ordinal: number) => Promise<void>),
  contexts: [] as ReturnType<typeof import("better-auth")["betterAuth"]>[],
}));
// Observe REAL transaction adapters; fault injection is opt-in and named.
// No replacement adapter/database/crypto/framework behavior in success tests.
vi.mock("@better-auth/kysely-adapter", async importOriginal => {
  const actual = await importOriginal<typeof import("@better-auth/kysely-adapter")>();
  return { ...actual, kyselyAdapter: (...args: Parameters<typeof actual.kyselyAdapter>) => {
    const make = actual.kyselyAdapter(...args);
    return (options: Parameters<typeof make>[0]) => {
      const adapter = make(options), transact = adapter.transaction.bind(adapter);
      adapter.transaction = work => transact(async transaction => {
        probe.transactionAdapters++;
        const create = transaction.create.bind(transaction);
        transaction.create = (async input => {
          if (probe.sqlConstraintFailure && input.model === "account") {
            input = { ...input, data: { ...input.data, providerId: "TEST_INVALID_PROVIDER" } };
          }
          const result = await create(input);
          const ordinal = ++probe.creates;
          await probe.afterCreate?.(ordinal);
          if (probe.failAfter === ordinal) throw new Error(probe.detail);
          return result;
        }) as typeof transaction.create;
        const result = await work(transaction);
        if (probe.failBeforeCommit) throw new Error(probe.detail);
        return result;
      });
      return adapter;
    };
  } };
});
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual,
    openSync: (...args: Parameters<typeof actual.openSync>) => {
      const corpus = args[0] instanceof URL && args[0].pathname.endsWith("/admin-policy/common-passwords.sha256");
      if (corpus && probe.missingCorpus) throw new Error(probe.detail);
      const descriptor = actual.openSync(...args);
      if (corpus) probe.corpusDescriptors.add(descriptor);
      return descriptor;
    },
    readSync: (descriptor: number, buffer: Buffer, offset: number, length: number, position: number | null) => {
      const count = actual.readSync(descriptor, buffer, offset, length, position);
      if (probe.corruptCorpus && probe.corpusDescriptors.has(descriptor) && count > 0) buffer[offset] ^= 1;
      return count;
    },
    closeSync: (descriptor: number) => {
      try { actual.closeSync(descriptor); } finally { probe.corpusDescriptors.delete(descriptor); }
    },
  };
});
vi.mock("better-auth", async importOriginal => {
  const actual = await importOriginal<typeof import("better-auth")>();
  return { ...actual, betterAuth: (options: import("@better-auth/core").BetterAuthOptions) => {
    const instance = actual.betterAuth(options); probe.contexts.push(instance); return instance;
  } };
});
const secrets = new Set<string>();
const remember = (value: string) => { secrets.add(value); return value; };
const fake = (length = 32) => remember(randomBytes(24).toString("base64url").slice(0, length));
const containsSecret = (text: string) => [...secrets].some(value => text.includes(value));
const credentials = (): SetupPasswords => ({ ADMIN: fake(8), SALESPERSON: fake(8) });
const root = path.resolve("test-results/sqlite-b1b-part1");
mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "provision3g-"));
const dbs: SqliteConnection[] = [], gateways: AuthorizationGateway[] = [], audits: (() => void)[] = [];
const one = BigInt(1), zero = BigInt(0);
const roles = ["ADMIN", "SALESPERSON"] as const;
const authTables = ["auth_users", "auth_credentials", "auth_principals", "auth_session_authorizations", "auth_provisioning", "auth_login_attempts", "auth_enrollment_binding"];

beforeEach(() => {
  probe.creates = 0; probe.transactionAdapters = 0; probe.failAfter = 0; probe.failBeforeCommit = false;
  probe.afterCreate = undefined; probe.detail = ""; probe.corruptCorpus = false; probe.missingCorpus = false; probe.sqlConstraintFailure = false;
});
afterEach(async () => {
  probe.afterCreate = undefined; probe.failAfter = 0; probe.failBeforeCommit = false;
  probe.corruptCorpus = false; probe.missingCorpus = false; probe.sqlConstraintFailure = false;
  for (const gateway of gateways.splice(0)) await gateway.close();
  for (const db of dbs.splice(0)) db.close();
  for (const audit of audits.splice(0)) audit();
});
function fixture() {
  const directory = mkdtempSync(path.join(run, "db-")), migrationsDirectory = mkdtempSync(path.join(run, "migrations-"));
  const source = path.resolve("src/server/db/migrations");
  for (const name of readdirSync(source).filter(name => name.endsWith(".sql"))) copyFileSync(path.join(source, name), path.join(migrationsDirectory, name));
  const database = { directory, filename: "test.sqlite3", mode: "test" as const, create: true, busyTimeoutMs: 75 };
  const db = openDatabase(database); dbs.push(db); applyMigrations(db, migrationsDirectory);
  const config: ProvisioningConfiguration = { database: { ...database, create: false }, migrationsDirectory };
  const history = () => db.all("SELECT version,name,checksum,applied_at FROM schema_migrations ORDER BY version");
  const originalHistory = history();
  audits.push(() => {
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = path.join(directory, database.filename) + suffix;
      if (suffix && !existsSync(file)) continue;
      expect(containsSecret(readFileSync(file).toString("latin1"))).toBe(false);
    }
  });
  const empty = () => {
    for (const table of authTables) expect(db.get("SELECT count(*) AS n FROM " + table)?.n).toBe(zero);
    expect(history()).toEqual(originalHistory);
    expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(8));
  };
  return { db, config, history, originalHistory, empty };
}
async function setup(config: ProvisioningConfiguration, passwords: SetupPasswords) {
  const setupModule = await import("../../src/server/auth/provision");
  return setupModule.runTrustedFirstRunSetup(config, async () => passwords);
}
async function rejected(work: Promise<unknown>) {
  let caught: unknown;
  try { await work; } catch (error) { caught = error; }
  expect(caught instanceof Error).toBe(true);
  const error = caught as Error;
  expect(error.name === "ProvisioningRejected").toBe(true);
  expect(error.message === "Account setup was rejected.").toBe(true);
  expect(Object.hasOwn(error, "cause")).toBe(false);
  expect(containsSecret(JSON.stringify({ message: error.message, stack: error.stack }))).toBe(false);
}
function incomplete(f: ReturnType<typeof fixture>) {
  const now = new Date().toISOString(), shape = randomBytes(16).toString("hex") + ":" + randomBytes(64).toString("hex");
  f.db.transaction(tx => {
    tx.run("INSERT INTO auth_users(id,role,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)",
      ["ADMIN", "ADMIN", "TEST", "admin@shop-pos.invalid", zero, now, now]);
    tx.run("INSERT INTO auth_credentials(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)",
      ["ADMIN", "ADMIN", "credential", "ADMIN", shape, now, now]);
    tx.run("INSERT INTO auth_principals(id,credential_version,auth_epoch,active,provisioned_at_ms) VALUES(?,?,?,?,?)",
      ["ADMIN", one, one, one, BigInt(Date.now())]);
  });
}
function gatewayConfiguration(f: ReturnType<typeof fixture>): AuthorizationConfiguration {
  return { ...f.config, origins: { ADMIN: "https://admin.provision-proof.invalid", SALESPERSON: "https://staff.provision-proof.invalid" },
    signingSecrets: { ADMIN: remember(randomBytes(48).toString("base64url")), SALESPERSON: remember(randomBytes(48).toString("base64url")) },
    sessionLifetimeSeconds: 120 };
}
function commonSample(length = 8) {
  const set = new Set(readFileSync(path.resolve("src/server/auth/admin-policy/common-passwords.sha256"), "utf8").trim().split("\n"));
  const word = String.fromCharCode(112, 97, 115, 115, 119, 111, 114, 100);
  const candidates = Array.from({ length: 10 }, (_, start) =>
    Array.from({ length }, (_, i) => String((start + i) % 10)).join(""));
  if (length === 8) candidates.push(word);
  else for (let start = 0; start < 10; start++) candidates.push(word +
    Array.from({ length: length - 8 }, (_, i) => String((start + i) % 10)).join(""));
  const found = candidates.find(candidate => set.has(createHash("sha256").update(candidate).digest("hex")));
  if (found !== undefined) return found; // Public blocklist vector, not a real credential.
  throw new Error("Reviewed common-password TEST sample unavailable.");
}
describe("Parts 3C/3G explicit atomic two-account provisioning", () => {
  it("does not create accounts, open a gateway or acquire ownership on a fresh module import", async () => {
    const f = fixture(), before = probe.creates;
    const setupModule = await import("../../src/server/auth/provision");
    expect(Object.keys(setupModule).sort()).toEqual(["ProvisioningRejected", "provisioningFailureOutcome", "runTrustedFirstRunSetup"].sort());
    expect(probe.creates).toBe(before); f.empty();
    expect((globalThis as Record<symbol, unknown>)[Symbol.for("shop-pos.authorization.single-process-owner")]).toBeUndefined();
  });
  it("creates both fixed identities with eight-character passwords and the STRICT latch atomically", async () => {
    const f = fixture(), passwords = credentials();
    const result = await setup(f.config, passwords);
    expect(result).toBeUndefined();
    expect(JSON.stringify({ completed: result === undefined }).includes(passwords.ADMIN)).toBe(false);
    const rows = f.db.all(`SELECT u.id,u.role,u.name,u.email,c.id AS credential_id,c.userId,c.accountId,c.providerId,
      p.credential_version,p.auth_epoch,p.active,p.provisioned_at_ms FROM auth_users u
      JOIN auth_credentials c ON c.userId=u.id JOIN auth_principals p ON p.id=u.id ORDER BY u.id`);
    expect(rows.length).toBe(2);
    expect(rows.every((row, i) => row.id === roles[i] && row.role === roles[i] && row.credential_id === roles[i] &&
      row.userId === roles[i] && row.accountId === roles[i] && row.providerId === "credential" &&
      row.credential_version === one && row.auth_epoch === one && row.active === one)).toBe(true);
    expect(rows[0].provisioned_at_ms === rows[1].provisioned_at_ms).toBe(true);
    expect(rows[1].name).toBe("Shared Salesperson");
    expect(f.db.get("SELECT count(*) AS n FROM auth_provisioning")?.n).toBe(one);
    expect(f.db.all("SELECT bucket FROM auth_login_attempts ORDER BY bucket").map(row => row.bucket)).toEqual(["ADMIN", "GLOBAL", "SALESPERSON"]);
    expect(f.db.all("SELECT revision,last_seen_ms,cooldown_until_ms,failed_1_ms,failed_10_ms FROM auth_login_attempts").every(row => Object.values(row).every(value => value === zero))).toBe(true);
    expect(f.db.get("SELECT strict FROM pragma_table_list WHERE name='auth_provisioning'")?.strict).toBe(one);
    expect(f.db.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n).toBe(zero);
    expect(f.history()).toEqual(f.originalHistory);
    expect(probe.creates).toBe(4); expect(probe.transactionAdapters).toBe(1);
    expect(() => f.db.transaction(tx => tx.run("DELETE FROM auth_principals WHERE id=?", ["ADMIN"]))).toThrow();
    expect(() => f.db.transaction(tx => tx.run("UPDATE auth_users SET role=? WHERE id=?", ["ADMIN", "SALESPERSON"]))).toThrow();
    for (const role of roles) {
      const account = f.db.get("SELECT password FROM auth_credentials WHERE id=?", [role]);
      expect(typeof account?.password === "string").toBe(true);
      expect(await passwordCallbacks.verify({ hash: account!.password as string, password: passwords[role] })).toBe(true);
    }
  });
  it("makes both users invisible to an independent reader until the full commit and excludes another writer", async () => {
    const f = fixture();
    let checks = 0;
    probe.afterCreate = async ordinal => {
      if (ordinal !== 3) return;
      expect(f.db.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(zero);
      expect(f.db.get("SELECT count(*) AS n FROM auth_principals WHERE active=1")?.n).toBe(zero);
      expect(() => f.db.transaction(tx => tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch"))).toThrow();
      await new Promise(resolve => setImmediate(resolve)); checks++;
    };
    await setup(f.config, credentials());
    expect(checks).toBe(1);
    expect(f.db.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(BigInt(2));
  });
  it("rejects identical credential bytes before any transaction or account write", async () => {
    const f = fixture(), password = fake(8);
    await rejected(setup(f.config, { ADMIN: password, SALESPERSON: password }));
    expect(probe.creates).toBe(0); expect(probe.transactionAdapters).toBe(0); f.empty();
  });
  it("accepts visually similar but byte-distinct Unicode credentials and retains their exact identity", async () => {
    const f = fixture(), suffix = fake(7), passwords = { ADMIN: remember("\u00e9" + suffix), SALESPERSON: remember("e\u0301" + suffix) };
    await setup(f.config, passwords);
    const a = f.db.get("SELECT password FROM auth_credentials WHERE id='ADMIN'")!.password as string;
    const s = f.db.get("SELECT password FROM auth_credentials WHERE id='SALESPERSON'")!.password as string;
    expect(await passwordCallbacks.verify({ hash: a, password: passwords.ADMIN })).toBe(true);
    expect(await passwordCallbacks.verify({ hash: a, password: passwords.SALESPERSON })).toBe(false);
    expect(await passwordCallbacks.verify({ hash: s, password: passwords.ADMIN })).toBe(false);
  });
  it("rejects invalid, malformed, too-short and oversized inputs without writing", async () => {
    const f = fixture(), valid = fake();
    const invalid: unknown[] = [null, {}, [], { ADMIN: valid }, { ADMIN: valid, SALESPERSON: valid, extra: true },
      ...roles.flatMap(role => [null, 1, "", fake().slice(0, 7), fake().repeat(5), fake() + "\ud800",
        ...[4, 5].map(length => Array.from(randomBytes(length), byte => String(byte % 10)).join(""))]
        .map(value => ({ ADMIN: valid, SALESPERSON: valid, [role]: value })))];
    for (const value of invalid) await rejected(setup(f.config, value as SetupPasswords));
    expect(probe.creates).toBe(0); f.empty();
  });
  it("screens actual eight-to-fourteen-character common values for BOTH roles before any write", async () => {
    const f = fixture();
    for (let length = 8; length <= 14; length++) for (const role of roles) {
      const common = commonSample(length), passwords = { ...credentials(), [role]: common };
      expect([...common].length).toBe(length);
      await rejected(setup(f.config, passwords));
    }
    expect(probe.creates).toBe(0); expect(probe.transactionAdapters).toBe(0); f.empty();
  });
  it("rejects clearly weak eight-character values for BOTH roles without requiring classes", async () => {
    const f = fixture(), weak = remember(String.fromCodePoint(0x4e00 + randomBytes(1)[0]).repeat(8));
    for (const role of roles) await rejected(setup(f.config, { ...credentials(), [role]: weak }));
    expect(probe.creates).toBe(0); f.empty();
  });
  it("accepts longer independent passwords for BOTH roles", async () => {
    const f = fixture(), passwords = { ADMIN: fake(), SALESPERSON: fake() };
    await setup(f.config, passwords);
    for (const role of roles) expect(await passwordCallbacks.verify({
      hash: f.db.get("SELECT password FROM auth_credentials WHERE id=?", [role])!.password as string,
      password: passwords[role],
    })).toBe(true);
    expect(f.db.get("SELECT count(*) AS n FROM auth_provisioning")?.n).toBe(one);
  });
  it("accepts lowercase-only eight-character passwords for BOTH roles without composition rules", async () => {
    const f = fixture();
    const lower = () => {
      for (let attempt = 0; attempt < 16; attempt++) {
        const value = remember(Array.from(randomBytes(8), byte => String.fromCharCode(97 + byte % 26)).join(""));
        try { assertOfflinePassword(value); return value; } catch { /* Retry a randomly listed TEST vector. */ }
      }
      throw new Error("Nonlisted TEST vector unavailable.");
    };
    const passwords = { ADMIN: lower(), SALESPERSON: lower() };
    await setup(f.config, passwords);
    for (const role of roles) expect(await passwordCallbacks.verify({
      hash: f.db.get("SELECT password FROM auth_credentials WHERE id=?", [role])!.password as string,
      password: passwords[role],
    })).toBe(true);
  });
  it("fails closed if the offline corpus is missing or altered", async () => {
    const f = fixture(), passwords = credentials(); probe.detail = fake();
    probe.missingCorpus = true; await rejected(setup(f.config, passwords)); probe.missingCorpus = false; probe.sqlConstraintFailure = false;
    probe.corruptCorpus = true; await rejected(setup(f.config, passwords)); probe.corruptCorpus = false;
    expect(probe.creates).toBe(0); f.empty();
  });
  it("rolls back a failure after the first actual user write and remains safely retryable", async () => {
    const f = fixture(), passwords = credentials(); probe.failAfter = 1; probe.detail = passwords.ADMIN;
    await rejected(setup(f.config, passwords));
    expect(probe.creates).toBe(1); f.empty();
    probe.failAfter = 0;
    await setup(f.config, passwords);
    expect(f.db.get("SELECT count(*) AS n FROM auth_provisioning")?.n).toBe(one);
  });
  it("rolls back an actual SQLite credential CHECK failure after the first user write", async () => {
    const f = fixture(); probe.sqlConstraintFailure = true;
    await rejected(setup(f.config, credentials()));
    expect(probe.creates).toBe(1); f.empty();
  });
  it("rolls back an async failure after an account write and after the complete pending batch", async () => {
    for (const late of [false, true]) {
      const f = fixture(), passwords = credentials(); probe.creates = 0; probe.detail = passwords.SALESPERSON;
      probe.failAfter = late ? 0 : 2; probe.failBeforeCommit = late;
      await rejected(setup(f.config, passwords));
      expect(probe.creates).toBe(late ? 4 : 2); f.empty();
      probe.failAfter = 0; probe.failBeforeCommit = false;
    }
  });
  it("rejects concurrent bootstrap and cannot replace the winning credentials on repetition", async () => {
    const f = fixture(), winner = credentials(), loser = credentials();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const setupModule = await import("../../src/server/auth/provision");
    const first = setupModule.runTrustedFirstRunSetup(f.config, async () => { entered(); await gate; return winner; });
    await ready;
    await rejected(setup(f.config, loser)); release(); await first;
    const hashes = f.db.all("SELECT id,password FROM auth_credentials ORDER BY id");
    let readerCalls = 0;
    await rejected(setupModule.runTrustedFirstRunSetup(f.config, async () => { readerCalls++; return loser; }));
    expect(readerCalls).toBe(0);
    const after = f.db.all("SELECT id,password FROM auth_credentials ORDER BY id");
    expect(hashes.every((row, i) => row.password === after[i].password)).toBe(true);
    expect(await passwordCallbacks.verify({ hash: after[0].password as string, password: winner.ADMIN })).toBe(true);
    expect(await passwordCallbacks.verify({ hash: after[0].password as string, password: loser.ADMIN })).toBe(false);
  });
  it("shares the existing gateway ownership fence in both directions", async () => {
    const f = fixture(), configuration = gatewayConfiguration(f);
    const gateway = await openAuthorizationGateway(configuration); gateways.push(gateway);
    await rejected(setup(f.config, credentials())); await gateway.close();
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const setupModule = await import("../../src/server/auth/provision");
    const attempt = setupModule.runTrustedFirstRunSetup(f.config, async () => { entered(); await gate; throw new Error(fake()); });
    await ready;
    await expect(openAuthorizationGateway(configuration)).rejects.toThrow("Access denied.");
    release(); await rejected(attempt); f.empty();
  });
  it("refuses partial, missing-latch and unknown states before reading any password", async () => {
    const setupModule = await import("../../src/server/auth/provision");
    for (const state of ["partial", "unknown", "missing-latch"] as const) {
      const f = fixture();
      if (state === "unknown") f.db.transaction(tx => {
        tx.run("CREATE TABLE test_existing_note(id INTEGER PRIMARY KEY,note TEXT NOT NULL) STRICT");
        tx.run("INSERT INTO test_existing_note VALUES(?,?)", [one, "TEST retained note"]);
      });
      else if (state === "partial") incomplete(f);
      else {
        await setup(f.config, credentials());
        // Simulate privileged SQL tampering; retained identities still prevent reset.
        f.db.transaction(tx => tx.run("DELETE FROM auth_provisioning"));
        expect(f.db.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(BigInt(2));
      }
      const before = f.db.all("SELECT id,name FROM auth_users");
      let called = false;
      await rejected(setupModule.runTrustedFirstRunSetup(f.config, async () => { called = true; return credentials(); }));
      expect(called).toBe(false); expect(f.db.all("SELECT id,name FROM auth_users")).toEqual(before);
      expect(f.history()).toEqual(f.originalHistory);
      if (state === "unknown") expect(f.db.get("SELECT note FROM test_existing_note WHERE id=?", [one])?.note).toBe("TEST retained note");
    }
  });
  it("rejects changed history, unapplied or newer migration sets and invalid database paths", async () => {
    for (const state of ["history", "unapplied", "newer", "path"] as const) {
      const f = fixture();
      if (state === "history") f.db.transaction(tx => tx.run("UPDATE schema_migrations SET checksum=? WHERE version=?", ["0".repeat(64), one]));
      if (state === "unapplied") writeFileSync(path.join(f.config.migrationsDirectory, "0009_test_unapplied.sql"), "CREATE TABLE test_unapplied(v INTEGER) STRICT;");
      if (state === "newer") f.db.transaction(tx => tx.setSchemaVersion(BigInt(8)));
      const config = state === "path" ? { ...f.config, database: { ...f.config.database, directory: path.join(f.config.database.directory, "..", "missing-test") } } : f.config;
      await rejected(setup(config, credentials()));
      for (const table of authTables) expect(f.db.get("SELECT count(*) AS n FROM " + table)?.n).toBe(zero);
    }
  });
  it("denies SQL schema corruption and sanitizes failed trusted input acquisition", async () => {
    const f = fixture(), setupModule = await import("../../src/server/auth/provision"); probe.detail = fake();
    await rejected(setupModule.runTrustedFirstRunSetup(f.config, async () => { throw new Error(probe.detail); })); f.empty();
    f.db.close();
    // Separate disposable fixture: exact-schema preflight detects this legitimate
    // SQL mutation even though migration history still claims the original bytes.
    const broken = fixture();
    broken.db.transaction(tx => tx.run("CREATE INDEX test_unreviewed ON auth_users(name)"));
    let called = false;
    await rejected(setupModule.runTrustedFirstRunSetup(broken.config, async () => { called = true; return credentials(); }));
    expect(called).toBe(false);
  });
  it("reopens with the latch intact, rejects overwrite, and verifies through the actual private framework", async () => {
    const f = fixture(), passwords = credentials(); await setup(f.config, passwords);
    f.db.close();
    const reopened = openDatabase(f.config.database); dbs.push(reopened);
    expect(reopened.get("SELECT count(*) AS n FROM auth_provisioning")?.n).toBe(one);
    await rejected(setup(f.config, credentials()));
    const start = probe.contexts.length;
    const gateway = await openAuthorizationGateway(gatewayConfiguration(f)); gateways.push(gateway);
    const contexts = await Promise.all(probe.contexts.slice(start, start + 2).map(instance => instance.$context));
    expect(contexts.length).toBe(2);
    for (const [index, role] of roles.entries()) {
      const context = contexts[index];
      expect(context.password.hash === passwordCallbacks.hash).toBe(true);
      expect(context.password.verify === passwordCallbacks.verify).toBe(true);
      expect(context.password.config.minPasswordLength).toBe(8);
      expect(context.password.config.maxPasswordLength).toBe(256);
      expect(context.options.emailAndPassword?.enabled).toBe(false);
      expect(context.options.emailAndPassword?.disableSignUp).toBe(true);
      type CheckContext = Parameters<typeof context.password.checkPassword>[1];
      const check = (password: string) => context.password.checkPassword(role, { context, body: { password } } as CheckContext);
      expect(await check(passwords[role])).toBe(true);
      await expect(check(passwords[roles[1 - index]])).rejects.toThrow();
    }
    await expect(gateway.authorizeAdmin(new Request("https://admin.provision-proof.invalid/protected"))).rejects.toThrow("Access denied.");
    expect(reopened.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n).toBe(zero);
  });
  it("has no credentials, keys, raw framework endpoints, session issuance or console logging in its output", async () => {
    const f = fixture(), passwords = credentials();
    const logs = ["log", "warn", "error", "info", "debug"].map(method => vi.spyOn(console, method as "log").mockImplementation(() => { throw new Error("Unexpected TEST output."); }));
    try {
      const result = await setup(f.config, passwords);
      expect(result).toBeUndefined(); expect(logs.every(log => log.mock.calls.length === 0)).toBe(true);
    } finally { for (const log of logs) log.mockRestore(); }
    const source = readFileSync(path.resolve("src/server/auth/provision.ts"), "utf8");
    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(/testUtils|\.api\.|\.handler\b|createSession\(|console\.|process\.env/.test(source)).toBe(false);
    expect(f.db.all("SELECT name FROM sqlite_schema WHERE name IN ('session','verification')").length).toBe(0);
    expect(f.db.get("SELECT count(*) AS n FROM auth_credentials WHERE accessToken IS NOT NULL OR refreshToken IS NOT NULL OR idToken IS NOT NULL")?.n).toBe(zero);
  });
});
