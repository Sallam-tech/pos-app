import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentAdapter, runWithTransaction } from "@better-auth/core/context";
import type { betterAuth } from "better-auth";
import { openDatabase, type SqliteConnection } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { openAuthorizationGateway } from "../../src/server/auth/gateway";
import { passwordCallbacks } from "../../src/server/auth/password";
import { AuthorizationDenied, type AuthorizationConfiguration, type AuthorizationGateway, type Role, type VerifiedCredential } from "../../src/server/auth/types";

type Auth = ReturnType<typeof betterAuth>;
type Owner = ReturnType<typeof import("../../src/server/auth/database").openAsyncOwner>;
const observed = vi.hoisted(() => ({ auth: [] as Auth[], owners: [] as Owner[] }));
const probe = vi.hoisted(() => ({ calls: 0, onNative: undefined as (() => void) | undefined,
  defer: undefined as ((done: () => void) => void) | undefined, release: undefined as (() => void) | undefined }));
const clock = vi.hoisted(() => ({ wall: 1762800000000, monotonic: 1000 }));
// Real pinned framework, official adapter and native scrypt. TEST instrumentation
// captures private objects and can hold completion of REAL native work for races.
vi.mock("better-auth", async original => {
  const originalModule = await original<typeof import("better-auth")>();
  return { ...originalModule, betterAuth: (options: Parameters<typeof betterAuth>[0]) => {
    const auth = originalModule.betterAuth(options); observed.auth.push(auth); return auth;
  } };
});
vi.mock("../../src/server/auth/database", async original => {
  const originalModule = await original<typeof import("../../src/server/auth/database")>();
  return { ...originalModule, openAsyncOwner: (config: Parameters<typeof originalModule.openAsyncOwner>[0]) => {
    const owner = originalModule.openAsyncOwner(config); observed.owners.push(owner); return owner;
  } };
});
vi.mock("node:perf_hooks", async original => ({
  ...await original<typeof import("node:perf_hooks")>(), performance: { now: () => clock.monotonic },
}));
vi.mock("node:crypto", async original => {
  const originalModule = await original<typeof import("node:crypto")>();
  return { ...originalModule, scrypt: (...args: unknown[]) => {
    probe.calls++; probe.onNative?.();
    const callback = args.pop() as (error: Error | null, key: Buffer) => void;
    (originalModule.scrypt as (...args: unknown[]) => void)(...args, (error: Error | null, key: Buffer) => {
      const done = () => callback(error, key);
      if (probe.defer) probe.defer(done); else done();
    });
  } };
});
const roles = ["ADMIN", "SALESPERSON"] as const, one = BigInt(1), zero = BigInt(0);
const root = path.resolve("test-results/sqlite-b1b-part1"); mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "credentials3i-"));
const plaintext = new Set<string>(), sensitive = new Set<string>();
const remember = (value: string) => { plaintext.add(value); sensitive.add(value); return value; };
const fake = (bytes = 6) => remember(randomBytes(bytes).toString("base64url"));
const passwords = {} as Record<Role, string>, hashes = {} as Record<Role, string>;
let replacementHash: string;
const gateways: AuthorizationGateway[] = [], readers: SqliteConnection[] = [], audits: (() => void)[] = [];
const contains = (text: string, values = sensitive) => [...values].some(value => text.includes(value));
const advance = (ms: number) => { clock.wall += ms; clock.monotonic += ms; };
const verify = (gateway: AuthorizationGateway, role: Role, password: unknown) =>
  role === "ADMIN" ? gateway.verifyAdminPassword(password) : gateway.verifySalespersonPassword(password);
async function denied(work: Promise<unknown>) {
  let caught: unknown; try { await work; } catch (error) { caught = error; }
  expect(caught instanceof AuthorizationDenied).toBe(true);
  const error = caught as Error;
  expect(error.message).toBe("Access denied."); expect(Object.hasOwn(error, "cause")).toBe(false);
  expect(contains(JSON.stringify({ message: error.message, stack: error.stack }))).toBe(false);
}
function holdNative() {
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  probe.defer = done => { probe.release = done; entered(); };
  const release = () => { const done = probe.release; probe.defer = undefined; probe.release = undefined; done?.(); };
  return { ready, release };
}
async function fixture(seed = true) {
  const directory = mkdtempSync(path.join(run, "db-")), migrationsDirectory = mkdtempSync(path.join(run, "migrations-"));
  const source = path.resolve("src/server/db/migrations");
  for (const name of readdirSync(source).filter(name => name.endsWith(".sql"))) copyFileSync(path.join(source, name), path.join(migrationsDirectory, name));
  const options = { directory, filename: "test.sqlite3", mode: "test" as const, create: true, busyTimeoutMs: 75 };
  const reader = openDatabase(options); readers.push(reader); applyMigrations(reader, migrationsDirectory);
  const keys = { ADMIN: fake(48), SALESPERSON: fake(48) };
  const config: AuthorizationConfiguration = { database: { ...options, create: false }, migrationsDirectory,
    origins: { ADMIN: "https://admin.credentials.invalid", SALESPERSON: "https://staff.credentials.invalid" },
    signingSecrets: keys, sessionLifetimeSeconds: 120 };
  const start = observed.auth.length, ownerStart = observed.owners.length;
  const gateway = await openAuthorizationGateway(config); gateways.push(gateway);
  const contexts = { ADMIN: await observed.auth[start].$context, SALESPERSON: await observed.auth[start + 1].$context };
  expect(observed.owners.length - ownerStart).toBe(1);
  const owner = observed.owners[ownerStart];
  if (seed) await runWithTransaction(contexts.ADMIN.adapter, async () => {
    const adapter = await getCurrentAdapter(contexts.ADMIN.adapter);
    if (adapter === contexts.ADMIN.adapter || !owner.inTransaction()) throw new Error("TEST transaction adapter required.");
    for (const role of roles) {
      const now = new Date(clock.wall);
      await adapter.create({ model: "user", forceAllowId: true, data: { id: role, role, name: "TEST " + role,
        email: role.toLowerCase() + "@shop-pos.invalid", emailVerified: false, createdAt: now, updatedAt: now } });
      await adapter.create({ model: "account", forceAllowId: true, data: { id: role, userId: role, accountId: role,
        providerId: "credential", password: hashes[role], createdAt: now, updatedAt: now } });
      owner.run("INSERT INTO auth_principals VALUES(?,?,?,?,?)", [role, one, one, one, BigInt(clock.wall)]);
    }
    owner.run("INSERT INTO auth_provisioning VALUES(?,?,?,?,?)", [one, one, "ADMIN", "SALESPERSON", BigInt(clock.wall)]);
    for (const bucket of ["ADMIN", "GLOBAL", "SALESPERSON"]) owner.run("INSERT INTO auth_login_attempts(bucket) VALUES(?)", [bucket]);
  });
  const state = (role: string) => reader.get("SELECT * FROM auth_login_attempts WHERE bucket=?", [role])!;
  const count = (role: string) => Object.entries(state(role)).filter(([key, value]) =>
    key.startsWith("failed_") && typeof value === "bigint" && value > zero).length;
  const persistent = () => Object.fromEntries(["auth_users", "auth_credentials", "auth_principals", "auth_provisioning", "schema_migrations"]
    .map(table => [table, reader.all("SELECT * FROM " + table)]));
  audits.push(() => {
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = path.join(directory, options.filename) + suffix;
      if (suffix && !existsSync(file)) continue;
      expect(contains(readFileSync(file).toString("latin1"), plaintext)).toBe(false);
    }
  });
  return { gateway, reader, owner, config, contexts, state, count, persistent };
}
beforeAll(async () => {
  for (const role of roles) { passwords[role] = fake(); hashes[role] = await passwordCallbacks.hash(passwords[role]); sensitive.add(hashes[role]); }
  replacementHash = await passwordCallbacks.hash(fake()); sensitive.add(replacementHash);
});
beforeEach(() => {
  clock.wall = 1762800000000; clock.monotonic = 1000;
  probe.calls = 0; probe.onNative = undefined;
  vi.spyOn(Date, "now").mockImplementation(() => clock.wall);
});
afterEach(async () => {
  const release = probe.release; probe.defer = undefined; probe.release = undefined; release?.();
  vi.useRealTimers(); vi.restoreAllMocks();
  for (const gateway of gateways.splice(0)) await gateway.close();
  for (const reader of readers.splice(0)) reader.close();
  for (const audit of audits.splice(0)) audit();
});
describe("Part3I real private credential verification", () => {
  it("uses both pinned contexts and their exact native callbacks on one SQLite owner", async () => {
    const f = await fixture(), before = f.persistent();
    for (const role of roles) {
      expect(f.contexts[role].password.verify === passwordCallbacks.verify).toBe(true);
      expect(f.contexts[role].password.hash === passwordCallbacks.hash).toBe(true);
      expect(f.contexts[role].options.emailAndPassword?.enabled).toBe(false);
      expect(f.contexts[role].options.emailAndPassword?.disableSignUp).toBe(true);
      expect((f.contexts[role].options.database as { db: unknown }).db === f.owner.db).toBe(true);
      const result = await verify(f.gateway, role, passwords[role]);
      expect(result.signal.aborted).toBe(false); expect(Object.isFrozen(result)).toBe(true);
      expect(JSON.stringify(result)).toBe('{"signal":{}}');
    }
    expect(probe.calls).toBe(2); expect(JSON.stringify(f.persistent(), (_key, value) => typeof value === "bigint" ? String(value) : value) ===
      JSON.stringify(before, (_key, value) => typeof value === "bigint" ? String(value) : value)).toBe(true);
    expect(f.reader.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n).toBe(zero);
    expect(Object.keys(f.gateway).sort()).toEqual(["publicShopName", "withFreshAdminTransaction", "authorizeAdmin", "authorizeSalesperson", "close",
      "verifyAdminPassword", "verifySalespersonPassword", "issueAdminSession", "issueSalespersonSession", "logoutAdmin", "logoutSalesperson", "rotateAdminPassword", "rotateSalespersonPassword", "withAdminTransaction", "withSalespersonTransaction"].sort());
  });
  it("binds each fixed role to its own credential and rejects caller envelopes", async () => {
    const f = await fixture();
    for (const role of roles) {
      const other = role === "ADMIN" ? "SALESPERSON" : "ADMIN";
      await denied(verify(f.gateway, role, passwords[other]));
      await denied(verify(f.gateway, role, { role: other, hash: hashes[other], password: passwords[other], verifier: () => true }));
      expect(f.count(role)).toBe(2);
      expect((await verify(f.gateway, role, passwords[role])).signal.aborted).toBe(false);
      expect(f.count(role)).toBe(0);
    }
    expect(probe.calls).toBe(4);
  });
  it("durably charges before REAL native work and holds no SQL transaction during scrypt", async () => {
    const f = await fixture(), hold = holdNative();
    const observations: { count: number; transaction: boolean }[] = [];
    probe.onNative = () => observations.push({ count: f.count("ADMIN"), transaction: f.owner.inTransaction() });
    const pending = f.gateway.verifyAdminPassword(passwords.ADMIN); await hold.ready;
    expect(observations).toEqual([{ count: 1, transaction: false }]);
    expect(f.count("ADMIN")).toBe(1); hold.release();
    expect((await pending).signal.aborted).toBe(false); expect(f.count("ADMIN")).toBe(0);
  });
  it("enforces five consecutive wrong attempts and exactly 30 seconds for BOTH roles", async () => {
    for (const role of roles) {
      const f = await fixture(), wrong = fake();
      for (let i = 0; i < 5; i++) await denied(verify(f.gateway, role, wrong));
      expect(f.count(role)).toBe(5);
      expect(f.state(role).cooldown_until_ms).toBe(BigInt(clock.wall + 30_000));
      const calls = probe.calls;
      await denied(verify(f.gateway, role, passwords[role]));
      advance(29_999); await denied(verify(f.gateway, role, passwords[role]));
      expect(probe.calls).toBe(calls);
      advance(1); expect((await verify(f.gateway, role, passwords[role])).signal.aborted).toBe(false);
      expect(f.count(role)).toBe(0); await f.gateway.close();
    }
  });
  it("resets only a successfully verified role streak and does not activate GLOBAL penalties", async () => {
    const f = await fixture();
    for (let i = 0; i < 4; i++) await denied(f.gateway.verifyAdminPassword(fake()));
    await denied(f.gateway.verifySalespersonPassword(fake()));
    await f.gateway.verifyAdminPassword(passwords.ADMIN);
    expect(f.count("ADMIN")).toBe(0); expect(f.count("SALESPERSON")).toBe(1);
    expect(f.count("GLOBAL")).toBe(0);
    for (let i = 0; i < 4; i++) await denied(f.gateway.verifyAdminPassword(fake()));
    expect(f.state("ADMIN").cooldown_until_ms).toBe(zero);
  });
  it("ignores an existing unapproved GLOBAL cooldown without erasing either role's history", async () => {
    const f = await fixture();
    f.reader.transaction(tx => {
      tx.run("UPDATE auth_login_attempts SET revision=1,last_seen_ms=?", [BigInt(clock.wall)]);
      tx.run("UPDATE auth_login_attempts SET cooldown_until_ms=?," +
        Array.from({ length: 10 }, (_, i) => "failed_" + (i + 1) + "_ms=?").join(",") + " WHERE bucket='GLOBAL'",
      [BigInt(clock.wall + 30_000), ...Array<bigint>(10).fill(BigInt(clock.wall))]);
    });
    expect((await f.gateway.verifyAdminPassword(passwords.ADMIN)).signal.aborted).toBe(false);
    expect(f.count("GLOBAL")).toBe(10); expect(f.count("ADMIN")).toBe(0);
  });
  it("preserves the remaining cooldown through gateway close/reopen with real verification", async () => {
    const f = await fixture();
    for (let i = 0; i < 5; i++) await denied(f.gateway.verifyAdminPassword(fake()));
    await f.gateway.close(); advance(10_000);
    const reopened = await openAuthorizationGateway(f.config); gateways.push(reopened);
    const calls = probe.calls;
    await denied(reopened.verifyAdminPassword(passwords.ADMIN));
    expect(f.state("ADMIN").cooldown_until_ms).toBe(BigInt(clock.wall + 20_000));
    advance(19_999); await denied(reopened.verifyAdminPassword(passwords.ADMIN)); expect(probe.calls).toBe(calls);
    advance(1); expect((await reopened.verifyAdminPassword(passwords.ADMIN)).signal.aborted).toBe(false);
    expect(f.count("ADMIN")).toBe(0);
  });
  it("fails fast on simultaneous attempts across both roles without native queue growth", async () => {
    const f = await fixture(), hold = holdNative(), first = f.gateway.verifyAdminPassword(passwords.ADMIN);
    await hold.ready;
    const calls = probe.calls;
    await Promise.all(Array.from({ length: 20 }, (_, i) => denied(verify(f.gateway, i % 2 ? "ADMIN" : "SALESPERSON", passwords.ADMIN))));
    expect(probe.calls).toBe(calls); expect(f.owner.inTransaction()).toBe(false);
    await denied(f.gateway.authorizeAdmin(new Request(f.config.origins.ADMIN + "/protected")));
    hold.release(); expect((await first).signal.aborted).toBe(false);
  });
  it("denies absent provisioning, missing credentials, inactive principals and missing throttling state before scrypt", async () => {
    for (const sql of ["DELETE FROM auth_provisioning", "DELETE FROM auth_credentials WHERE userId='SALESPERSON'",
      "UPDATE auth_principals SET active=0 WHERE id='SALESPERSON'", "DELETE FROM auth_login_attempts WHERE bucket='GLOBAL'"]) {
      const f = await fixture(); f.reader.transaction(tx => tx.run(sql));
      const calls = probe.calls; await denied(f.gateway.verifySalespersonPassword(passwords.SALESPERSON));
      expect(probe.calls).toBe(calls); await f.gateway.close();
    }
    const f = await fixture(false); await denied(f.gateway.verifyAdminPassword(passwords.ADMIN));
    expect(f.reader.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(zero);
  });
  it("denies credential-read and throttle SQL failures generically and recovers after transient errors", async () => {
    const f = await fixture(), calls = probe.calls;
    for (const method of ["get", "all"] as const) {
      const spy = vi.spyOn(f.owner, method).mockImplementation(() => { throw new Error(fake()); });
      await denied(f.gateway.verifyAdminPassword(passwords.ADMIN)); spy.mockRestore();
      expect(probe.calls).toBe(calls); expect(f.count("ADMIN")).toBe(0);
    }
    expect((await f.gateway.verifyAdminPassword(passwords.ADMIN)).signal.aborted).toBe(false);
  });
  it("denies finalization SQL failure and keeps the durable attempt without a verified receipt", async () => {
    const f = await fixture(), hold = holdNative();
    const pending = denied(f.gateway.verifyAdminPassword(passwords.ADMIN)); await hold.ready;
    const spy = vi.spyOn(f.owner, "get").mockImplementation(() => { throw new Error(fake()); });
    hold.release(); await pending; spy.mockRestore();
    expect(f.count("ADMIN")).toBe(1); expect(f.owner.inTransaction()).toBe(false);
  });
  it("rejects credential version, authorization epoch, hash and active-state changes during real scrypt", async () => {
    for (const mutation of ["version", "epoch", "hash", "active", "latch"] as const) {
      const f = await fixture(), hold = holdNative();
      const pending = denied(f.gateway.verifySalespersonPassword(passwords.SALESPERSON)); await hold.ready;
      f.reader.transaction(tx => {
        if (mutation === "version") tx.run("UPDATE auth_principals SET credential_version=credential_version+1 WHERE id='SALESPERSON'");
        if (mutation === "epoch") tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='SALESPERSON'");
        if (mutation === "hash") tx.run("UPDATE auth_credentials SET password=? WHERE userId='SALESPERSON'", [replacementHash]);
        if (mutation === "active") tx.run("UPDATE auth_principals SET active=0 WHERE id='SALESPERSON'");
        if (mutation === "latch") tx.run("DELETE FROM auth_provisioning");
      });
      hold.release(); await pending;
      expect(f.count("SALESPERSON")).toBe(1);
      expect(f.reader.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n).toBe(zero);
      await f.gateway.close();
    }
  });
  it("drains in-flight native verification on shutdown, rejects its result and allows a later owner", async () => {
    const f = await fixture(), hold = holdNative();
    const pending = denied(f.gateway.verifyAdminPassword(passwords.ADMIN)); await hold.ready;
    let closed = false;
    const closing = f.gateway.close().then(() => { closed = true; });
    await Promise.resolve(); expect(closed).toBe(false);
    await denied(f.gateway.verifySalespersonPassword(passwords.SALESPERSON));
    hold.release(); await pending; await closing; expect(closed).toBe(true);
    expect(f.count("ADMIN")).toBe(1);
    const next = await openAuthorizationGateway(f.config); gateways.push(next);
    expect((await next.verifyAdminPassword(passwords.ADMIN)).signal.aborted).toBe(false);
  });
  it("expires private receipts in five seconds and invalidates them on new attempts and close", async () => {
    const f = await fixture();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const first = await f.gateway.verifyAdminPassword(passwords.ADMIN);
    expect(first.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(4999); expect(first.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(first.signal.aborted).toBe(true);
    const second = await f.gateway.verifySalespersonPassword(passwords.SALESPERSON);
    await denied(f.gateway.verifyAdminPassword(undefined)); expect(second.signal.aborted).toBe(true);
    const third = await f.gateway.verifyAdminPassword(passwords.ADMIN);
    await f.gateway.close(); expect(third.signal.aborted).toBe(true);
  });
  it("never treats an actual or forged verification receipt as authorization or a session", async () => {
    const f = await fixture(), result = await f.gateway.verifyAdminPassword(passwords.ADMIN);
    for (const value of [result, { signal: new AbortController().signal }, { role: "ADMIN", credentialVersion: "1" }]) {
      await denied(f.gateway.authorizeAdmin(value as unknown as Request));
      await denied(f.gateway.authorizeSalesperson(value as unknown as Request));
    }
    await denied(f.gateway.authorizeAdmin(new Request(f.config.origins.ADMIN + "/protected")));
    expect(f.reader.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n).toBe(zero);
  });
  it("returns deny-only verification without configuration and discloses no credentials in ordinary outputs", async () => {
    const logs = (["log", "warn", "error", "info", "debug"] as const).map(method => vi.spyOn(console, method).mockImplementation(() => {}));
    const empty = await openAuthorizationGateway(); gateways.push(empty);
    await denied(empty.verifyAdminPassword(passwords.ADMIN)); await denied(empty.verifySalespersonPassword(passwords.SALESPERSON));
    const f = await fixture(), result: VerifiedCredential = await f.gateway.verifyAdminPassword(passwords.ADMIN);
    await denied(f.gateway.verifyAdminPassword(fake()));
    expect(contains(JSON.stringify({ gateway: f.gateway, result }))).toBe(false);
    expect(logs.every(log => log.mock.calls.length === 0)).toBe(true);
    expect(f.reader.get("SELECT count(*) AS n FROM auth_credentials")?.n).toBe(BigInt(2));
  });
});
