import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentAdapter, runWithAdapter, runWithTransaction } from "@better-auth/core/context";
import type { betterAuth } from "better-auth";
import { openDatabase, type SqliteConnection } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { openAuthorizationGateway } from "../../src/server/auth/gateway";
import { passwordCallbacks } from "../../src/server/auth/password";
import { AuthorizationDenied, type AuthorizationConfiguration, type AuthorizationGateway, type Role } from "../../src/server/auth/types";
type Auth = ReturnType<typeof betterAuth>;
type Context = Awaited<Auth["$context"]>;
type Session = Awaited<ReturnType<Context["internalAdapter"]["createSession"]>>;
type Owner = ReturnType<typeof import("../../src/server/auth/database").openAsyncOwner>;
const observed = vi.hoisted(() => ({ auth: [] as Auth[], owners: [] as Owner[] }));
const clock = vi.hoisted(() => ({ wall: 1762800000000, monotonic: 1000 }));
const probe = vi.hoisted(() => ({
  failClear: false, failDeleteKey: undefined as string | undefined, release: undefined as (() => void) | undefined,
  afterCookies: undefined as (() => Promise<void>) | undefined,
  afterCommit: undefined as (() => Promise<void>) | undefined,
  beforeCommit: undefined as (() => Promise<void>) | undefined,
  staged: [] as { role: string; cookies: string[]; token: string }[],
}));
// All framework/adapter/SQLite/signing behavior is REAL. Instrumentation captures
// private TEST state and injects explicit faults/barriers, never fake sessions.
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
vi.mock("node:perf_hooks", async original => ({
  ...await original<typeof import("node:perf_hooks")>(), performance: { now: () => clock.monotonic },
}));
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
const run = mkdtempSync(path.join(root, "revocation3k-"));
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
  for (const name of readdirSync(source).filter(name => /^000[1-8]_.*\.sql$/.test(name))) copyFileSync(path.join(source, name), path.join(migrationsDirectory, name));
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
  const login = async (role: Role) => (await issue(role, await verify(role))).headers.getSetCookie();
  return { gateway, owner, reader, contexts, created, config, verify, issue, registered, request, authorize, persistent, logout, login };
}

async function safeResponse(response: Response, role: Role) {
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('{"ok":true}');
  expect(response.headers.get("cache-control")).toBe("no-store");
  const cookies = response.headers.getSetCookie(), prefix = role === "ADMIN" ? "__Secure-pos-admin." : "__Secure-pos-salesperson.";
  expect(cookies.length >= 3).toBe(true);
  expect(cookies.every(cookie => cookie.startsWith(prefix) && /=;/.test(cookie) && /Max-Age=0/i.test(cookie) &&
    /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite=Strict/i.test(cookie) && /Path=\//i.test(cookie))).toBe(true);
  expect(cookies.some(cookie => /Domain=/i.test(cookie))).toBe(false);
  expect(contains(JSON.stringify([...response.headers]))).toBe(false);
}
beforeAll(async () => { for (const role of roles) { passwords[role] = fake(); hashes[role] = await passwordCallbacks.hash(passwords[role]); sensitive.add(hashes[role]); } });
beforeEach(() => {
  clock.wall = 1762800000000; clock.monotonic = 1000; probe.staged = [];
  probe.afterCookies = undefined; probe.afterCommit = undefined; probe.beforeCommit = undefined; probe.failClear = false; probe.failDeleteKey = undefined;
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(clock.wall);
});
afterEach(async () => {
  probe.release?.(); probe.release = undefined; probe.afterCookies = undefined; probe.afterCommit = undefined; probe.beforeCommit = undefined; probe.failClear = false; probe.failDeleteKey = undefined;
  vi.useRealTimers(); vi.restoreAllMocks();
  for (const gateway of gateways.splice(0)) await gateway.close();
  for (const reader of readers.splice(0)) reader.close();
  for (const audit of audits.splice(0)) audit();
});
describe("Part3K private logout and authoritative revocation", () => {
  it.each(roles)("revokes %s through real signed-cookie lookup and denies stale cookies", async role => {
    const f = await fixture(), cookies = await f.login(role), before = f.persistent(), session = f.created.at(-1)!;
    await f.authorize(role, cookies);
    await safeResponse(await f.logout(role, cookies), role);
    expect(f.reader.get("SELECT revoked_at_ms FROM auth_session_authorizations WHERE session_id=?", [session.id])?.revoked_at_ms).toBe(BigInt(clock.wall));
    expect(await f.contexts[role].internalAdapter.findSession(session.token) === null).toBe(true);
    await denied(f.authorize(role, cookies));
    expect(f.persistent() === before).toBe(true);
  });
  it("makes repeated and absent-session logout idempotent without touching unrelated sessions", async () => {
    const f = await fixture(), first = await f.login("ADMIN"), firstSession = f.created.at(-1)!;
    const second = await f.login("ADMIN"), staff = await f.login("SALESPERSON"), before = f.persistent();
    await safeResponse(await f.logout("ADMIN", first), "ADMIN");
    const registry = stable(f.reader.all("SELECT * FROM auth_session_authorizations ORDER BY session_id"));
    await safeResponse(await f.logout("ADMIN", first), "ADMIN");
    await safeResponse(await f.logout("ADMIN", []), "ADMIN");
    expect(stable(f.reader.all("SELECT * FROM auth_session_authorizations ORDER BY session_id")) === registry).toBe(true);
    expect(f.reader.get("SELECT revoked_at_ms FROM auth_session_authorizations WHERE session_id=?", [firstSession.id])?.revoked_at_ms).toBe(BigInt(clock.wall));
    expect((await f.authorize("ADMIN", second)).role).toBe("ADMIN");
    expect((await f.authorize("SALESPERSON", staff)).role).toBe("SALESPERSON");
    expect(f.persistent() === before).toBe(true);
  });

  it("ignores caller identities and foreign-role cookies and rejects wrong origins or hosts", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), staff = await f.login("SALESPERSON");
    const before = stable(f.reader.all("SELECT * FROM auth_session_authorizations ORDER BY session_id"));
    await denied(f.gateway.logoutAdmin(f.request("SALESPERSON", staff)));
    const wrongOrigin = f.request("ADMIN", admin); wrongOrigin.headers.set("origin", f.config.origins.SALESPERSON);
    await denied(f.gateway.logoutAdmin(wrongOrigin));
    const wrongHost = f.request("ADMIN", admin); wrongHost.headers.set("host", "foreign.invalid");
    await denied(f.gateway.logoutAdmin(wrongHost));
    for (const cookies of [staff, staff.map(cookie => cookie.replace("pos-salesperson.", "pos-admin.")), []]) {
      const request = new Request(f.config.origins.ADMIN + "/private-test?role=SALESPERSON&sessionId=untrusted", {
        method: "POST", headers: { cookie: cookies.map(value => value.split(";")[0]).join("; "),
          "x-role": "SALESPERSON", "x-session-id": f.created.at(-1)!.id },
        body: JSON.stringify({ role: "SALESPERSON", sessionId: f.created.at(-1)!.id, account: "SALESPERSON" }),
      });
      await safeResponse(await f.gateway.logoutAdmin(request), "ADMIN");
    }
    expect(stable(f.reader.all("SELECT * FROM auth_session_authorizations ORDER BY session_id")) === before).toBe(true);
    await f.authorize("ADMIN", admin); await f.authorize("SALESPERSON", staff);
  });
  it("keeps SQL revocation decisive when framework deletion and exact RAM deletion both fail", async () => {
    const f = await fixture(), first = await f.login("ADMIN"), target = f.created.at(-1)!;
    const other = await f.login("ADMIN"), staff = await f.login("SALESPERSON");
    vi.spyOn(f.contexts.ADMIN.internalAdapter, "deleteSession").mockRejectedValue(new Error("TEST RAM cleanup failure"));
    probe.failDeleteKey = target.token;
    await safeResponse(await f.logout("ADMIN", first), "ADMIN");
    expect(await f.contexts.ADMIN.internalAdapter.findSession(target.token) !== null).toBe(true);
    expect(await observed.auth.at(-2)!.api.getSession({ headers: f.request("ADMIN", first).headers,
      query: { disableCookieCache: true, disableRefresh: true } }) !== null).toBe(true);
    await denied(f.authorize("ADMIN", first));
    await safeResponse(await f.logout("ADMIN", first), "ADMIN"); // Already-revoked live RAM is still idempotent.
    await f.authorize("ADMIN", other); await f.authorize("SALESPERSON", staff);
  });
  it("uses targeted RAM deletion fallback without revoking another session", async () => {
    const f = await fixture(), targetCookies = await f.login("SALESPERSON"), target = f.created.at(-1)!;
    const other = await f.login("SALESPERSON");
    vi.spyOn(f.contexts.SALESPERSON.internalAdapter, "deleteSession").mockRejectedValue(new Error("TEST adapter deletion failure"));
    await safeResponse(await f.logout("SALESPERSON", targetCookies), "SALESPERSON");
    expect(await f.contexts.SALESPERSON.internalAdapter.findSession(target.token) === null).toBe(true);
    await denied(f.authorize("SALESPERSON", targetCookies)); await f.authorize("SALESPERSON", other);
  });
  it("cleans only the verified RAM session when its SQL grant is already absent", async () => {
    const f = await fixture(), cookies = await f.login("ADMIN"), target = f.created.at(-1)!;
    f.reader.transaction(tx => tx.run("DELETE FROM auth_session_authorizations WHERE session_id=?", [target.id]));
    await safeResponse(await f.logout("ADMIN", cookies), "ADMIN");
    expect(f.registered()).toBe(zero);
    expect(await f.contexts.ADMIN.internalAdapter.findSession(target.token) === null).toBe(true);
    await denied(f.authorize("ADMIN", cookies));
  });
  it("can revoke an obsolete session after an authoritative credential epoch change", async () => {
    const f = await fixture(), cookies = await f.login("SALESPERSON"), before = f.persistent();
    f.reader.transaction(tx => tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='SALESPERSON'"));
    const changed = f.persistent(); expect(changed === before).toBe(false);
    await denied(f.authorize("SALESPERSON", cookies));
    await safeResponse(await f.logout("SALESPERSON", cookies), "SALESPERSON");
    expect(f.persistent() === changed).toBe(true);
    expect(f.reader.get("SELECT revoked_at_ms FROM auth_session_authorizations")?.revoked_at_ms).toBe(BigInt(clock.wall));
  });
  it.each(["principal", "version", "boot"] as const)("fails closed on corrupt %s registration without revoking another identity", async fault => {
    const f = await fixture(), cookies = await f.login("ADMIN"), target = f.created.at(-1)!;
    f.reader.transaction(tx => {
      if (fault === "principal") tx.run("UPDATE auth_session_authorizations SET principal_id='SALESPERSON'");
      if (fault === "version") tx.run("UPDATE auth_session_authorizations SET credential_version=credential_version+1");
      if (fault === "boot") tx.run("UPDATE auth_session_authorizations SET boot_generation=?", ["0".repeat(36)]);
    });
    await denied(f.logout("ADMIN", cookies));
    expect(f.reader.get("SELECT revoked_at_ms FROM auth_session_authorizations WHERE session_id=?", [target.id])?.revoked_at_ms).toBe(null);
    await denied(f.authorize("ADMIN", cookies)); await denied(f.gateway.verifyAdminPassword(passwords.ADMIN));
  });
  it("quarantines on SQL revocation failure, reports no success and preserves existing records", async () => {
    const f = await fixture(), cookies = await f.login("ADMIN"), before = f.persistent(), native = f.owner.run;
    vi.spyOn(f.owner, "run").mockImplementation((sql, values) => {
      if (sql.startsWith("UPDATE auth_session_authorizations SET revoked_at_ms")) throw new Error("TEST SQL write failure");
      return native(sql, values);
    });
    await denied(f.logout("ADMIN", cookies));
    expect(f.reader.get("SELECT revoked_at_ms FROM auth_session_authorizations")?.revoked_at_ms).toBe(null);
    expect(f.persistent() === before).toBe(true);
    await denied(f.authorize("ADMIN", cookies)); await denied(f.gateway.verifyAdminPassword(passwords.ADMIN));
  });
  it("handles a REAL SQLite COMMIT failure with rollback and owner quarantine even when RAM survives", async () => {
    const f = await fixture(), cookies = await f.login("ADMIN"), target = f.created.at(-1)!;
    const before = f.persistent(), native = f.owner.run; let injected = false;
    vi.spyOn(f.owner, "run").mockImplementation((sql, values) => {
      const result = native(sql, values);
      if (sql.startsWith("UPDATE auth_session_authorizations SET revoked_at_ms")) {
        native("INSERT INTO test_commit_guard(parent) VALUES(?)", ["MISSING"]); injected = true;
      }
      return result;
    });
    probe.failClear = true;
    await denied(f.logout("ADMIN", cookies));
    expect(injected).toBe(true); expect(f.owner.inTransaction()).toBe(false);
    expect(f.reader.get("SELECT revoked_at_ms FROM auth_session_authorizations")?.revoked_at_ms).toBe(null);
    expect(f.persistent() === before).toBe(true);
    expect(await f.contexts.ADMIN.internalAdapter.findSession(target.token) !== null).toBe(true);
    await denied(f.authorize("ADMIN", cookies)); await denied(f.gateway.verifyAdminPassword(passwords.ADMIN));
  });
  it("does not claim success when acknowledgment fails after a committed revocation", async () => {
    const f = await fixture(), cookies = await f.login("SALESPERSON");
    probe.afterCommit = async () => { throw new Error("TEST revocation acknowledgment failure"); };
    probe.failClear = true;
    await denied(f.logout("SALESPERSON", cookies));
    expect(f.reader.get("SELECT revoked_at_ms FROM auth_session_authorizations")?.revoked_at_ms).toBe(BigInt(clock.wall));
    await denied(f.authorize("SALESPERSON", cookies));
  });
  it("denies unavailable registry SQL even for absent cookies", async () => {
    const f = await fixture(), native = f.owner.get;
    vi.spyOn(f.owner, "get").mockImplementation((sql, values) => {
      if (sql.includes("FROM auth_session_authorizations")) throw new Error("TEST registry unavailable");
      return native(sql, values);
    });
    await denied(f.logout("ADMIN", [])); await denied(f.gateway.verifyAdminPassword(passwords.ADMIN));
  });
  it("fails closed on real missing registry schema and on failed framework lookup", async () => {
    const f = await fixture(), cookies = await f.login("ADMIN");
    const require = createRequire(import.meta.url);
    const Native = require("better-sqlite3") as new (filename: string) => { exec(sql: string): void; close(): void };
    const broken = new Native(path.join(f.config.database.directory!, f.config.database.filename!));
    try { broken.exec("DROP TABLE auth_session_authorizations"); } finally { broken.close(); }
    await denied(f.logout("ADMIN", cookies)); await denied(f.authorize("ADMIN", cookies));
    await f.gateway.close();
    const g = await fixture(), staff = await g.login("SALESPERSON");
    vi.spyOn(g.contexts.SALESPERSON.internalAdapter, "findSession").mockRejectedValue(new Error("TEST RAM lookup failure"));
    await denied(g.logout("SALESPERSON", staff));
    expect(g.reader.get("SELECT revoked_at_ms FROM auth_session_authorizations")?.revoked_at_ms).toBe(null);
    await denied(g.authorize("SALESPERSON", staff));
  });
  it("cancels a pending receipt and requires fresh verification for a later role", async () => {
    const f = await fixture(), cookies = await f.login("ADMIN"), receipt = await f.verify("SALESPERSON");
    await safeResponse(await f.logout("ADMIN", cookies), "ADMIN");
    expect(receipt.signal.aborted).toBe(true);
    await denied(f.issue("SALESPERSON", receipt));
    const fresh = await f.login("SALESPERSON"); await f.authorize("SALESPERSON", fresh);
    await denied(f.authorize("ADMIN", cookies));
  });
  it("prevents in-flight native password verification from returning a receipt after logout", async () => {
    const f = await fixture(), cookies = await f.login("ADMIN"), gate = barrier();
    const actual = f.contexts.SALESPERSON.password.verify;
    vi.spyOn(f.contexts.SALESPERSON.password, "verify").mockImplementation(async input => {
      const result = await actual(input); await gate.wait(); return result;
    });
    const pending = denied(f.verify("SALESPERSON")); await gate.ready;
    await safeResponse(await f.logout("ADMIN", cookies), "ADMIN");
    gate.release(); await pending;
    expect(f.created.length).toBe(1); await denied(f.issue("SALESPERSON", {}));
  });
  it("cancels queued issuance on logout and never publishes its staged cookie", async () => {
    const f = await fixture(), old = await f.login("ADMIN"), receipt = await f.verify("ADMIN"), gate = barrier();
    probe.afterCookies = gate.wait; let published = false;
    const issuing = denied(f.issue("ADMIN", receipt).then(value => { published = true; return value; }));
    await gate.ready;
    const logout = f.logout("ADMIN", old);
    gate.release(); probe.afterCookies = undefined;
    await issuing; await safeResponse(await logout, "ADMIN");
    expect(published).toBe(false); expect(f.created.length).toBe(2); expect(f.registered()).toBe(one);
    expect(f.reader.get("SELECT revoked_at_ms FROM auth_session_authorizations")?.revoked_at_ms).toBe(BigInt(clock.wall));
    await denied(f.authorize("ADMIN", old)); await denied(f.authorize("ADMIN", probe.staged.at(-1)!.cookies));
  });
  it("serializes admitted protected work before logout and denies queued authorization after it", async () => {
    const f = await fixture(), cookies = await f.login("ADMIN"), before = f.persistent(), gate = barrier();
    const protectedWork = f.gateway.withAdminTransaction(f.request("ADMIN", cookies), async tx => {
      await gate.wait(); return (await tx.get("SELECT count(*) AS n FROM test_commit_guard"))?.n;
    });
    await gate.ready;
    let finished = false;
    const logout = f.logout("ADMIN", cookies).then(response => { finished = true; return response; });
    const later = denied(f.authorize("ADMIN", cookies));
    expect(finished).toBe(false); expect(f.owner.inTransaction()).toBe(true);
    gate.release();
    expect(await protectedWork).toBe(one); await safeResponse(await logout, "ADMIN"); await later;
    expect(f.persistent() === before).toBe(true);
  });
  it("holds the writer through revocation COMMIT and publishes no early logout response", async () => {
    const f = await fixture(), cookies = await f.login("ADMIN"), gate = barrier();
    probe.beforeCommit = gate.wait; let published = false;
    const pending = f.logout("ADMIN", cookies).then(response => { published = true; return response; });
    await gate.ready;
    expect(published).toBe(false); expect(f.owner.inTransaction()).toBe(true);
    expect(f.reader.get("SELECT revoked_at_ms FROM auth_session_authorizations")?.revoked_at_ms).toBe(null);
    let blocked = false;
    try { f.reader.transaction(tx => tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id=\'ADMIN\'")); } catch { blocked = true; }
    expect(blocked).toBe(true);
    gate.release(); probe.beforeCommit = undefined;
    await safeResponse(await pending, "ADMIN"); expect(published).toBe(true);
    expect(f.reader.get("SELECT revoked_at_ms FROM auth_session_authorizations")?.revoked_at_ms).toBe(BigInt(clock.wall));
    await denied(f.authorize("ADMIN", cookies));
  });
  it("rejects nested and inherited logout without disrupting an outer transaction", async () => {
    const f = await fixture(), cookies = await f.login("ADMIN");
    await f.gateway.withAdminTransaction(f.request("ADMIN", cookies), async () => {
      await denied(f.logout("ADMIN", cookies)); expect(f.owner.inTransaction()).toBe(true);
    });
    await runWithTransaction(f.contexts.ADMIN.adapter, async () => {
      await denied(f.logout("ADMIN", cookies)); expect(f.owner.inTransaction()).toBe(true);
    });
    await runWithAdapter(f.contexts.SALESPERSON.adapter, () => denied(f.logout("ADMIN", cookies)));
    expect(f.owner.inTransaction()).toBe(false);
    expect((await f.authorize("ADMIN", cookies)).role).toBe("ADMIN");
  });
  it("drains logout on shutdown and invalidates both roles on reopen without resetting records", async () => {
    const f = await fixture(), admin = await f.login("ADMIN"), staff = await f.login("SALESPERSON"), before = f.persistent();
    const actual = f.contexts.ADMIN.internalAdapter.deleteSession, gate = barrier();
    vi.spyOn(f.contexts.ADMIN.internalAdapter, "deleteSession").mockImplementation(async token => { await gate.wait(); await actual(token); });
    const pending = f.logout("ADMIN", admin); await gate.ready;
    let closed = false; const closing = f.gateway.close().then(() => { closed = true; });
    await denied(f.logout("SALESPERSON", staff)); await denied(f.authorize("SALESPERSON", staff));
    expect(closed).toBe(false);
    gate.release(); await safeResponse(await pending, "ADMIN"); await closing;
    expect(closed).toBe(true); expect(f.persistent() === before).toBe(true);
    const reopened = await openAuthorizationGateway(f.config); gateways.push(reopened);
    await denied(reopened.authorizeAdmin(f.request("ADMIN", admin)));
    await denied(reopened.authorizeSalesperson(f.request("SALESPERSON", staff)));
    expect(f.persistent() === before).toBe(true); expect(f.registered()).toBe(BigInt(2));
  });
  it("treats expired sessions as unauthenticated and never revokes a different fresh session", async () => {
    const f = await fixture(), expired = await f.login("ADMIN");
    advance(120_000); const staff = await f.login("SALESPERSON");
    await safeResponse(await f.logout("ADMIN", expired), "ADMIN");
    await denied(f.authorize("ADMIN", expired)); await f.authorize("SALESPERSON", staff);
    expect(f.reader.all("SELECT revoked_at_ms FROM auth_session_authorizations").every(row => row.revoked_at_ms === null)).toBe(true);
  });
  it("keeps raw APIs and credentials out of capabilities, JSON, errors and logs", async () => {
    const logs: unknown[][] = [];
    for (const name of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, name).mockImplementation((...args) => { logs.push(args); });
    const f = await fixture(), cookies = await f.login("ADMIN"), before = f.persistent();
    await safeResponse(await f.logout("ADMIN", cookies), "ADMIN");
    await denied(f.authorize("ADMIN", cookies));
    expect(logs.length).toBe(0); expect(contains(stable(logs))).toBe(false);
    expect(["handler", "api", "$context", "adapter", "db", "storage", "token"].some(key => key in f.gateway)).toBe(false);
    expect(contains(JSON.stringify(f.gateway))).toBe(false);
    expect(f.persistent() === before).toBe(true);
    const disabled = await openAuthorizationGateway(); await denied(disabled.logoutAdmin(f.request("ADMIN", cookies)));
    await disabled.close();
  });
});
