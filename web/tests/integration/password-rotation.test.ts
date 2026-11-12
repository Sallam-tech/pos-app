import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentAdapter, runWithAdapter, runWithTransaction } from "@better-auth/core/context";
import type { betterAuth } from "better-auth";
import { openDatabase, type SqliteConnection } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { openAuthorizationGateway } from "../../src/server/auth/gateway";
import { assertPasswordNotReused, passwordCallbacks } from "../../src/server/auth/password";
import { AuthorizationDenied, type AuthorizationConfiguration, type AuthorizationGateway, type Role } from "../../src/server/auth/types";
type Auth = ReturnType<typeof betterAuth>;
type Context = Awaited<Auth["$context"]>;
type Session = Awaited<ReturnType<Context["internalAdapter"]["createSession"]>>;
type Owner = ReturnType<typeof import("../../src/server/auth/database").openAsyncOwner>;
const observed = vi.hoisted(() => ({ auth: [] as Auth[], owners: [] as Owner[] }));
const clock = vi.hoisted(() => ({ wall: 1762800000000, monotonic: 1000, real: false }));
const probe = vi.hoisted(() => ({
  failClear: false, failDeleteKey: undefined as string | undefined, release: undefined as (() => void) | undefined,
  afterCookies: undefined as (() => Promise<void>) | undefined,
  afterCommit: undefined as (() => Promise<void>) | undefined,
  beforeCommit: undefined as (() => Promise<void>) | undefined,
  staged: [] as { role: string; cookies: string[]; token: string }[],
  nativeCalls: 0, failNativeAt: 0, pauseNativeAt: 0, kdfDuringTransaction: false, corpusUnavailable: false,
  nativeHook: undefined as (() => Promise<void>) | undefined,
  measureNative: false, nativeTimings: [] as number[], nativeFailed: false,
}));
// All framework/adapter/SQLite/signing behavior is REAL. Instrumentation captures
// private TEST state and injects explicit faults/barriers, never fake sessions.
vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>();
  return { ...actual, openSync: (...args: Parameters<typeof actual.openSync>) => {
    if (probe.corpusUnavailable && String(args[0]).includes("common-passwords.sha256")) throw new Error("TEST corpus unavailable");
    return actual.openSync(...args);
  } };
});
vi.mock("node:crypto", async original => {
  const actual = await original<typeof import("node:crypto")>();
  return { ...actual, scrypt(password: Buffer, salt: Buffer, length: number, options: import("node:crypto").ScryptOptions,
    callback: (error: Error | null, key: Buffer) => void) {
    const call = ++probe.nativeCalls;
    const measured = probe.measureNative, started = process.hrtime.bigint();
    if (observed.owners.at(-1)?.inTransaction()) probe.kdfDuringTransaction = true;
    if (probe.failNativeAt === call) { queueMicrotask(() => callback(new Error("TEST native failure"), Buffer.alloc(0))); return; }
    return actual.scrypt(password, salt, length, options, (error, key) => {
      if (measured) { probe.nativeTimings.push(Number(process.hrtime.bigint() - started) / 1e6); probe.nativeFailed ||= !!error; }
      const hook = probe.pauseNativeAt === call ? probe.nativeHook : undefined;
      if (hook) void hook().then(() => callback(error, key), () => { key?.fill(0); callback(new Error("TEST native barrier"), Buffer.alloc(0)); });
      else callback(error, key);
    });
  } };
});
vi.mock("better-auth", async original => {
  const actual = await original<typeof import("better-auth")>();
  return { ...actual, betterAuth: (options: Parameters<typeof betterAuth>[0]) => {
    const auth = actual.betterAuth(options); observed.auth.push(auth); return auth;
  } };
});
vi.mock("../../src/server/auth/database", async original => {
  const actual = await original<typeof import("../../src/server/auth/database")>();
  return { ...actual, openAsyncOwner: (config: Parameters<typeof actual.openAsyncOwner>[0]) => {
    const owner = actual.openAsyncOwner(config); observed.owners.push(owner); return owner;
  } };
});
vi.mock("../../src/server/auth/storage", async original => {
  const actual = await original<typeof import("../../src/server/auth/storage")>();
  return { ...actual, createVolatileStorage: () => {
    const store = actual.createVolatileStorage();
    return { storage: { ...store.storage, delete(key: string) {
      if (key === probe.failDeleteKey) throw new Error("TEST RAM delete fault"); return store.storage.delete(key);
    } }, clear() { if (probe.failClear) throw new Error("TEST RAM clear fault"); store.clear(); } };
  } };
});
vi.mock("node:perf_hooks", async original => {
  const actual = await original<typeof import("node:perf_hooks")>();
  return { ...actual, performance: { now: () => clock.real ? actual.performance.now() : clock.monotonic } };
});
vi.mock("better-auth/cookies", async original => {
  const actual = await original<typeof import("better-auth/cookies")>();
  return { ...actual, setSessionCookie: async (...args: Parameters<typeof actual.setSessionCookie>) => {
    await actual.setSessionCookie(...args);
    const cookies = args[0].responseHeaders.getSetCookie();
    probe.staged.push({ role: args[1].session.userId, cookies, token: args[1].session.token });
    for (const value of [args[1].session.token, ...cookies]) forbidden.add(value);
    if (probe.afterCookies) await probe.afterCookies();
  } };
});
vi.mock("@better-auth/core/context", async original => {
  const actual = await original<typeof import("@better-auth/core/context")>();
  return { ...actual, runWithTransaction: async (...args: Parameters<typeof actual.runWithTransaction>) => {
    const value = await actual.runWithTransaction(args[0], async () => {
      const result = await args[1]();
      if (probe.beforeCommit) await probe.beforeCommit();
      return result;
    });
    const hook = probe.afterCommit; probe.afterCommit = undefined;
    if (hook) await hook();
    return value;
  } };
});
const roles = ["ADMIN", "SALESPERSON"] as const, one = BigInt(1), zero = BigInt(0);
const root = path.resolve("test-results/sqlite-b1b-part1"); mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "rotation3l-"));
const forbidden = new Set<string>(), sensitive = new Set<string>();
const fake = (bytes = 6) => { const value = randomBytes(bytes).toString("base64url"); forbidden.add(value); sensitive.add(value); return value; };
const passwords = {} as Record<Role, string>, hashes = {} as Record<Role, string>;
const gateways: AuthorizationGateway[] = [], readers: SqliteConnection[] = [], audits: (() => void)[] = [];
const contains = (text: string) => [...forbidden, ...sensitive].some(value => text.includes(value));
const advance = (ms: number) => { clock.wall += ms; clock.monotonic += ms; vi.setSystemTime(clock.wall); };
const stable = (value: unknown) => JSON.stringify(value, (_key, v) => typeof v === "bigint" ? String(v) : v);
async function denied(work: Promise<unknown>) {
  let caught: unknown; try { await work; } catch (error) { caught = error; }
  expect(caught instanceof AuthorizationDenied).toBe(true);
  const error = caught as Error;
  expect(error.message).toBe("Access denied."); expect(Object.hasOwn(error, "cause")).toBe(false);
  expect(contains(JSON.stringify({ message: error.message, stack: error.stack }))).toBe(false);
}
function barrier() {
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; }); probe.release = release;
  return { ready, release, wait: async () => { entered(); await gate; } };
}
async function fixture(seed = true) {
  const directory = mkdtempSync(path.join(run, "db-")), migrationsDirectory = mkdtempSync(path.join(run, "migrations-"));
  const source = path.resolve("src/server/db/migrations");
  for (const name of readdirSync(source).filter(name => name.endsWith(".sql"))) copyFileSync(path.join(source, name), path.join(migrationsDirectory, name));
  // Disposable TEST-only schema for an actual deferred-FK COMMIT failure.
  writeFileSync(path.join(migrationsDirectory, "0009_test_commit_guard.sql"),
    "CREATE TABLE test_commit_guard(parent TEXT NOT NULL REFERENCES auth_users(id) DEFERRABLE INITIALLY DEFERRED) STRICT;\n", { flag: "wx" });
  const options = { directory, filename: "test.sqlite3", mode: "test" as const, create: true, busyTimeoutMs: 75 };
  const reader = openDatabase(options); readers.push(reader); applyMigrations(reader, migrationsDirectory);
  const config: AuthorizationConfiguration = { database: { ...options, create: false }, migrationsDirectory,
    origins: { ADMIN: "https://admin.sessions.invalid", SALESPERSON: "https://staff.sessions.invalid" },
    signingSecrets: { ADMIN: fake(48), SALESPERSON: fake(48) }, sessionLifetimeSeconds: 120 };
  const start = observed.auth.length, ownerStart = observed.owners.length;
  const gateway = await openAuthorizationGateway(config); gateways.push(gateway);
  const contexts = { ADMIN: await observed.auth[start].$context, SALESPERSON: await observed.auth[start + 1].$context };
  expect(observed.owners.length - ownerStart).toBe(1); const owner = observed.owners[ownerStart];
  if (seed) await runWithTransaction(contexts.ADMIN.adapter, async () => {
    const adapter = await getCurrentAdapter(contexts.ADMIN.adapter);
    if (adapter === contexts.ADMIN.adapter || !owner.inTransaction()) throw new Error("TEST transaction adapter required");
    for (const role of roles) {
      const now = new Date(clock.wall);
      await adapter.create({ model: "user", forceAllowId: true, data: { id: role, role, name: "TEST " + role,
        email: role.toLowerCase() + "@shop-pos.invalid", emailVerified: false, createdAt: now, updatedAt: now } });
      await adapter.create({ model: "account", forceAllowId: true, data: { id: role, accountId: role, userId: role,
        providerId: "credential", password: hashes[role], createdAt: now, updatedAt: now } });
      owner.run("INSERT INTO auth_principals VALUES(?,?,?,?,?)", [role, one, one, one, BigInt(clock.wall)]);
    }
    owner.run("INSERT INTO auth_provisioning VALUES(?,?,?,?,?)", [one, one, "ADMIN", "SALESPERSON", BigInt(clock.wall)]);
    for (const bucket of ["ADMIN", "GLOBAL", "SALESPERSON"]) owner.run("INSERT INTO auth_login_attempts(bucket) VALUES(?)", [bucket]);
    owner.run("INSERT INTO test_commit_guard(parent) VALUES(?)", ["ADMIN"]); // Existing unrelated TEST record.
  });
  const created: Session[] = [];
  for (const role of roles) {
    const actual = contexts[role].internalAdapter.createSession;
    vi.spyOn(contexts[role].internalAdapter, "createSession").mockImplementation(async (...args) => {
      const session = await actual(...args); created.push(session); forbidden.add(session.token); return session;
    });
  }
  const verify = (role: Role) => role === "ADMIN" ? gateway.verifyAdminPassword(passwords[role]) : gateway.verifySalespersonPassword(passwords[role]);
  const issue = (role: Role, receipt: unknown) => role === "ADMIN" ? gateway.issueAdminSession(receipt) : gateway.issueSalespersonSession(receipt);
  const registered = () => reader.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n;
  const request = (role: Role, cookies: string[]) => new Request(config.origins[role] + "/protected-test",
    { headers: { cookie: cookies.map(value => value.split(";")[0]).join("; ") } });
  const authorize = (role: Role, cookies: string[]) => role === "ADMIN" ? gateway.authorizeAdmin(request(role, cookies)) : gateway.authorizeSalesperson(request(role, cookies));
  const persistent = () => stable(Object.fromEntries(["auth_users", "auth_credentials", "auth_principals", "auth_provisioning", "schema_migrations", "test_commit_guard"]
    .map(table => [table, reader.all("SELECT * FROM " + table)])));
  audits.push(() => {
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = path.join(directory, options.filename) + suffix; if (suffix && !existsSync(file)) continue;
      expect([...forbidden].some(secret => readFileSync(file).toString("latin1").includes(secret))).toBe(false);
    }
  });
  const logout = (role: Role, cookies: string[]) => role === "ADMIN" ? gateway.logoutAdmin(request(role, cookies)) : gateway.logoutSalesperson(request(role, cookies));
  const checkPassword = (role: Role, password: unknown) => role === "ADMIN" ? gateway.verifyAdminPassword(password) : gateway.verifySalespersonPassword(password);
  const login = async (role: Role, password: string = passwords[role]) => (await issue(role, await checkPassword(role, password))).headers.getSetCookie();
  const rotate = (role: Role, cookies: string[], proof: unknown, password: unknown) => role === "ADMIN" ?
    gateway.rotateAdminPassword(request("ADMIN", cookies), proof, password) : gateway.rotateSalespersonPassword(request("ADMIN", cookies), proof, password);
  const account = (role: Role) => stable({ credential: reader.get("SELECT * FROM auth_credentials WHERE userId=?", [role]), principal: reader.get("SELECT * FROM auth_principals WHERE id=?", [role]) });
  const hash = (role: Role) => String(reader.get("SELECT password FROM auth_credentials WHERE userId=?", [role])?.password);
  const unchanged = () => stable(Object.fromEntries(["auth_users", "auth_provisioning", "schema_migrations", "test_commit_guard"].map(table => [table, reader.all("SELECT * FROM " + table)])));
  const attemptState = () => stable(reader.all("SELECT * FROM auth_login_attempts ORDER BY bucket"));
  const state = () => stable({ ADMIN: account("ADMIN"), SALESPERSON: account("SALESPERSON"), unchanged: unchanged(), attempts: attemptState(), registry: reader.all("SELECT * FROM auth_session_authorizations ORDER BY session_id") });
  return { gateway, owner, reader, contexts, created, config, verify, issue, registered, request, authorize, persistent, logout, login, checkPassword, rotate, account, hash, unchanged, attemptState, state };
}


beforeAll(async () => { for (const role of roles) { passwords[role] = fake(); hashes[role] = await passwordCallbacks.hash(passwords[role]); sensitive.add(hashes[role]); } });
beforeEach(() => {
  clock.wall = 1762800000000; clock.monotonic = 1000; clock.real = false; probe.staged = [];
  probe.measureNative = false; probe.nativeTimings = []; probe.nativeFailed = false;
  probe.afterCookies = undefined; probe.afterCommit = undefined; probe.beforeCommit = undefined;
  probe.failClear = false; probe.failDeleteKey = undefined; probe.corpusUnavailable = false; probe.nativeCalls = 0;
  probe.failNativeAt = 0; probe.pauseNativeAt = 0; probe.nativeHook = undefined; probe.kdfDuringTransaction = false;
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(clock.wall);
});
afterEach(async () => {
  probe.release?.(); probe.release = undefined; probe.afterCookies = undefined; probe.afterCommit = undefined; probe.beforeCommit = undefined;
  probe.failClear = false; probe.failDeleteKey = undefined; probe.corpusUnavailable = false; probe.failNativeAt = 0; probe.nativeHook = undefined;
  clock.real = false; probe.measureNative = false;
  vi.useRealTimers(); vi.restoreAllMocks();
  for (const gateway of gateways.splice(0)) await gateway.close();
  for (const reader of readers.splice(0)) reader.close();
  for (const audit of audits.splice(0)) audit();
});
describe("Part3L private Admin-controlled password rotation", () => {
  it.each(roles)("atomically rotates %s, revokes every target session and preserves the other account", async target => {
    const f = await fixture(), admin = await f.login("ADMIN"), secondAdmin = await f.login("ADMIN");
    const staff = await f.login("SALESPERSON"), secondStaff = await f.login("SALESPERSON");
    const proof = await f.verify("ADMIN"), next = fake(), before = f.unchanged(), other = target === "ADMIN" ? "SALESPERSON" : "ADMIN";
    const otherBefore = f.account(other), attempts = f.attemptState();
    const update = vi.spyOn(f.contexts[target].internalAdapter, "updateAccount");
    expect(await f.rotate(target, admin, proof, next)).toBeUndefined();
    expect(proof.signal.aborted).toBe(true); expect(update).toHaveBeenCalledTimes(1);
    expect(f.reader.get("SELECT credential_version,auth_epoch FROM auth_principals WHERE id=?", [target])?.credential_version).toBe(BigInt(2));
    expect(f.reader.get("SELECT credential_version,auth_epoch FROM auth_principals WHERE id=?", [target])?.auth_epoch).toBe(BigInt(2));
    expect(f.reader.get("SELECT count(*) AS n FROM auth_session_authorizations WHERE principal_id=? AND revoked_at_ms IS NULL", [target])?.n).toBe(zero);
    expect(f.account(other) === otherBefore).toBe(true); expect(f.unchanged() === before).toBe(true); expect(f.attemptState() === attempts).toBe(true);
    for (const cookies of target === "ADMIN" ? [admin, secondAdmin] : [staff, secondStaff]) await denied(f.authorize(target, cookies));
    for (const cookies of other === "ADMIN" ? [admin, secondAdmin] : [staff, secondStaff]) await f.authorize(other, cookies);
    const stored = f.hash(target); sensitive.add(stored);
    expect(await passwordCallbacks.verify({ hash: stored, password: next })).toBe(true);
    expect(await passwordCallbacks.verify({ hash: stored, password: passwords[target] })).toBe(false);
    await denied(f.checkPassword(target, passwords[target]));
    const freshCookies = await f.login(target, next); await f.authorize(target, freshCookies);
    await denied(f.rotate(target, admin, proof, fake()));
    expect(probe.kdfDuringTransaction).toBe(false);
  });
  it("requires a live signed Admin session as well as the fresh Admin proof", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), staff = await f.login("SALESPERSON"), next = fake();
    const before = f.state();
    const adminProof = await f.verify("ADMIN");
    await denied(f.rotate("SALESPERSON", staff, adminProof, next));
    expect(adminProof.signal.aborted).toBe(true);
    const staffProof = await f.verify("SALESPERSON");
    await denied(f.rotate("ADMIN", admin, staffProof, next));
    await denied(f.rotate("ADMIN", admin, {}, next));
    const missingSession = await f.verify("ADMIN");
    await denied(f.rotate("SALESPERSON", [], missingSession, next));
    expect(f.unchanged() === JSON.parse(before).unchanged).toBe(true);
    expect(f.hash("ADMIN") === hashes.ADMIN && f.hash("SALESPERSON") === hashes.SALESPERSON).toBe(true);
    await f.authorize("ADMIN", admin); await f.authorize("SALESPERSON", staff);
  });

  it("burns expired, aborted, forged and reused proofs without invoking rotation KDF work", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), next = fake();
    const first = await f.verify("ADMIN"), second = await f.verify("ADMIN"), before = f.state();
    await denied(f.rotate("ADMIN", admin, first, next));
    advance(5000); probe.nativeCalls = 0;
    await denied(f.rotate("ADMIN", admin, second, next));
    let getter = false;
    await denied(f.rotate("ADMIN", admin, { get signal() { getter = true; throw new Error("TEST getter"); } }, next));
    expect(getter).toBe(false); expect(probe.nativeCalls).toBe(0); expect(f.state() === before).toBe(true);
    const fresh = await f.verify("ADMIN");
    await denied(f.gateway.rotateAdminPassword(f.request("SALESPERSON", []), fresh, next));
    await denied(f.rotate("ADMIN", admin, fresh, next)); // Wrong-origin consumption cannot be replayed.
  });
  it("rejects the actual current or other password regardless of independently salted hashes", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), before = f.unchanged();
    for (const target of roles) for (const candidate of roles) {
      const proof = await f.verify("ADMIN"), state = f.state();
      await denied(f.rotate(target, admin, proof, passwords[candidate]));
      expect(proof.signal.aborted).toBe(true); expect(f.state() === state).toBe(true);
      await denied(f.rotate(target, admin, proof, fake()));
    }
    expect(f.unchanged() === before).toBe(true); await f.authorize("ADMIN", admin);
  });
  it("rejects weak, too-short, oversized and malformed inputs before rotation KDF work", async () => {
    const f = await fixture(), admin = await f.login("ADMIN");
    const common = String.fromCharCode(112,97,115,115,119,111,114,100); // Public rejection vector, also a SQL column name; not a generated secret.
    for (const input of [fake().slice(0, 7), common, "z".repeat(8), fake(100), "\ud800" + fake(), null, { password: fake() }]) {
      if (typeof input === "string" && input !== common) forbidden.add(input);
      const proof = await f.verify("ADMIN"), before = f.state(); probe.nativeCalls = 0;
      await denied(f.rotate("SALESPERSON", admin, proof, input));
      expect(probe.nativeCalls).toBe(0); expect(f.state() === before).toBe(true);
    }
  });
  it("preserves exact Unicode and spaces without normalization or composition rules", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), next = " " + fake() + "e\u0301 ";
    forbidden.add(next); const proof = await f.verify("ADMIN");
    await f.rotate("SALESPERSON", admin, proof, next);
    const stored = f.hash("SALESPERSON"); sensitive.add(stored);
    expect(await passwordCallbacks.verify({ hash: stored, password: next })).toBe(true);
    expect(await passwordCallbacks.verify({ hash: stored, password: next.normalize("NFC") })).toBe(false);
    expect(await passwordCallbacks.verify({ hash: stored, password: next.trim() })).toBe(false);
    await f.authorize("ADMIN", admin);
  });
  it.each([1, 2, 3])("fails closed on native job %s failure rather than treating it as proven non-reuse", async fault => {
    const f = await fixture(), admin = await f.login("ADMIN"), proof = await f.verify("ADMIN"), before = f.state();
    probe.nativeCalls = 0; probe.failNativeAt = fault;
    await denied(f.rotate("SALESPERSON", admin, proof, fake()));
    expect(probe.nativeCalls).toBe(fault); expect(f.state() === before).toBe(true);
    await f.authorize("ADMIN", admin);
  });
  it("rejects a malformed stored hash and unavailable offline screening without modifying accounts", async () => {
    const f = await fixture(), admin = await f.login("ADMIN");
    f.reader.transaction(tx => tx.run("UPDATE auth_credentials SET password=? WHERE userId='SALESPERSON'", ["0".repeat(32) + ":" + "0".repeat(128)]));
    const proof = await f.verify("ADMIN"), before = f.state();
    await denied(f.rotate("SALESPERSON", admin, proof, fake())); expect(f.state() === before).toBe(true);
    f.reader.transaction(tx => tx.run("UPDATE auth_credentials SET password=? WHERE userId='SALESPERSON'", [hashes.SALESPERSON]));
    const nextProof = await f.verify("ADMIN"), state = f.state(); probe.corpusUnavailable = true; probe.nativeCalls = 0;
    await denied(f.rotate("ADMIN", admin, nextProof, fake()));
    expect(probe.nativeCalls).toBe(0); expect(f.state() === state).toBe(true);
  });
  it("requires correct current Admin verification and preserves the exact five-failure 30-second cooldown", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), before = f.unchanged(), wrong = fake();
    for (let n = 0; n < 5; n++) await denied(f.checkPassword("ADMIN", wrong));
    probe.nativeCalls = 0;
    await denied(f.checkPassword("ADMIN", passwords.ADMIN));
    await denied(f.rotate("SALESPERSON", admin, {}, fake()));
    expect(probe.nativeCalls).toBe(0);
    advance(29999); await denied(f.checkPassword("ADMIN", passwords.ADMIN));
    expect(probe.nativeCalls).toBe(0); advance(1);
    const proof = await f.verify("ADMIN"), next = fake();
    await f.rotate("SALESPERSON", admin, proof, next);
    await f.authorize("ADMIN", admin); expect(f.unchanged() === before).toBe(true);
    const state = f.reader.get("SELECT * FROM auth_login_attempts WHERE bucket='ADMIN'");
    expect(state?.cooldown_until_ms).toBe(zero);
    expect([1,2,3,4,5].every(n => state?.["failed_" + n + "_ms"] === zero)).toBe(true);
  });
  it.each(roles)("denies all old %s cookies even if framework and role RAM cleanup fail", async target => {
    const f = await fixture(), admin = await f.login("ADMIN"), staff = await f.login("SALESPERSON");
    const extra = await f.login(target), targetSession = f.created.at(-1)!, proof = await f.verify("ADMIN");
    const other = target === "ADMIN" ? "SALESPERSON" : "ADMIN", otherBefore = f.account(other);
    vi.spyOn(f.contexts[target].internalAdapter, "deleteUserSessions").mockRejectedValue(new Error("TEST cleanup failure"));
    probe.failClear = true;
    await f.rotate(target, admin, proof, fake());
    expect(await f.contexts[target].internalAdapter.findSession(targetSession.token) !== null).toBe(true);
    for (const cookies of [target === "ADMIN" ? admin : staff, extra]) await denied(f.authorize(target, cookies));
    await f.authorize(other, other === "ADMIN" ? admin : staff);
    expect(f.account(other) === otherBefore).toBe(true);
  });
  it.each(["after-hash", "after-version"] as const)("rolls back %s failure without partial credential/version/session changes", async fault => {
    const f = await fixture(), admin = await f.login("ADMIN"), staff = await f.login("SALESPERSON");
    const proof = await f.verify("ADMIN"), before = f.state(), next = fake();
    if (fault === "after-hash") {
      const actual = f.contexts.SALESPERSON.internalAdapter.updateAccount;
      vi.spyOn(f.contexts.SALESPERSON.internalAdapter, "updateAccount").mockImplementation(async (...args) => {
        await actual(...args); throw new Error("TEST error " + next);
      });
    } else {
      const actual = f.owner.run;
      vi.spyOn(f.owner, "run").mockImplementation((sql, values) => {
        if (sql.startsWith("UPDATE auth_session_authorizations SET revoked_at_ms")) throw new Error("TEST SQL error " + next);
        return actual(sql, values);
      });
    }
    await denied(f.rotate("SALESPERSON", admin, proof, next));
    expect(f.owner.inTransaction()).toBe(false); expect(f.state() === before).toBe(true);
    await f.authorize("ADMIN", admin); await f.authorize("SALESPERSON", staff);
    await denied(f.rotate("SALESPERSON", admin, proof, next));
  });
  it("handles REAL SQLite COMMIT failure with atomic rollback and no successful rotation claim", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), staff = await f.login("SALESPERSON");
    const proof = await f.verify("ADMIN"), before = f.state(), actual = f.owner.run; let injected = false;
    vi.spyOn(f.owner, "run").mockImplementation((sql, values) => {
      const result = actual(sql, values);
      if (sql.startsWith("UPDATE auth_session_authorizations SET revoked_at_ms")) {
        actual("INSERT INTO test_commit_guard(parent) VALUES(?)", ["MISSING"]); injected = true;
      }
      return result;
    });
    probe.failClear = true;
    await denied(f.rotate("SALESPERSON", admin, proof, fake()));
    expect(injected).toBe(true); expect(f.owner.inTransaction()).toBe(false); expect(f.state() === before).toBe(true);
    await denied(f.authorize("ADMIN", admin)); await denied(f.authorize("SALESPERSON", staff));
  });
  it("quarantines an acknowledgment failure after COMMIT, retaining the actual atomic new state", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), staff = await f.login("SALESPERSON"), proof = await f.verify("ADMIN"), next = fake();
    const actual = f.contexts.SALESPERSON.internalAdapter.updateAccount;
    vi.spyOn(f.contexts.SALESPERSON.internalAdapter, "updateAccount").mockImplementation(async (...args) => {
      const result = await actual(...args);
      probe.afterCommit = async () => { throw new Error("TEST acknowledgment failure"); }; return result;
    });
    probe.failClear = true;
    await denied(f.rotate("SALESPERSON", admin, proof, next));
    expect(f.reader.get("SELECT credential_version FROM auth_principals WHERE id='SALESPERSON'")?.credential_version).toBe(BigInt(2));
    expect(await passwordCallbacks.verify({ hash: f.hash("SALESPERSON"), password: next })).toBe(true);
    expect(f.reader.get("SELECT count(*) AS n FROM auth_session_authorizations WHERE principal_id='SALESPERSON' AND revoked_at_ms IS NULL")?.n).toBe(zero);
    await denied(f.authorize("ADMIN", admin)); await denied(f.authorize("SALESPERSON", staff));
    await f.gateway.close();
    const reopened = await openAuthorizationGateway(f.config); gateways.push(reopened);
    const receipt = await reopened.verifySalespersonPassword(next);
    expect(receipt.signal.aborted).toBe(false);
  });
  it.each(["admin-version", "target-hash", "latch", "admin-session"] as const)("rejects concurrent %s changes made during native work", async mutation => {
    const f = await fixture(), admin = await f.login("ADMIN"), proof = await f.verify("ADMIN"), gate = barrier();
    probe.nativeCalls = 0; probe.pauseNativeAt = 1; probe.nativeHook = gate.wait;
    const pending = denied(f.rotate("SALESPERSON", admin, proof, fake())); await gate.ready;
    f.reader.transaction(tx => {
      if (mutation === "admin-version") tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='ADMIN'");
      if (mutation === "target-hash") tx.run("UPDATE auth_credentials SET password=? WHERE userId='SALESPERSON'", [hashes.ADMIN]);
      if (mutation === "latch") tx.run("DELETE FROM auth_provisioning");
      if (mutation === "admin-session") tx.run("UPDATE auth_session_authorizations SET revoked_at_ms=created_at_ms WHERE principal_id='ADMIN'");
    });
    const changed = f.state(); gate.release(); await pending;
    expect(f.state() === changed).toBe(true);
  });
  it.each(["operation-expiry", "logout", "shutdown"] as const)("cancels rotation on %s before any credential mutation", async transition => {
    const f = await fixture(), admin = await f.login("ADMIN"), proof = await f.verify("ADMIN"), gate = barrier();
    const adminBefore = f.account("ADMIN"), staffBefore = f.account("SALESPERSON"), unchanged = f.unchanged();
    probe.nativeCalls = 0; probe.pauseNativeAt = 1; probe.nativeHook = gate.wait;
    const pending = denied(f.rotate("SALESPERSON", admin, proof, fake())); await gate.ready;
    let closing: Promise<void> | undefined;
    if (transition === "operation-expiry") advance(30000);
    if (transition === "logout") await f.logout("ADMIN", admin);
    if (transition === "shutdown") closing = f.gateway.close();
    gate.release(); await pending; await closing;
    expect(f.account("ADMIN") === adminBefore && f.account("SALESPERSON") === staffBefore).toBe(true);
    expect(f.unchanged() === unchanged).toBe(true);
  });
  it("permits only one rotation and rejects proof replay and competing KDF admission", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), proof = await f.verify("ADMIN"), gate = barrier();
    probe.nativeCalls = 0; probe.pauseNativeAt = 1; probe.nativeHook = gate.wait;
    const pending = f.rotate("SALESPERSON", admin, proof, fake()); await gate.ready;
    await denied(f.rotate("ADMIN", admin, proof, fake()));
    await denied(f.verify("ADMIN")); await denied(f.issue("ADMIN", proof));
    gate.release(); await pending;
    expect(probe.nativeCalls).toBe(3);
    expect(f.reader.get("SELECT credential_version FROM auth_principals WHERE id='ADMIN'")?.credential_version).toBe(one);
    expect(f.reader.get("SELECT credential_version FROM auth_principals WHERE id='SALESPERSON'")?.credential_version).toBe(BigInt(2));
    await f.authorize("ADMIN", admin);
  });
  it("keeps native verification/hashing outside the writer and permits protected work meanwhile", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), staff = await f.login("SALESPERSON"), proof = await f.verify("ADMIN"), gate = barrier();
    const unchanged = f.unchanged();
    probe.nativeCalls = 0; probe.pauseNativeAt = 3; probe.nativeHook = gate.wait;
    const pending = f.rotate("SALESPERSON", admin, proof, fake()); await gate.ready;
    expect(f.owner.inTransaction()).toBe(false);
    await f.gateway.withSalespersonTransaction(f.request("SALESPERSON", staff), async tx => {
      expect((await tx.get("SELECT count(*) AS n FROM test_commit_guard"))?.n).toBe(one);
    });
    f.reader.transaction(tx => tx.run("UPDATE test_commit_guard SET parent=parent"));
    gate.release(); await pending; expect(probe.kdfDuringTransaction).toBe(false);
    await denied(f.authorize("SALESPERSON", staff)); expect(f.unchanged() === unchanged).toBe(true);
  });
  it("holds the writer through atomic COMMIT and denies target authorization queued afterward", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), staff = await f.login("SALESPERSON"), proof = await f.verify("ADMIN"), gate = barrier();
    const actual = f.contexts.SALESPERSON.internalAdapter.updateAccount, previous = f.account("SALESPERSON");
    vi.spyOn(f.contexts.SALESPERSON.internalAdapter, "updateAccount").mockImplementation(async (...args) => {
      const result = await actual(...args); probe.beforeCommit = gate.wait; return result;
    });
    let published = false;
    const pending = f.rotate("SALESPERSON", admin, proof, fake()).then(() => { published = true; }); await gate.ready;
    expect(published).toBe(false); expect(f.account("SALESPERSON") === previous).toBe(true);
    let blocked = false;
    try { f.reader.transaction(tx => tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='ADMIN'")); } catch { blocked = true; }
    expect(blocked).toBe(true);
    const deniedAfter = denied(f.authorize("SALESPERSON", staff));
    gate.release(); probe.beforeCommit = undefined; await pending; await deniedAfter;
    expect(published).toBe(true); await f.authorize("ADMIN", admin);
  });
  it("rejects signed-int64 overflow without changing any credential or repairing state", async () => {
    const f = await fixture(), admin = await f.login("ADMIN");
    f.reader.transaction(tx => tx.run("UPDATE auth_principals SET credential_version=? WHERE id='SALESPERSON'", [BigInt("9223372036854775807")]));
    const proof = await f.verify("ADMIN"), before = f.state();
    await denied(f.rotate("SALESPERSON", admin, proof, fake())); expect(f.state() === before).toBe(true);
    await f.authorize("ADMIN", admin);
  });
  it("rejects inherited/nested contexts and unavailable SQL without a fresh-proof bypass", async () => {
    const f = await fixture(), admin = await f.login("ADMIN");
    const first = await f.verify("ADMIN");
    await f.gateway.withAdminTransaction(f.request("ADMIN", admin), async () => {
      await denied(f.rotate("ADMIN", admin, first, fake())); expect(f.owner.inTransaction()).toBe(true);
    });
    const second = await f.verify("ADMIN");
    await runWithAdapter(f.contexts.SALESPERSON.adapter, () => denied(f.rotate("ADMIN", admin, second, fake())));
    const third = await f.verify("ADMIN"), before = f.state(), native = f.owner.get;
    vi.spyOn(f.owner, "get").mockImplementation((sql, values) => {
      if (sql.includes("auth_credentials")) throw new Error("TEST SQLite unavailable"); return native(sql, values);
    });
    await denied(f.rotate("SALESPERSON", admin, third, fake()));
    expect(f.state() === before).toBe(true);
  });
  it("keeps capabilities, errors, normal results and logs free of credentials or tokens", async () => {
    const logs: unknown[][] = [];
    for (const name of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, name).mockImplementation((...args) => { logs.push(args); });
    const f = await fixture(), admin = await f.login("ADMIN"), proof = await f.verify("ADMIN");
    const result = await f.rotate("SALESPERSON", admin, proof, fake());
    expect(result).toBeUndefined(); expect(logs.length).toBe(0); expect(contains(stable(logs))).toBe(false);
    expect(["api", "handler", "$context", "db", "adapter", "storage"].some(key => key in f.gateway)).toBe(false);
    const disabled = await openAuthorizationGateway();
    await denied(disabled.rotateAdminPassword(f.request("ADMIN", admin), {}, fake()));
    await denied(disabled.rotateSalespersonPassword(f.request("ADMIN", admin), {}, fake())); await disabled.close();
    const encoded = f.hash("SALESPERSON");
    let message = "";
    try { await assertPasswordNotReused(passwords.ADMIN, encoded.slice(0, 49) + "x".repeat(112)); } catch (error) { message = (error as Error).message; }
    expect(message).toBe("Password operation failed."); expect(contains(message)).toBe(false);
  });

  it("rolls back Admin self-rotation if its signed session expires during the write", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), proof = await f.verify("ADMIN"), before = f.state();
    const actual = f.contexts.ADMIN.internalAdapter.updateAccount;
    vi.spyOn(f.contexts.ADMIN.internalAdapter, "updateAccount").mockImplementation(async (...args) => {
      const result = await actual(...args);
      clock.wall += 120_000; vi.setSystemTime(clock.wall); // Wall expiry, independent of monotonic proof deadline.
      return result;
    });
    await denied(f.rotate("ADMIN", admin, proof, fake()));
    expect(f.state() === before).toBe(true); expect(f.owner.inTransaction()).toBe(false);
    await denied(f.authorize("ADMIN", admin));
  });

  // One measurement already recorded. Explicit TEST opt-in prevents accidental benchmark repetition.
  it.skipIf(process.env.SHOP_POS_RUN_ROTATION_TIMING !== "1")("Part3M measures one native development-laptop rotation without controlled clocks", async () => {
    vi.useRealTimers(); clock.real = true; clock.wall = Date.now();
    const f = await fixture(), admin = await f.login("ADMIN"), proof = await f.verify("ADMIN");
    const next = fake(); probe.nativeCalls = 0; probe.nativeTimings = []; probe.measureNative = true;
    const started = process.hrtime.bigint(); let success = false;
    try { await f.rotate("SALESPERSON", admin, proof, next); success = true; }
    catch (error) { expect(error instanceof AuthorizationDenied).toBe(true); }
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    probe.measureNative = false;
    const result = { node: process.version, platform: process.platform, arch: process.arch,
      controlledClocks: false, oneRotationOnly: true, success,
      nativeJobs: probe.nativeTimings.map(value => Math.round(value * 100) / 100),
      rotationMs: Math.round(elapsedMs * 100) / 100,
      nativeFailure: probe.nativeFailed, receiptLimitMs: 5000,
      costs: { N: 131072, r: 8, p: 1, maxmemMiB: 192 } };
    writeFileSync(path.resolve("test-results/auth-b1b-part3m-6b34b0e9-777d-422e-b59e-e5f9dbab21fb/native-timing.json"),
      JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
    expect(probe.nativeTimings.length >= 1 && probe.nativeTimings.length <= 3).toBe(true);
    expect(probe.nativeFailed).toBe(false); expect(probe.kdfDuringTransaction).toBe(false);
    clock.real = false;
  });
  it.each(roles)("Part3M accepts slow native work beyond consumed proof expiry for %s", async target => {
    const f = await fixture(), admin = await f.login("ADMIN"), staff = await f.login("SALESPERSON"), proof = await f.verify("ADMIN");
    const next = fake(), unchanged = f.unchanged(), attempts = f.attemptState(), other = target === "ADMIN" ? "SALESPERSON" : "ADMIN", otherBefore = f.account(other);
    probe.nativeCalls = 0; probe.pauseNativeAt = 3; probe.nativeHook = async () => { advance(6000); };
    expect(await f.rotate(target, admin, proof, next)).toBeUndefined();
    expect(probe.nativeCalls).toBe(3); expect(proof.signal.aborted).toBe(true);
    expect(f.unchanged() === unchanged && f.account(other) === otherBefore && f.attemptState() === attempts).toBe(true);
    await denied(f.authorize(target, target === "ADMIN" ? admin : staff));
    await f.authorize(other, other === "ADMIN" ? admin : staff);
    expect(await passwordCallbacks.verify({ hash: f.hash(target), password: next })).toBe(true);
    await denied(f.rotate(target, admin, proof, next)); expect(probe.kdfDuringTransaction).toBe(false);
  });

  it.each([29999, 30000])("Part3M enforces the fixed 30-second operation boundary at %s ms", async duration => {
    const f = await fixture(), admin = await f.login("ADMIN"), proof = await f.verify("ADMIN"), before = f.state(), next = fake();
    probe.nativeCalls = 0; probe.pauseNativeAt = 3; probe.nativeHook = async () => { advance(duration); };
    if (duration < 30000) {
      await f.rotate("SALESPERSON", admin, proof, next);
      expect(f.reader.get("SELECT credential_version FROM auth_principals WHERE id='SALESPERSON'")?.credential_version).toBe(BigInt(2));
    } else {
      await denied(f.rotate("SALESPERSON", admin, proof, next)); expect(f.state() === before).toBe(true);
    }
    expect(probe.nativeCalls).toBe(3); await f.authorize("ADMIN", admin);
    await denied(f.rotate("SALESPERSON", admin, proof, next));
  });
  it("Part3M denies a native failure after the consumed proof has expired", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), proof = await f.verify("ADMIN"), before = f.state();
    probe.nativeCalls = 0; probe.pauseNativeAt = 1; probe.failNativeAt = 2;
    probe.nativeHook = async () => { advance(6000); };
    await denied(f.rotate("SALESPERSON", admin, proof, fake()));
    expect(probe.nativeCalls).toBe(2); expect(f.state() === before).toBe(true); await f.authorize("ADMIN", admin);
  });
  it("Part3M denies actual Admin session expiry even while the operation budget remains valid", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), proof = await f.verify("ADMIN"), before = f.state();
    probe.nativeCalls = 0; probe.pauseNativeAt = 3; probe.nativeHook = async () => {
      clock.monotonic += 6000; clock.wall += 120000; vi.setSystemTime(clock.wall);
    };
    await denied(f.rotate("SALESPERSON", admin, proof, fake()));
    expect(probe.nativeCalls).toBe(3); expect(f.state() === before).toBe(true); await denied(f.authorize("ADMIN", admin));
  });
  it.each(["logout", "shutdown", "revocation", "version", "epoch", "target"] as const)(
    "Part3M denies %s changes during slow authorized native work", async change => {
      const f = await fixture(), admin = await f.login("ADMIN"), proof = await f.verify("ADMIN"), gate = barrier();
      probe.nativeCalls = 0; probe.pauseNativeAt = 1;
      probe.nativeHook = async () => { advance(6000); await gate.wait(); };
      const pending = denied(f.rotate("SALESPERSON", admin, proof, fake())); await gate.ready;
      let closing: Promise<void> | undefined;
      if (change === "logout") await f.logout("ADMIN", admin);
      if (change === "shutdown") closing = f.gateway.close();
      if (["revocation", "version", "epoch", "target"].includes(change)) f.reader.transaction(tx => {
        if (change === "revocation") tx.run("UPDATE auth_session_authorizations SET revoked_at_ms=created_at_ms WHERE principal_id='ADMIN'");
        if (change === "version") tx.run("UPDATE auth_principals SET credential_version=credential_version+1 WHERE id='ADMIN'");
        if (change === "epoch") tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='ADMIN'");
        if (change === "target") tx.run("UPDATE auth_principals SET active=0 WHERE id='SALESPERSON'");
      });
      const changed = f.state(); gate.release(); await pending; await closing;
      expect(f.state() === changed).toBe(true); expect(probe.kdfDuringTransaction).toBe(false);
    });
  it.each(["rollback", "invalid"] as const)("Part3M rejects an operation clock %s after a valid checkpoint", async fault => {
    const f = await fixture(), admin = await f.login("ADMIN"), proof = await f.verify("ADMIN"), before = f.state();
    probe.nativeCalls = 0; probe.pauseNativeAt = 1;
    probe.nativeHook = async () => {
      advance(6000); probe.pauseNativeAt = 2;
      probe.nativeHook = async () => { clock.monotonic = fault === "invalid" ? NaN : clock.monotonic - 1; };
    };
    await denied(f.rotate("SALESPERSON", admin, proof, fake()));
    expect(probe.nativeCalls).toBe(2); expect(f.state() === before).toBe(true);
  });
  it("Part3M rejects operation-deadline integer overflow without starting native work", async () => {
    const f = await fixture(), admin = await f.login("ADMIN");
    clock.monotonic = Number.MAX_SAFE_INTEGER - 10000;
    const proof = await f.verify("ADMIN"), before = f.state(); probe.nativeCalls = 0;
    await denied(f.rotate("SALESPERSON", admin, proof, fake()));
    expect(probe.nativeCalls).toBe(0); expect(f.state() === before).toBe(true);
  });
  it("Part3M requires the original proof to remain fresh through queued initial authorization", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), proof = await f.verify("ADMIN"), before = f.state(), gate = barrier();
    const actual = f.contexts.ADMIN.internalAdapter.findSession;
    vi.spyOn(f.contexts.ADMIN.internalAdapter, "findSession").mockImplementationOnce(async (...args) => {
      const result = await actual(...args); await gate.wait(); return result;
    });
    const occupied = f.authorize("ADMIN", admin); await gate.ready;
    expect(f.owner.inTransaction()).toBe(false); probe.nativeCalls = 0;
    const pending = denied(f.rotate("SALESPERSON", admin, proof, fake()));
    advance(5000); gate.release(); await occupied; await pending;
    expect(probe.nativeCalls).toBe(0); expect(f.state() === before).toBe(true); await f.authorize("ADMIN", admin);
  });
  it("Part3M rolls back writes when the operation expires inside the credential update", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), proof = await f.verify("ADMIN"), before = f.state();
    probe.nativeCalls = 0; probe.pauseNativeAt = 3; probe.nativeHook = async () => { advance(6000); };
    const actual = f.contexts.SALESPERSON.internalAdapter.updateAccount;
    vi.spyOn(f.contexts.SALESPERSON.internalAdapter, "updateAccount").mockImplementation(async (...args) => {
      const result = await actual(...args); advance(24000); return result;
    });
    await denied(f.rotate("SALESPERSON", admin, proof, fake()));
    expect(probe.nativeCalls).toBe(3); expect(f.state() === before).toBe(true);
    expect(f.owner.inTransaction()).toBe(false); await f.authorize("ADMIN", admin);
  });
});
