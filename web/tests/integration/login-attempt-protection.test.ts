import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { runWithTransaction } from "@better-auth/core/context";
import type { BetterAuthOptions } from "@better-auth/core";
import { createVolatileStorage } from "../../src/server/auth/storage";
import { openAsyncOwner } from "../../src/server/auth/database";
import { createLoginAttemptProtection, loginAttemptPolicy } from "../../src/server/auth/login-attempts";
import { passwordCallbacks } from "../../src/server/auth/password";
import { openDatabase, type SqliteConnection } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { INT64_MAX } from "../../src/server/db/integers";
import type { Role } from "../../src/server/auth/types";

const clock = vi.hoisted(() => ({ wall: 1762800000000, monotonic: 1000 }));
// Only this module's clock binding is controlled; real SQLite/Kysely/core execute.
vi.mock("node:perf_hooks", async importOriginal => ({
  ...await importOriginal<typeof import("node:perf_hooks")>(),
  performance: { now: () => clock.monotonic },
}));
const root = path.resolve("test-results/sqlite-b1b-part1");
mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "attempts3h-"));
const owners: ReturnType<typeof openAsyncOwner>[] = [], readers: SqliteConnection[] = [];
const audits: (() => void)[] = [], secrets = new Set<string>();
const fake = () => { const value = randomBytes(24).toString("base64url"); secrets.add(value); return value; };
const zero = BigInt(0), one = BigInt(1);
const buckets = ["ADMIN", "GLOBAL", "SALESPERSON"] as const;
const advance = (milliseconds: number) => { clock.monotonic += milliseconds; clock.wall += milliseconds; };
const secretIn = (text: string) => [...secrets].some(secret => text.includes(secret));
async function rejected(work: Promise<unknown>) {
  let caught: unknown;
  try { await work; } catch (error) { caught = error; }
  expect(caught instanceof Error).toBe(true);
  const error = caught as Error;
  expect(error.message === "Authentication failed.").toBe(true);
  expect(Object.hasOwn(error, "cause")).toBe(false);
  expect(secretIn(JSON.stringify({ message: error.message, stack: error.stack }))).toBe(false);
}
function adapterFor(owner: ReturnType<typeof openAsyncOwner>) {
  const options: BetterAuthOptions = {
    database: { db: owner.db, type: "sqlite", transaction: true }, secondaryStorage: createVolatileStorage().storage,
    user: { modelName: "auth_users", additionalFields: { role: { type: "string", required: true, input: false } } },
    account: { modelName: "auth_credentials" },
    session: { storeSessionInDatabase: false, preserveSessionInDatabase: false, cookieCache: { enabled: false } },
    emailAndPassword: { enabled: false, disableSignUp: true }, telemetry: { enabled: false }, logger: { disabled: true },
  };
  return kyselyAdapter(owner.db, { type: "sqlite", transaction: true })(options);
}
function fixture(seed = true) {
  const directory = mkdtempSync(path.join(run, "db-")), migrationsDirectory = mkdtempSync(path.join(run, "migrations-"));
  const source = path.resolve("src/server/db/migrations");
  for (const name of readdirSync(source).filter(name => name.endsWith(".sql"))) copyFileSync(path.join(source, name), path.join(migrationsDirectory, name));
  const database = { directory, filename: "test.sqlite3", create: true, mode: "test" as const, busyTimeoutMs: 75 };
  const reader = openDatabase(database); readers.push(reader); applyMigrations(reader, migrationsDirectory);
  if (seed) reader.transaction(tx => { for (const bucket of buckets) tx.run("INSERT INTO auth_login_attempts(bucket) VALUES(?)", [bucket]); });
  const config = { database: { ...database, create: false }, migrationsDirectory };
  const owner = openAsyncOwner(config); owners.push(owner);
  const adapter = adapterFor(owner);
  const f = {
    reader, owner, config, calls: [] as Role[], beforeCommit: false,
    behavior: (async () => false) as (role: Role, password: unknown) => Promise<unknown>,
    state: (bucket: string) => reader.get("SELECT * FROM auth_login_attempts WHERE bucket=?", [bucket])!,
    snapshot: () => reader.all("SELECT * FROM auth_login_attempts ORDER BY bucket"),
    withOwnerTransaction: async <T>(work: () => Promise<T>): Promise<T> => await runWithTransaction(adapter, async () => {
      const result = await work();
      if (f.beforeCommit) throw new Error("TEST precommit fault");
      return result;
    }),
  };
  const dependencies = { owner, withOwnerTransaction: f.withOwnerTransaction,
    verifyCredential: async (role: Role, password: unknown) => {
      f.calls.push(role); return await f.behavior(role, password) as boolean;
    },
  };
  const api = createLoginAttemptProtection(dependencies);
  audits.push(() => {
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = path.join(directory, database.filename) + suffix;
      if (suffix && !existsSync(file)) continue;
      expect(secretIn(readFileSync(file).toString("latin1"))).toBe(false);
    }
  });
  return { ...f, api, dependencies, shared: f };
}
const count = (state: ReturnType<ReturnType<typeof fixture>["state"]>) =>
  Object.entries(state).filter(([name, value]) => name.startsWith("failed_") && typeof value === "bigint" && value > zero).length;
const attempt = (f: ReturnType<typeof fixture>, role: Role, password: unknown = fake()) =>
  role === "ADMIN" ? f.api.verifyAdminPassword(password) : f.api.verifySalespersonPassword(password);
beforeEach(() => {
  clock.wall = 1762800000000; clock.monotonic = 1000;
  vi.spyOn(Date, "now").mockImplementation(() => clock.wall);
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const owner of owners.splice(0)) await owner.close();
  for (const reader of readers.splice(0)) reader.close();
  for (const audit of audits.splice(0)) audit();
});

describe("Part3H private persistent attempt protection", () => {
  it("uses additive STRICT state capped at three buckets without accounts or import-time initialization", async () => {
    const f = fixture(false);
    await import("../../src/server/auth/login-attempts");
    expect(f.reader.get("SELECT strict FROM pragma_table_list WHERE name='auth_login_attempts'")?.strict).toBe(one);
    expect(f.reader.get("SELECT count(*) AS n FROM auth_login_attempts")?.n).toBe(zero);
    expect(f.reader.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(zero);
    await rejected(attempt(f, "ADMIN")); expect(f.shared.calls.length).toBe(0);
    expect(() => f.reader.transaction(tx => tx.run("INSERT INTO auth_login_attempts(bucket) VALUES(?)", ["other"]))).toThrow();
  });
  it("applies exactly 30 seconds after five consecutive failures to BOTH roles", async () => {
    expect(loginAttemptPolicy.roleFailures).toBe(5);
    expect(loginAttemptPolicy.cooldownMs).toBe(30_000);
    for (const role of ["ADMIN", "SALESPERSON"] as const) {
      const f = fixture();
      for (let i = 0; i < 5; i++) await rejected(attempt(f, role));
      expect(count(f.state(role))).toBe(5);
      expect(f.state(role).cooldown_until_ms).toBe(BigInt(clock.wall + 30_000));
      f.shared.behavior = async () => true;
      await rejected(attempt(f, role));
      expect(f.shared.calls.length).toBe(5);
      advance(29_999); await rejected(attempt(f, role));
      expect(f.shared.calls.length).toBe(5);
      advance(1); expect(await attempt(f, role)).toBeUndefined();
      expect(count(f.state(role))).toBe(0);
      expect(f.shared.calls.length).toBe(6);
    }
  });
  it("keeps role failures independent and does not erase them through a successful other-role attempt", async () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) await rejected(attempt(f, "SALESPERSON"));
    f.shared.behavior = async () => true;
    expect(await attempt(f, "ADMIN")).toBeUndefined();
    expect(count(f.state("ADMIN"))).toBe(0);
    expect(count(f.state("GLOBAL"))).toBe(0);
    await rejected(attempt(f, "SALESPERSON")); expect(f.shared.calls.length).toBe(6);
  });
  it("does not activate the unapproved GLOBAL lockout or deny one role for the other role failures", async () => {
    const f = fixture();
    for (let i = 0; i < 10; i++) { await rejected(attempt(f, i % 2 ? "SALESPERSON" : "ADMIN")); advance(1000); }
    expect(count(f.state("GLOBAL"))).toBe(0);
    expect(f.state("GLOBAL").cooldown_until_ms).toBe(zero);
    const roleExpiry = f.state("ADMIN").cooldown_until_ms as bigint;
    advance(Number(roleExpiry - BigInt(clock.wall)));
    f.shared.behavior = async () => true;
    expect(await attempt(f, "ADMIN")).toBeUndefined();
    await rejected(attempt(f, "SALESPERSON")); // Its own cooldown still has 1000ms left.
    expect(f.shared.calls.length).toBe(11);
    expect(count(f.state("GLOBAL"))).toBe(0);
  });
  it("counts consecutive role failures without an observation-window reset", async () => {
    const f = fixture();
    for (let i = 0; i < 4; i++) await rejected(attempt(f, "ADMIN"));
    advance(15 * 60 * 1000); await rejected(attempt(f, "ADMIN"));
    expect(count(f.state("ADMIN"))).toBe(5);
    expect(count(f.state("GLOBAL"))).toBe(0);
    expect(f.state("ADMIN").cooldown_until_ms).toBe(BigInt(clock.wall + 30_000));
    f.shared.behavior = async () => true; await rejected(attempt(f, "ADMIN"));
    expect(f.shared.calls.length).toBe(5);
  });
  it("clears only the successful role streak, including a correct fifth attempt", async () => {
    for (const role of ["ADMIN", "SALESPERSON"] as const) {
      const f = fixture();
      for (let i = 0; i < 4; i++) await rejected(attempt(f, role));
      f.shared.behavior = async () => true;
      expect(await attempt(f, role)).toBeUndefined();
      expect(count(f.state(role))).toBe(0); expect(count(f.state("GLOBAL"))).toBe(0);
      f.shared.behavior = async () => false;
      for (let i = 0; i < 4; i++) await rejected(attempt(f, role));
      expect(count(f.state(role))).toBe(4); expect(f.state(role).cooldown_until_ms).toBe(zero);
      await rejected(attempt(f, role));
      expect(count(f.state(role))).toBe(5);
      expect(f.state(role).cooldown_until_ms).toBe(BigInt(clock.wall + 30_000));
    }
  });
  it("allows new attempts every 30-second cooldown without escalation or permanent lockout", async () => {
    for (const role of ["ADMIN", "SALESPERSON"] as const) {
      const f = fixture();
      for (let cycle = 0; cycle < 3; cycle++) {
        for (let i = 0; i < 5; i++) await rejected(attempt(f, role));
        expect(count(f.state(role))).toBe(5);
        const until = BigInt(clock.wall + 30_000);
        expect(f.state(role).cooldown_until_ms).toBe(until);
        advance(29_999); await rejected(attempt(f, role));
        expect(f.shared.calls.length).toBe((cycle + 1) * 5);
        expect(f.state(role).cooldown_until_ms).toBe(until);
        advance(1);
      }
      f.shared.behavior = async () => true;
      expect(await attempt(f, role)).toBeUndefined();
      expect(count(f.state(role))).toBe(0);
      expect(f.reader.get("SELECT count(*) AS n FROM auth_login_attempts")?.n).toBe(BigInt(3));
    }
  });
  it("does not extend cooldown or run credential work for repeated blocked requests", async () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) await rejected(attempt(f, "ADMIN"));
    const until = f.state("ADMIN").cooldown_until_ms;
    for (let i = 0; i < 3; i++) { advance(1000); await rejected(attempt(f, "ADMIN")); }
    expect(f.state("ADMIN").cooldown_until_ms).toBe(until); expect(f.shared.calls.length).toBe(5);
  });
  it("preserves partial failures through close/reopen instead of resetting them", async () => {
    const f = fixture();
    for (let i = 0; i < 3; i++) await rejected(attempt(f, "ADMIN"));
    await f.owner.close();
    clock.wall -= 86400000; clock.monotonic = 0; // Fresh process clock epoch plus wall rollback.
    const owner = openAsyncOwner(f.config); owners.push(owner);
    const adapter = adapterFor(owner);
    let calls = 0;
    const api = createLoginAttemptProtection({ owner, withOwnerTransaction: async work => await runWithTransaction(adapter, work),
      verifyCredential: async () => { calls++; return false; } });
    await rejected(api.verifyAdminPassword(fake())); await rejected(api.verifyAdminPassword(fake()));
    await rejected(api.verifyAdminPassword(fake()));
    expect(calls).toBe(2); expect(count(f.state("ADMIN"))).toBe(5);
  });
  it("preserves the remaining 20 seconds for BOTH roles in a fresh Node process", async () => {
    for (const role of ["ADMIN", "SALESPERSON"] as const) {
      const f = fixture();
      for (let i = 0; i < 5; i++) await rejected(attempt(f, role));
      expect(count(f.state(role))).toBe(5);
      expect(f.shared.calls.length).toBe(5);
      advance(10_000); await f.owner.close();
      const output = execFileSync(process.execPath, ["--experimental-transform-types", "--disable-warning=ExperimentalWarning",
        path.resolve("tests/helpers/login-attempt-restart.mjs"), f.config.database.directory, f.config.migrationsDirectory, String(clock.wall), role],
      { encoding: "utf8", env: { ...process.env, NODE_ENV: "test" }, timeout: 20000, stdio: ["ignore", "pipe", "pipe"] });
      expect(JSON.parse(output)).toEqual({ remainingMs: 20_000, blocked: true, blockedAt29999: true,
        verifierCallsBeforeExpiry: 0, allowedAfterExpiry: true, verifierCallsAfterExpiry: 1 });
      expect(secretIn(output)).toBe(false);
    }
  });
  it("handles wall rollback conservatively while monotonic uptime still lets cooldown finish", async () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) await rejected(attempt(f, "ADMIN"));
    clock.wall -= 86400000;
    f.shared.behavior = async () => true; await rejected(attempt(f, "ADMIN"));
    clock.monotonic += loginAttemptPolicy.cooldownMs;
    expect(await attempt(f, "ADMIN")).toBeUndefined();
    expect(count(f.state("ADMIN"))).toBe(0);
  });
  it("ignores forward wall jumps during uptime and rejects unsafe or reversed clocks", async () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) await rejected(attempt(f, "ADMIN"));
    clock.wall += 86400000; f.shared.behavior = async () => true;
    await rejected(attempt(f, "ADMIN")); expect(f.shared.calls.length).toBe(5);
    const saved = f.snapshot(), wall = clock.wall;
    for (const value of [NaN, Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      clock.wall = value; await rejected(attempt(f, "ADMIN")); expect(f.snapshot()).toEqual(saved);
    }
    clock.wall = wall; clock.monotonic = 999; await rejected(attempt(f, "ADMIN"));
    expect(f.shared.calls.length).toBe(5);
  });
  it("fails closed on missing, sparse or inconsistent state without recreating it", async () => {
    for (const mutation of [
      "DELETE FROM auth_login_attempts WHERE bucket='GLOBAL'",
      "UPDATE auth_login_attempts SET failed_2_ms=1 WHERE bucket='ADMIN'",
      "UPDATE auth_login_attempts SET revision=1 WHERE bucket='ADMIN'",
    ]) {
      const f = fixture(); f.reader.transaction(tx => tx.run(mutation));
      const saved = f.snapshot(); await rejected(attempt(f, "ADMIN"));
      expect(f.snapshot()).toEqual(saved); expect(f.shared.calls.length).toBe(0);
    }
  });
  it("rejects int64 revision overflow without partial state or verifier work", async () => {
    const f = fixture();
    f.reader.transaction(tx => tx.run("UPDATE auth_login_attempts SET revision=?,last_seen_ms=?", [INT64_MAX, BigInt(clock.wall)]));
    const saved = f.snapshot(); await rejected(attempt(f, "ADMIN"));
    expect(f.snapshot()).toEqual(saved); expect(f.shared.calls.length).toBe(0);
  });
  it("denies SQL unavailability before credential verification", async () => {
    const f = fixture(), saved = f.snapshot(), detail = fake();
    vi.spyOn(f.owner, "all").mockImplementation(() => { throw new Error(detail); });
    await rejected(attempt(f, "ADMIN")); expect(f.shared.calls.length).toBe(0);
    expect(f.reader.all("SELECT * FROM auth_login_attempts ORDER BY bucket")).toEqual(saved);
  });
  it("rolls back a partial multi-bucket SQL update and permits a safe retry", async () => {
    const f = fixture(), saved = f.snapshot(), native = f.owner.run;
    let writes = 0;
    const spy = vi.spyOn(f.owner, "run").mockImplementation((sql, values) => {
      if (sql.startsWith("UPDATE auth_login_attempts SET revision=") && ++writes === 2) throw new Error(fake());
      return native(sql, values);
    });
    await rejected(attempt(f, "ADMIN")); expect(f.snapshot()).toEqual(saved); expect(f.shared.calls.length).toBe(0);
    spy.mockRestore(); await rejected(attempt(f, "ADMIN"));
    expect(count(f.state("ADMIN"))).toBe(1);
  });
  it("does not publish success if finalization SQL fails; the durable charge remains", async () => {
    const f = fixture(), native = f.owner.run; f.shared.behavior = async () => true;
    let writes = 0;
    vi.spyOn(f.owner, "run").mockImplementation((sql, values) => {
      if (sql.startsWith("UPDATE auth_login_attempts SET revision=") && ++writes === 5) throw new Error(fake());
      return native(sql, values);
    });
    await rejected(attempt(f, "ADMIN"));
    expect(count(f.state("ADMIN"))).toBe(1); expect(count(f.state("GLOBAL"))).toBe(0);
    expect(f.shared.calls.length).toBe(1);
  });
  it("does not invoke the verifier if the reservation transaction fails before COMMIT", async () => {
    const f = fixture(), saved = f.snapshot(); f.shared.beforeCommit = true;
    await rejected(attempt(f, "ADMIN"));
    expect(f.snapshot()).toEqual(saved); expect(f.shared.calls.length).toBe(0);
  });
  it("charges verifier exceptions and rejects truthy non-booleans with generic errors", async () => {
    const f = fixture();
    f.shared.behavior = async () => { throw new Error(fake()); }; await rejected(attempt(f, "ADMIN"));
    for (const value of ["true", {}, 1]) { f.shared.behavior = async () => value; await rejected(attempt(f, "ADMIN")); }
    expect(count(f.state("ADMIN"))).toBe(4);
  });
  it("rejects nesting inside an existing owner transaction without closing or changing it", async () => {
    const f = fixture(), saved = f.snapshot();
    await f.withOwnerTransaction(async () => {
      expect(f.owner.inTransaction()).toBe(true);
      await rejected(attempt(f, "ADMIN"));
      expect(f.owner.inTransaction()).toBe(true);
    });
    expect(f.snapshot()).toEqual(saved); expect(f.shared.calls.length).toBe(0);
    await rejected(attempt(f, "ADMIN"));
    expect(count(f.state("ADMIN"))).toBe(1);
  });
  it("rejects simultaneous attempts across BOTH roles without a KDF queue or shared transaction", async () => {
    const f = fixture();
    let release!: (value: boolean) => void, entered!: () => void;
    const gate = new Promise<boolean>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { entered = resolve; });
    f.shared.behavior = async () => { entered(); return gate; };
    const first = rejected(attempt(f, "ADMIN")); await ready;
    expect(f.owner.inTransaction()).toBe(false);
    await Promise.all(Array.from({ length: 20 }, (_, i) => rejected(attempt(f, i % 2 ? "ADMIN" : "SALESPERSON"))));
    expect(f.shared.calls.length).toBe(1); expect(count(f.state("GLOBAL"))).toBe(0);
    release(false); await first;
    expect(count(f.state("ADMIN"))).toBe(1);
  });
  it("keeps a durable in-flight charge and rejects stale successful completion", async () => {
    const f = fixture();
    let release!: (value: boolean) => void, entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    f.shared.behavior = async () => { entered(); return new Promise<boolean>(resolve => { release = resolve; }); };
    const first = rejected(attempt(f, "ADMIN")); await ready;
    f.reader.transaction(tx => tx.run("UPDATE auth_login_attempts SET revision=revision+1"));
    release(true); await first;
    expect(count(f.state("ADMIN"))).toBe(1); expect(count(f.state("GLOBAL"))).toBe(0);
  });
  it("uses the existing native scrypt verifier for disposable correct/wrong credentials without storing them", async () => {
    const f = fixture(), password = fake(), wrong = fake(), encoded = await passwordCallbacks.hash(password);
    f.shared.behavior = async (_role, value) => passwordCallbacks.verify({ hash: encoded, password: value as string });
    await rejected(attempt(f, "ADMIN", wrong));
    expect(await attempt(f, "ADMIN", password)).toBeUndefined();
    expect(count(f.state("ADMIN"))).toBe(0); expect(count(f.state("GLOBAL"))).toBe(0);
    expect(f.reader.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(zero);
    expect(f.reader.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n).toBe(zero);
  });
  it("rejects legacy unapproved 15-minute cooldown state without silently rewriting it", async () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) await rejected(attempt(f, "ADMIN"));
    f.reader.transaction(tx => tx.run("UPDATE auth_login_attempts SET cooldown_until_ms=failed_5_ms+900000 WHERE bucket=?", ["ADMIN"]));
    const saved = f.snapshot();
    f.shared.behavior = async () => true;
    await rejected(attempt(f, "ADMIN"));
    expect(f.snapshot()).toEqual(saved); expect(f.shared.calls.length).toBe(5);
  });
  it("exposes no raw admission/reset/verifier or sensitive response/log and rejects duplicate mounting", async () => {
    const f = fixture(), logs = (["log", "warn", "error", "info", "debug"] as const).map(name => vi.spyOn(console, name).mockImplementation(() => {}));
    try {
      expect(Object.keys(f.api).sort()).toEqual(["verifyAdminPassword", "verifySalespersonPassword"]);
      expect(() => createLoginAttemptProtection(f.dependencies)).toThrow("Authentication failed.");
      f.shared.behavior = async () => true;
      const result = await attempt(f, "SALESPERSON");
      expect(JSON.stringify({ result })).toBe("{}");
      expect(logs.every(log => log.mock.calls.length === 0)).toBe(true);
      expect(f.reader.get("SELECT count(*) AS n FROM auth_credentials")?.n).toBe(zero);
    } finally { for (const log of logs) log.mockRestore(); }
  });
});
