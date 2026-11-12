import { randomBytes } from "node:crypto";
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
  failClear: false, release: undefined as (() => void) | undefined,
  afterCookies: undefined as (() => Promise<void>) | undefined,
  afterCommit: undefined as (() => Promise<void>) | undefined,
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
    return { storage: store.storage, clear() { if (probe.failClear) throw new Error("TEST RAM clear fault"); store.clear(); } };
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
    const value = await actual.runWithTransaction(...args);
    const hook = probe.afterCommit; probe.afterCommit = undefined;
    if (hook) await hook();
    return value;
  } };
});
const roles = ["ADMIN", "SALESPERSON"] as const, one = BigInt(1), zero = BigInt(0);
const root = path.resolve("test-results/sqlite-b1b-part1"); mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "sessions3j-"));
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
  const persistent = () => stable(Object.fromEntries(["auth_users", "auth_credentials", "auth_principals", "auth_provisioning", "schema_migrations"]
    .map(table => [table, reader.all("SELECT * FROM " + table)])));
  audits.push(() => {
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = path.join(directory, options.filename) + suffix; if (suffix && !existsSync(file)) continue;
      expect([...forbidden].some(secret => readFileSync(file).toString("latin1").includes(secret))).toBe(false);
    }
  });
  return { gateway, owner, reader, contexts, created, config, verify, issue, registered, request, authorize, persistent };
}
function failCommit(f: Awaited<ReturnType<typeof fixture>>, failCompensation = false) {
  const native = f.owner.run; let injected = false;
  vi.spyOn(f.owner, "run").mockImplementation((sql, values) => {
    if (failCompensation && sql.startsWith("UPDATE auth_session_authorizations SET revoked_at_ms")) throw new Error("TEST SQL compensation fault");
    const result = native(sql, values);
    if (sql.startsWith("INSERT INTO auth_session_authorizations")) {
      native("INSERT INTO test_commit_guard(parent) VALUES(?)", ["MISSING"]); injected = true;
    }
    return result;
  });
  return () => injected;
}
beforeAll(async () => { for (const role of roles) { passwords[role] = fake(); hashes[role] = await passwordCallbacks.hash(passwords[role]); sensitive.add(hashes[role]); } });
beforeEach(() => {
  clock.wall = 1762800000000; clock.monotonic = 1000; probe.staged = [];
  probe.afterCookies = undefined; probe.afterCommit = undefined; probe.failClear = false;
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(clock.wall);
});
afterEach(async () => {
  probe.release?.(); probe.release = undefined; probe.afterCookies = undefined; probe.afterCommit = undefined; probe.failClear = false;
  vi.useRealTimers(); vi.restoreAllMocks();
  for (const gateway of gateways.splice(0)) await gateway.close();
  for (const reader of readers.splice(0)) reader.close();
  for (const audit of audits.splice(0)) audit();
});
describe("Part3J controlled private RAM-session issuance", () => {
  it("issues both roles through actual Better Auth and authorizes their real signed cookies", async () => {
    const f = await fixture(), before = f.persistent();
    for (const role of roles) {
      const receipt = await f.verify(role), response = await f.issue(role, receipt);
      expect(receipt.signal.aborted).toBe(true); expect(response.status).toBe(200);
      const cookies = response.headers.getSetCookie();
      expect(cookies.length).toBe(2);
      expect(cookies.every(cookie => /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite=Strict/i.test(cookie))).toBe(true);
      expect(cookies.every(cookie => !/Max-Age=|Expires=|Domain=/i.test(cookie))).toBe(true);
      expect(cookies.some(cookie => cookie.startsWith(role === "ADMIN" ? "__Secure-pos-admin." : "__Secure-pos-salesperson."))).toBe(true);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe('{"ok":true}');
      const actor = await f.authorize(role, cookies); expect(actor.role).toBe(role);
      expect(contains(JSON.stringify(actor))).toBe(false);
      expect(f.created.at(-1)!.id !== f.created.at(-1)!.token).toBe(true);
    }
    expect(f.registered()).toBe(BigInt(2)); expect(f.persistent() === before).toBe(true);
    expect(contains(JSON.stringify(f.gateway))).toBe(false);
  });
  it("keeps Salesperson cookies, receipts and signatures out of Admin authority", async () => {
    const f = await fixture(), receipt = await f.verify("SALESPERSON");
    await denied(f.issue("ADMIN", receipt)); await denied(f.issue("SALESPERSON", receipt));
    expect(f.created.length).toBe(0);
    const response = await f.issue("SALESPERSON", await f.verify("SALESPERSON")), cookies = response.headers.getSetCookie();
    await denied(f.authorize("ADMIN", cookies));
    await denied(f.authorize("ADMIN", cookies.map(value => value.replace("pos-salesperson.", "pos-admin."))));
    expect((await f.authorize("SALESPERSON", cookies)).role).toBe("SALESPERSON");
  });
  it("rejects forged and serialized receipts without reading hostile getters or issuing sessions", async () => {
    const f = await fixture(); let read = false;
    for (const value of [undefined, null, {}, { signal: new AbortController().signal },
      { get signal() { read = true; throw new Error("TEST getter"); } }]) await denied(f.issue("ADMIN", value));
    const receipt = await f.verify("ADMIN");
    await denied(f.issue("ADMIN", JSON.parse(JSON.stringify(receipt))));
    expect(read).toBe(false); expect(f.created.length).toBe(0);
    expect((await f.issue("ADMIN", receipt)).status).toBe(200);
  });
  it("rejects aborted, expired and reused genuine receipts with single-use consumption", async () => {
    const f = await fixture(), old = await f.verify("ADMIN"), fresh = await f.verify("ADMIN");
    expect(old.signal.aborted).toBe(true); await denied(f.issue("ADMIN", old));
    advance(5000); expect(fresh.signal.aborted).toBe(false); // Timer not delivered; deadline is authoritative.
    await denied(f.issue("ADMIN", fresh)); await denied(f.issue("ADMIN", fresh));
    const receipt = await f.verify("ADMIN"); await f.issue("ADMIN", receipt);
    await denied(f.issue("ADMIN", receipt)); expect(f.created.length).toBe(1);
  });
  it("rechecks provisioning, credentials, versions, epochs and active status before registration", async () => {
    for (const mutation of ["latch", "credential", "version", "epoch", "hash", "active"] as const) {
      const f = await fixture(), receipt = await f.verify("SALESPERSON");
      f.reader.transaction(tx => {
        if (mutation === "latch") tx.run("DELETE FROM auth_provisioning");
        if (mutation === "credential") tx.run("DELETE FROM auth_credentials WHERE userId='SALESPERSON'");
        if (mutation === "version") tx.run("UPDATE auth_principals SET credential_version=credential_version+1 WHERE id='SALESPERSON'");
        if (mutation === "epoch") tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='SALESPERSON'");
        if (mutation === "hash") tx.run("UPDATE auth_credentials SET password=? WHERE userId='SALESPERSON'", [hashes.ADMIN]);
        if (mutation === "active") tx.run("UPDATE auth_principals SET active=0 WHERE id='SALESPERSON'");
      });
      await denied(f.issue("SALESPERSON", receipt)); await denied(f.issue("SALESPERSON", receipt));
      expect(f.created.length).toBe(0); expect(f.registered()).toBe(zero); await f.gateway.close();
    }
  });
  it("excludes independent revocation while issuing and enforces later SQL revocation immediately", async () => {
    const f = await fixture(), receipt = await f.verify("ADMIN"), gate = barrier(); probe.afterCookies = gate.wait;
    const pending = f.issue("ADMIN", receipt); await gate.ready;
    let blocked = false;
    try { f.reader.transaction(tx => tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='ADMIN'")); } catch { blocked = true; }
    expect(blocked).toBe(true); expect(f.registered()).toBe(zero);
    gate.release(); probe.afterCookies = undefined; const response = await pending;
    const cookies = response.headers.getSetCookie(); await f.authorize("ADMIN", cookies);
    f.reader.transaction(tx => tx.run("UPDATE auth_session_authorizations SET revoked_at_ms=created_at_ms"));
    await denied(f.authorize("ADMIN", cookies));
  });
  it("rolls back a version change inside issuance rather than publishing stale authorization", async () => {
    const f = await fixture(), receipt = await f.verify("SALESPERSON");
    probe.afterCookies = async () => { f.owner.run("UPDATE auth_principals SET credential_version=credential_version+1 WHERE id='SALESPERSON'"); };
    await denied(f.issue("SALESPERSON", receipt)); expect(f.registered()).toBe(zero);
    expect(f.reader.get("SELECT credential_version FROM auth_principals WHERE id='SALESPERSON'")?.credential_version).toBe(one);
    await denied(f.authorize("SALESPERSON", probe.staged.at(-1)!.cookies));
  });
  it("does not publish a cookie before COMMIT and rejects simultaneous issuance/verification", async () => {
    const f = await fixture(), receipt = await f.verify("ADMIN"), gate = barrier(); probe.afterCookies = gate.wait;
    let published = false; const pending = f.issue("ADMIN", receipt).then(value => { published = true; return value; }); await gate.ready;
    expect(probe.staged.length).toBe(1); expect(published).toBe(false); expect(f.registered()).toBe(zero);
    await denied(f.issue("ADMIN", receipt)); await denied(f.gateway.verifySalespersonPassword(passwords.SALESPERSON));
    gate.release(); probe.afterCookies = undefined; const response = await pending;
    expect(published).toBe(true); expect(f.registered()).toBe(one); expect(f.owner.inTransaction()).toBe(false);
    await f.authorize("ADMIN", response.headers.getSetCookie());
  });
  it("rejects nested issuance without disturbing an existing protected transaction", async () => {
    const f = await fixture(), response = await f.issue("ADMIN", await f.verify("ADMIN"));
    const cookies = response.headers.getSetCookie(), receipt = await f.verify("ADMIN");
    await f.gateway.withAdminTransaction(f.request("ADMIN", cookies), async () => {
      await denied(f.issue("ADMIN", receipt)); expect(f.owner.inTransaction()).toBe(true);
    });
    await denied(f.issue("ADMIN", receipt)); expect(f.registered()).toBe(one);
    expect((await f.authorize("ADMIN", cookies)).role).toBe("ADMIN");
  });
  it("rejects inherited framework contexts and preserves an outer native transaction", async () => {
    const f = await fixture(), first = await f.verify("ADMIN");
    await runWithTransaction(f.contexts.ADMIN.adapter, async () => {
      expect(f.owner.inTransaction()).toBe(true);
      await denied(f.issue("ADMIN", first)); expect(f.owner.inTransaction()).toBe(true);
    });
    const second = await f.verify("ADMIN");
    await runWithAdapter(f.contexts.SALESPERSON.adapter, () => denied(f.issue("ADMIN", second)));
    expect(f.owner.inTransaction()).toBe(false); expect(f.created.length).toBe(0);
    await denied(f.issue("ADMIN", first)); await denied(f.issue("ADMIN", second));
    expect((await f.issue("ADMIN", await f.verify("ADMIN"))).status).toBe(200);
  });
  it("burns receipts and cleans RAM after registration SQL failure", async () => {
    const f = await fixture(), receipt = await f.verify("ADMIN"), native = f.owner.run;
    const spy = vi.spyOn(f.owner, "run").mockImplementation((sql, values) => {
      if (sql.startsWith("INSERT INTO auth_session_authorizations")) throw new Error("TEST registration fault");
      return native(sql, values);
    });
    await denied(f.issue("ADMIN", receipt)); spy.mockRestore();
    expect(f.registered()).toBe(zero); expect(f.created.length).toBe(1);
    expect(await f.contexts.ADMIN.internalAdapter.findSession(f.created[0].token) === null).toBe(true);
    await denied(f.issue("ADMIN", receipt)); expect((await f.issue("ADMIN", await f.verify("ADMIN"))).status).toBe(200);
  });
  it("handles a REAL SQLite deferred-FK COMMIT failure without publishing staged cookies", async () => {
    const f = await fixture(), receipt = await f.verify("ADMIN"), injected = failCommit(f);
    await denied(f.issue("ADMIN", receipt));
    expect(injected()).toBe(true); expect(probe.staged.length).toBe(1);
    expect(f.registered()).toBe(zero); expect(f.reader.get("SELECT count(*) AS n FROM test_commit_guard")?.n).toBe(zero);
    expect(f.owner.inTransaction()).toBe(false); await denied(f.issue("ADMIN", receipt));
    await denied(f.authorize("ADMIN", probe.staged[0].cookies));
  });
  it("denies surviving RAM sessions when COMMIT and BOTH RAM cleanup mechanisms fail", async () => {
    const f = await fixture(), receipt = await f.verify("ADMIN"); failCommit(f);
    vi.spyOn(f.contexts.ADMIN.internalAdapter, "deleteSession").mockRejectedValue(new Error("TEST RAM deletion fault"));
    probe.failClear = true; await denied(f.issue("ADMIN", receipt));
    expect(f.registered()).toBe(zero);
    expect(await f.contexts.ADMIN.internalAdapter.findSession(f.created[0].token) !== null).toBe(true);
    await denied(f.authorize("ADMIN", probe.staged[0].cookies)); await denied(f.issue("ADMIN", receipt));
  });
  it("revokes committed registration if acknowledgment fails, even with surviving RAM", async () => {
    const f = await fixture(), receipt = await f.verify("ADMIN");
    probe.afterCommit = async () => { throw new Error("TEST post-COMMIT acknowledgment fault"); };
    vi.spyOn(f.contexts.ADMIN.internalAdapter, "deleteSession").mockRejectedValue(new Error("TEST RAM deletion fault"));
    probe.failClear = true; await denied(f.issue("ADMIN", receipt));
    expect(f.registered()).toBe(one);
    expect(f.reader.get("SELECT revoked_at_ms IS NOT NULL AS revoked FROM auth_session_authorizations")?.revoked).toBe(one);
    expect(await f.contexts.ADMIN.internalAdapter.findSession(f.created[0].token) !== null).toBe(true);
    await denied(f.authorize("ADMIN", probe.staged[0].cookies)); await denied(f.issue("ADMIN", receipt));
  });
  it("closes the owner on uncertain SQL compensation instead of granting surviving RAM access", async () => {
    const f = await fixture(), receipt = await f.verify("ADMIN"); failCommit(f, true);
    vi.spyOn(f.contexts.ADMIN.internalAdapter, "deleteSession").mockRejectedValue(new Error("TEST RAM fault"));
    probe.failClear = true; await denied(f.issue("ADMIN", receipt));
    await denied(f.authorize("ADMIN", probe.staged[0].cookies)); await denied(f.gateway.verifyAdminPassword(passwords.ADMIN));
  });
  it("fails closed on missing SQL, malformed clocks and cookie-signing failure", async () => {
    const f = await fixture(), receipt = await f.verify("ADMIN");
    const spy = vi.spyOn(f.owner, "get").mockImplementation(() => { throw new Error("TEST SQL unavailable"); });
    await denied(f.issue("ADMIN", receipt)); spy.mockRestore(); expect(f.created.length).toBe(0);
    const next = await f.verify("ADMIN"); clock.monotonic = NaN; await denied(f.issue("ADMIN", next)); clock.monotonic = 1000;
    const third = await f.verify("ADMIN");
    probe.afterCookies = async () => { throw new Error("TEST cookie staging failure"); };
    await denied(f.issue("ADMIN", third)); expect(f.registered()).toBe(zero);
  });
  it("enforces fixed expiry without refresh and restart invalidation without deleting account/history state", async () => {
    const f = await fixture(), before = f.persistent();
    f.config.sessionLifetimeSeconds = 86400; // Caller mutation must not change the opened owner lifetime.
    const response = await f.issue("ADMIN", await f.verify("ADMIN")), cookies = response.headers.getSetCookie();
    expect(f.reader.get("SELECT expires_at_ms-created_at_ms AS lifetime FROM auth_session_authorizations")?.lifetime).toBe(BigInt(120_000));
    await f.authorize("ADMIN", cookies); advance(120_000); await denied(f.authorize("ADMIN", cookies));
    const fresh = await f.issue("ADMIN", await f.verify("ADMIN")), freshCookies = fresh.headers.getSetCookie();
    await f.gateway.close();
    const reopened = await openAuthorizationGateway(f.config); gateways.push(reopened);
    await denied(reopened.authorizeAdmin(f.request("ADMIN", freshCookies)));
    expect(f.registered()).toBe(BigInt(2)); expect(f.persistent() === before).toBe(true);
  });
  it("drains shutdown during issuance and rejects an unpublished result", async () => {
    const f = await fixture(), receipt = await f.verify("ADMIN"), gate = barrier(); probe.afterCookies = gate.wait;
    const pending = denied(f.issue("ADMIN", receipt)); await gate.ready;
    let closed = false; const closing = f.gateway.close().then(() => { closed = true; });
    await Promise.resolve(); expect(closed).toBe(false);
    await denied(f.gateway.issueAdminSession(receipt)); gate.release(); probe.afterCookies = undefined;
    await pending; await closing; expect(closed).toBe(true); expect(f.registered()).toBe(zero);
  });
  it("keeps secrets out of ordinary JSON/errors/logs and exposes only deny-only issuance without configuration", async () => {
    const logs = (["log", "warn", "error", "info", "debug"] as const).map(name => vi.spyOn(console, name).mockImplementation(() => {}));
    const empty = await openAuthorizationGateway(); gateways.push(empty);
    await denied(empty.issueAdminSession({})); await denied(empty.issueSalespersonSession({}));
    const f = await fixture(), response = await f.issue("SALESPERSON", await f.verify("SALESPERSON"));
    expect(contains(await response.text())).toBe(false); expect(contains(JSON.stringify(response))).toBe(false);
    expect(logs.every(log => log.mock.calls.length === 0)).toBe(true);
    const forbiddenExports = ["api", "handler", "context", "adapter", "token", "session"];
    expect(forbiddenExports.some(name => Object.hasOwn(f.gateway, name))).toBe(false);
  });
});
