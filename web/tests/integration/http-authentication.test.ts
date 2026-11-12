import { createHash, randomBytes, X509Certificate } from "node:crypto";
import { chromium, type Browser } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import https from "node:https";
import net from "node:net";
import type { IncomingHttpHeaders } from "node:http";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthorizationGateway, Role } from "../../src/server/auth/types";
import { runTrustedFirstRunSetup } from "../../src/server/auth/provision";
import { openDatabase, type SqliteConnection } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { startLocalRuntime, type LocalRuntime, type LocalRuntimeConfiguration } from "../../src/server/hosting/runtime";
import { confinedTestAuthentication } from "../../src/server/hosting/auth-http";
type Owner = ReturnType<typeof import("../../src/server/auth/database").openAsyncOwner>;
const observed = vi.hoisted(() => ({ gateways: [] as AuthorizationGateway[], owners: [] as Owner[] }));
const clock = vi.hoisted(() => ({ offset: 0 }));
const probe = vi.hoisted(() => ({
  afterCookies: undefined as (() => Promise<void>) | undefined, afterCommit: undefined as (() => Promise<void>) | undefined,
  afterAuthorization: undefined as (() => Promise<void>) | undefined,
  logoutEntered: undefined as (() => void) | undefined, failRegistration: false, failRevocation: false,
  nativeDefer: undefined as ((complete: () => void) => void) | undefined,
  releases: [] as (() => void)[], nativeCalls: 0, nativeActive: 0, nativeMax: 0,
  staged: [] as { role: string; cookies: string[]; token: string }[],
}));
// Passthrough observation and explicit barriers/faults only; positive behavior is real.
vi.mock("../../src/server/auth/gateway", async original => {
  const actual = await original<typeof import("../../src/server/auth/gateway")>();
  return { ...actual, openAuthorizationGateway: async (...args: Parameters<typeof actual.openAuthorizationGateway>) => {
    const gateway = await actual.openAuthorizationGateway(...args); observed.gateways.push(gateway);
    return Object.freeze({ ...gateway,
      authorizeAdmin: async (request: Request) => { const actor = await gateway.authorizeAdmin(request); await probe.afterAuthorization?.(); return actor; },
      authorizeSalesperson: async (request: Request) => { const actor = await gateway.authorizeSalesperson(request); await probe.afterAuthorization?.(); return actor; },
      logoutAdmin: (request: Request) => { probe.logoutEntered?.(); return gateway.logoutAdmin(request); },
      logoutSalesperson: (request: Request) => { probe.logoutEntered?.(); return gateway.logoutSalesperson(request); },
    });
  } };
});
vi.mock("../../src/server/auth/database", async original => {
  const actual = await original<typeof import("../../src/server/auth/database")>();
  return { ...actual, openAsyncOwner: (...args: Parameters<typeof actual.openAsyncOwner>) => {
    const owner = actual.openAsyncOwner(...args); observed.owners.push(owner); return owner;
  } };
});
vi.mock("node:perf_hooks", async original => {
  const actual = await original<typeof import("node:perf_hooks")>();
  return { ...actual, performance: { now: () => actual.performance.now() + clock.offset } };
});
vi.mock("node:crypto", async original => {
  const actual = await original<typeof import("node:crypto")>();
  return { ...actual, scrypt: (...args: unknown[]) => {
    probe.nativeCalls++; probe.nativeActive++; probe.nativeMax = Math.max(probe.nativeMax, probe.nativeActive);
    const callback = args.pop() as (error: Error | null, key: Buffer) => void;
    (actual.scrypt as (...values: unknown[]) => void)(...args, (error: Error | null, key: Buffer) => {
      const done = () => { probe.nativeActive--; callback(error, key); };
      if (probe.nativeDefer) probe.nativeDefer(done); else done();
    });
  } };
});
vi.mock("better-auth/cookies", async original => {
  const actual = await original<typeof import("better-auth/cookies")>();
  return { ...actual, setSessionCookie: async (...args: Parameters<typeof actual.setSessionCookie>) => {
    await actual.setSessionCookie(...args);
    const staged = { role: args[1].session.userId, cookies: args[0].responseHeaders.getSetCookie(), token: args[1].session.token };
    probe.staged.push(staged); sensitive.add(staged.token); persistentForbidden.add(staged.token);
    await probe.afterCookies?.();
  } };
});
vi.mock("@better-auth/core/context", async original => {
  const actual = await original<typeof import("@better-auth/core/context")>();
  return { ...actual, runWithTransaction: async (...args: Parameters<typeof actual.runWithTransaction>) => {
    const result = await actual.runWithTransaction(args[0], async () => {
      const value = await args[1](), owner = observed.owners.at(-1);
      if (owner?.inTransaction() && (probe.failRegistration || probe.failRevocation) &&
          owner.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n !== BigInt(0)) {
        probe.failRegistration = false; probe.failRevocation = false;
        // REAL native UNIQUE failure inside official transaction after pending
        // registration/revocation; no new TEST/production migration or schema.
        owner.run("INSERT INTO auth_session_authorizations SELECT * FROM auth_session_authorizations LIMIT 1");
      }
      return value;
    });
    const hook = probe.afterCommit; probe.afterCommit = undefined; await hook?.(); return result;
  } };
});
const execute = promisify(execFile), root = path.resolve("test-results/sqlite-b1b-part1");
mkdirSync(root, { recursive: true }); const run = mkdtempSync(path.join(root, "http3p-"));
const fixtureApp = process.env.SHOP_POS_HTTP_BUILT_APP ?? path.join(run, "next-app");
const baseDirectory = path.join(run, "base"), certDirectory = path.join(run, "tls"), migrationsDirectory = path.resolve("src/server/db/migrations");
const roles = ["ADMIN", "SALESPERSON"] as const;
const passwords = { ADMIN: " " + randomBytes(12).toString("base64url") + "\u00e9  ", SALESPERSON: randomBytes(12).toString("base64url") };
const sensitive = new Set(Object.values(passwords)), persistentForbidden = new Set(Object.values(passwords)), privateKeys = new Set<string>();
const runtimes: LocalRuntime[] = [], readers: SqliteConnection[] = [], audits: (() => void)[] = [];
const browsers: Browser[] = [];
let material: LocalRuntimeConfiguration["tls"];
const stable = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v);
const contains = (value: string) => [...sensitive, ...privateKeys].some(secret => value.includes(secret));
const cookieHeader = (cookies: readonly string[]) => cookies.map(cookie => cookie.split(";")[0]).join("; ");
async function freePort() {
  const server = net.createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("TEST port missing");
  await new Promise<void>(resolve => server.close(() => resolve())); return address.port;
}
function barrier() {
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; }); probe.releases.push(release);
  return { ready, release, wait: async () => { entered(); await gate; } };
}
function holdNative() {
  let entered!: () => void; const ready = new Promise<void>(resolve => { entered = resolve; });
  probe.nativeDefer = done => { probe.releases.push(done); entered(); };
  return { ready, release: () => { probe.nativeDefer = undefined; for (const done of probe.releases.splice(0)) done(); } };
}
async function fixture(seed = true) {
  const directory = mkdtempSync(path.join(run, "db-"));
  if (seed) copyFileSync(path.join(baseDirectory, "test.sqlite3"), path.join(directory, "test.sqlite3"));
  const reader = openDatabase({ directory, filename: "test.sqlite3", mode: "test", create: !seed, busyTimeoutMs: 75 }); readers.push(reader);
  if (!seed) applyMigrations(reader, migrationsDirectory);
  const port = await freePort(), signingSecrets = { ADMIN: randomBytes(48).toString("base64url"), SALESPERSON: randomBytes(48).toString("base64url") };
  for (const secret of Object.values(signingSecrets)) { sensitive.add(secret); persistentForbidden.add(secret); }
  const config: LocalRuntimeConfiguration = { applicationDirectory: fixtureApp, port, tls: material, authorization: {
    database: { directory, filename: "test.sqlite3", mode: "test", create: false, busyTimeoutMs: 75 }, migrationsDirectory,
    origins: { ADMIN: "https://localhost:" + port, SALESPERSON: "https://127.0.0.1:" + port },
    signingSecrets, sessionLifetimeSeconds: 120,
  } };
  const start = async () => {
    const count = observed.owners.length, runtime = await startLocalRuntime(config); runtimes.push(runtime);
    expect(observed.owners.length - count).toBe(1);
    return { runtime, gateway: observed.gateways.at(-1)!, owner: observed.owners.at(-1)! };
  };
  const persistent = () => stable(Object.fromEntries(["auth_users", "auth_credentials", "auth_principals", "auth_provisioning",
    "schema_migrations", ...(seed ? ["test_runtime_sentinel"] : [])].map(table => [table, reader.all("SELECT * FROM " + table)])));
  const before = persistent(), registered = () => reader.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n;
  const authorize = (gateway: AuthorizationGateway, role: Role, cookies: readonly string[]) => {
    const request = new Request(config.authorization.origins[role] + "/protected-test", { headers: { cookie: cookieHeader(cookies), origin: config.authorization.origins[role] } });
    return role === "ADMIN" ? gateway.authorizeAdmin(request) : gateway.authorizeSalesperson(request);
  };
  audits.push(() => {
    for (const suffix of ["", "-wal", "-shm"]) {
      const filename = path.join(directory, "test.sqlite3") + suffix;
      if (existsSync(filename)) expect([...persistentForbidden, ...privateKeys].some(secret => readFileSync(filename).includes(Buffer.from(secret, "utf8")))).toBe(false);
    }
  });
  return { config, reader, start, before, persistent, registered, authorize };
}
interface WireResult { status: number; body: string; cookies: string[]; headers: IncomingHttpHeaders }
function wire(config: LocalRuntimeConfiguration, role: Role, action: "login" | "logout" | "session", body: string | Buffer,
  overrides: https.RequestOptions = {}, flags: { noOrigin?: boolean; chunked?: boolean; onHeaders?: () => void } = {}) {
  let client!: ReturnType<typeof https.request>;
  const promise = new Promise<WireResult>((resolve, reject) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!flags.noOrigin) headers.Origin = config.authorization.origins[role];
    if (!flags.chunked) headers["Content-Length"] = String(Buffer.byteLength(body));
    client = https.request({ hostname: role === "ADMIN" ? "localhost" : "127.0.0.1", family: 4, port: config.port,
      servername: role === "ADMIN" ? "localhost" : "", ca: material.trustAnchor, agent: false,
      method: "POST", path: "/api/auth/" + action, ...overrides, headers: Array.isArray(overrides.headers) ? overrides.headers : { ...headers, ...overrides.headers } }, response => {
      flags.onHeaders?.(); const cookies = response.headers["set-cookie"] ?? [];
      for (const cookie of cookies) {
        const value = cookie.split(";")[0].split("=").slice(1).join("=");
        if (value.length > 8) { sensitive.add(value); persistentForbidden.add(value); }
      }
      let value = ""; response.setEncoding("utf8"); response.on("data", chunk => { value += chunk; });
      response.on("error", reject); response.on("end", () => resolve({ status: response.statusCode!, body: value, cookies, headers: response.headers }));
    });
    client.on("error", reject); client.setTimeout(8000, () => client.destroy(new Error("TEST request timeout")));
    if (flags.chunked) { client.write(body.slice(0, 3)); client.end(body.slice(3)); } else client.end(body);
  });
  return { promise, abort: () => client.destroy() };
}
const login = (config: LocalRuntimeConfiguration, role: Role, password = passwords[role]) => wire(config, role, "login", JSON.stringify({ password })).promise;
const logout = (config: LocalRuntimeConfiguration, role: Role, cookies: readonly string[]) => wire(config, role, "logout", "{}", { headers: { Cookie: cookieHeader(cookies) } }).promise;
async function successful(response: WireResult, role: Role, clearing = false) {
  expect(response.status).toBe(200); expect(response.body).toBe('{"ok":true}');
  expect(response.headers["cache-control"]).toBe("no-store");
  const prefix = role === "ADMIN" ? "__Secure-pos-admin." : "__Secure-pos-salesperson.";
  expect(response.cookies.length >= 2 && response.cookies.every(cookie => cookie.startsWith(prefix) && /HttpOnly/i.test(cookie) &&
    /Secure/i.test(cookie) && /SameSite=Strict/i.test(cookie) && /Path=\//i.test(cookie) && !/Domain=/i.test(cookie))).toBe(true);
  expect(response.cookies.some(cookie => clearing ? !/Max-Age=0/i.test(cookie) : /Max-Age=|Expires=/i.test(cookie))).toBe(false);
  expect(contains(response.body)).toBe(false);
}
beforeAll(async () => {
  mkdirSync(baseDirectory); mkdirSync(certDirectory);
  if (!process.env.SHOP_POS_HTTP_BUILT_APP) {
    mkdirSync(path.join(fixtureApp, "app/api/health"), { recursive: true });
    writeFileSync(path.join(fixtureApp, "package.json"), '{"private":true}');
    writeFileSync(path.join(fixtureApp, "next.config.mjs"), "export default {poweredByHeader:false,experimental:{cpus:1}};");
    writeFileSync(path.join(fixtureApp, "app/layout.js"), 'import React from "react";export default function Layout({children}){return React.createElement("html",null,React.createElement("body",null,children));}');
    writeFileSync(path.join(fixtureApp, "app/page.js"), 'export default function Page(){return "TEST";}');
    copyFileSync(path.resolve("src/app/api/health/route.ts"), path.join(fixtureApp, "app/api/health/route.ts"));
    const built = await execute(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "build", fixtureApp, "--webpack"],
      { env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" }, maxBuffer: 2 * 1024 * 1024 });
    writeFileSync(path.join(run, "next-build.txt"), built.stdout + built.stderr);
  }
  const openssl = (...args: string[]) => execute("C:\\Program Files\\Git\\usr\\bin\\openssl.exe", args, { cwd: certDirectory });
  await openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=SHOP-POS-TEST-CA", "-addext", "basicConstraints=critical,CA:TRUE", "-keyout", "ca.key", "-out", "ca.pem");
  await openssl("req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=localhost", "-keyout", "leaf.key", "-out", "leaf.csr");
  writeFileSync(path.join(certDirectory, "leaf.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n");
  await openssl("x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-days", "1", "-sha256", "-extfile", "leaf.ext", "-out", "leaf.pem");
  material = { key: readFileSync(path.join(certDirectory, "leaf.key")), certificate: readFileSync(path.join(certDirectory, "leaf.pem")), trustAnchor: readFileSync(path.join(certDirectory, "ca.pem")) };
  for (const key of [material.key.toString(), readFileSync(path.join(certDirectory, "ca.key"), "utf8")]) { privateKeys.add(key); privateKeys.add(JSON.stringify(key).slice(1, -1)); }
  const database = openDatabase({ directory: baseDirectory, filename: "test.sqlite3", mode: "test", create: true }); applyMigrations(database, migrationsDirectory); database.close();
  await runTrustedFirstRunSetup({ database: { directory: baseDirectory, filename: "test.sqlite3", mode: "test" }, migrationsDirectory }, async () => passwords);
  const reader = openDatabase({ directory: baseDirectory, filename: "test.sqlite3", mode: "test" });
  reader.transaction(tx => { tx.run("CREATE TABLE test_runtime_sentinel(id INTEGER PRIMARY KEY,value TEXT NOT NULL) STRICT"); tx.run("INSERT INTO test_runtime_sentinel VALUES(?,?)", [BigInt(1), "TEST-preserved"]); });
  for (const row of reader.all("SELECT password FROM auth_credentials")) sensitive.add(String(row.password)); reader.close();
  probe.nativeCalls = 0; probe.nativeMax = 0;
});
afterEach(async () => {
  probe.afterCookies = undefined; probe.afterCommit = undefined; probe.afterAuthorization = undefined; probe.logoutEntered = undefined;
  probe.nativeDefer = undefined; for (const release of probe.releases.splice(0)) release();
  probe.failRegistration = false; probe.failRevocation = false;
  for (const browser of browsers.splice(0)) await browser.close();
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const reader of readers.splice(0)) reader.close();
  for (const audit of audits.splice(0)) audit();
  clock.offset = 0; vi.restoreAllMocks(); vi.unstubAllEnvs();
});
describe("Part3P real HTTPS private login/logout boundary", () => {
  it.each(roles)("logs in %s over trusted HTTPS and authorizes only its signed role cookie", async role => {
    const f = await fixture(), { runtime, gateway } = await f.start(), response = await login(f.config, role);
    expect(runtime.authenticationEnabled).toBe(true); await successful(response, role);
    expect((await f.authorize(gateway, role, response.cookies)).role).toBe(role);
    await expect(f.authorize(gateway, role === "ADMIN" ? "SALESPERSON" : "ADMIN", response.cookies)).rejects.toBeDefined();
    expect(f.registered()).toBe(BigInt(1)); expect(f.persistent() === f.before).toBe(true);
  });
  it("preserves exact Unicode and whitespace; visually similar byte-distinct input fails", async () => {
    const f = await fixture(), { gateway } = await f.start();
    expect((await login(f.config, "ADMIN", passwords.ADMIN.trim())).status).toBe(401);
    expect((await login(f.config, "ADMIN", passwords.ADMIN.normalize("NFD"))).status).toBe(401);
    const signed = await login(f.config, "ADMIN"); await successful(signed, "ADMIN"); await f.authorize(gateway, "ADMIN", signed.cookies);
  });
  it.each(roles)("persists the five-failure 30-second cooldown for %s and resets on success", async role => {
    const f = await fixture(), first = await f.start(), realNow = Date.now;
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + clock.offset);
    const wrong = randomBytes(12).toString("base64url"); sensitive.add(wrong); persistentForbidden.add(wrong);
    const calls = probe.nativeCalls;
    for (let i = 0; i < 5; i++) expect((await login(f.config, role, wrong)).status).toBe(401);
    expect(probe.nativeCalls - calls).toBe(5);
    expect((await login(f.config, role)).status).toBe(401); expect(probe.nativeCalls - calls).toBe(5);
    await first.runtime.close(); await f.start(); expect((await login(f.config, role)).status).toBe(401);
    clock.offset += 30001; await successful(await login(f.config, role), role);
    const row = f.reader.get("SELECT failed_1_ms,cooldown_until_ms FROM auth_login_attempts WHERE bucket=?", [role]);
    expect(row?.failed_1_ms).toBe(BigInt(0)); expect(row?.cooldown_until_ms).toBe(BigInt(0)); expect(f.persistent() === f.before).toBe(true);
  });
  it("publishes no headers before the real registry COMMIT", async () => {
    const f = await fixture(); await f.start(); const held = barrier(); probe.afterCookies = held.wait; let headers = false;
    const pending = wire(f.config, "ADMIN", "login", JSON.stringify({ password: passwords.ADMIN }), {}, { onHeaders: () => { headers = true; } }).promise;
    await held.ready; expect(headers).toBe(false); expect(f.registered()).toBe(BigInt(0));
    held.release(); await successful(await pending, "ADMIN"); expect(f.registered()).toBe(BigInt(1));
  });
  it("rolls back a real native SQL registration error and returns no usable cookie", async () => {
    const f = await fixture(), { gateway } = await f.start(); probe.failRegistration = true;
    const response = await login(f.config, "ADMIN"); expect(response.status).toBe(401); expect(response.cookies.length).toBe(0); expect(f.registered()).toBe(BigInt(0));
    await expect(f.authorize(gateway, "ADMIN", probe.staged.at(-1)!.cookies)).rejects.toBeDefined(); expect(f.persistent() === f.before).toBe(true);
  });
  it.each(roles)("logs out %s, denies stale cookies and safely repeats", async role => {
    const f = await fixture(), { gateway } = await f.start(), signed = await login(f.config, role);
    await successful(await logout(f.config, role, signed.cookies), role, true);
    await expect(f.authorize(gateway, role, signed.cookies)).rejects.toBeDefined();
    const registry = stable(f.reader.all("SELECT * FROM auth_session_authorizations"));
    await successful(await logout(f.config, role, signed.cookies), role, true);
    expect(stable(f.reader.all("SELECT * FROM auth_session_authorizations")) === registry).toBe(true); expect(f.persistent() === f.before).toBe(true);
  });
  it("never revokes another role from foreign cookies or client-supplied identity fields", async () => {
    const f = await fixture(), { gateway } = await f.start(), admin = await login(f.config, "ADMIN"), staff = await login(f.config, "SALESPERSON");
    await successful(await logout(f.config, "SALESPERSON", admin.cookies), "SALESPERSON", true);
    await f.authorize(gateway, "ADMIN", admin.cookies); await f.authorize(gateway, "SALESPERSON", staff.cookies);
    const bad = await wire(f.config, "SALESPERSON", "logout", '{"role":"ADMIN","sessionId":"chosen"}', { headers: { Cookie: cookieHeader(staff.cookies) } }).promise;
    expect(bad.status).toBe(400);
    await logout(f.config, "SALESPERSON", staff.cookies); await f.authorize(gateway, "ADMIN", admin.cookies);
  });
  it("fails closed on SQL revocation uncertainty without success or cookie expiry", async () => {
    const f = await fixture(), { gateway } = await f.start(), signed = await login(f.config, "ADMIN"); probe.failRevocation = true;
    const response = await logout(f.config, "ADMIN", signed.cookies); expect(response.status).toBe(401); expect(response.cookies.length).toBe(0);
    await expect(f.authorize(gateway, "ADMIN", signed.cookies)).rejects.toBeDefined(); expect(f.persistent() === f.before).toBe(true);
  });
  it("admits one native KDF/issuance while concurrent logins fail closed", async () => {
    const f = await fixture(); await f.start(); const held = holdNative(), calls = probe.nativeCalls;
    const first = login(f.config, "ADMIN"); await held.ready;
    const extra = await Promise.all(Array.from({ length: 6 }, () => login(f.config, "SALESPERSON")));
    expect(extra.every(r => r.status === 401 && r.cookies.length === 0)).toBe(true); expect(probe.nativeCalls - calls).toBe(1);
    held.release(); await successful(await first, "ADMIN"); expect(probe.nativeMax).toBe(1); expect(f.registered()).toBe(BigInt(1));
  });
  it("serializes repeated concurrent logout while preserving the other role", async () => {
    const f = await fixture(), { gateway } = await f.start(), admin = await login(f.config, "ADMIN"), staff = await login(f.config, "SALESPERSON");
    const results = await Promise.all(Array.from({ length: 4 }, () => logout(f.config, "ADMIN", admin.cookies)));
    expect(results.every(r => r.status === 200)).toBe(true);
    await expect(f.authorize(gateway, "ADMIN", admin.cookies)).rejects.toBeDefined(); await f.authorize(gateway, "SALESPERSON", staff.cookies);
  });
  it("logout cancels overlapping staged login before publication", async () => {
    const f = await fixture(), { gateway } = await f.start(), old = await login(f.config, "ADMIN"), held = barrier();
    probe.afterCookies = held.wait; const pending = login(f.config, "ADMIN"); await held.ready;
    let entered!: () => void; const ready = new Promise<void>(resolve => { entered = resolve; }); probe.logoutEntered = entered;
    const exiting = logout(f.config, "ADMIN", old.cookies); await ready; held.release();
    const response = await pending; expect(response.status).toBe(401); expect(response.cookies.length).toBe(0);
    await successful(await exiting, "ADMIN", true); await expect(f.authorize(gateway, "ADMIN", old.cookies)).rejects.toBeDefined();
  });
  it("shutdown drains native work and denies late issuance", async () => {
    const f = await fixture(), { runtime } = await f.start(), held = holdNative();
    const pending = login(f.config, "ADMIN"); await held.ready; const closing = runtime.close(); held.release();
    const response = await pending; expect(response.status).toBe(401); expect(response.cookies.length).toBe(0);
    await closing; expect(f.registered()).toBe(BigInt(0)); expect(f.persistent() === f.before).toBe(true);
  });
  it("revokes issuance if the client disappears after COMMIT and before publication", async () => {
    const f = await fixture(), { gateway, owner } = await f.start(), held = barrier();
    probe.afterCookies = async () => { probe.afterCommit = held.wait; };
    const operation = wire(f.config, "ADMIN", "login", JSON.stringify({ password: passwords.ADMIN })), failed = operation.promise.then(() => false, () => true);
    await held.ready; expect(owner.inTransaction()).toBe(false); expect(f.registered()).toBe(BigInt(1));
    operation.abort(); await failed; held.release(); await runtimes.at(-1)!.close();
    expect(f.reader.all("SELECT revoked_at_ms FROM auth_session_authorizations").every(row => typeof row.revoked_at_ms === "bigint")).toBe(true);
    await expect(f.authorize(gateway, "ADMIN", probe.staged.at(-1)!.cookies)).rejects.toBeDefined();
  });
  it("restart denies actual wire-issued cookies without resetting identities/history", async () => {
    const f = await fixture(), first = await f.start(), admin = await login(f.config, "ADMIN"), staff = await login(f.config, "SALESPERSON");
    await first.runtime.close(); const second = await f.start();
    await expect(f.authorize(second.gateway, "ADMIN", admin.cookies)).rejects.toBeDefined();
    await expect(f.authorize(second.gateway, "SALESPERSON", staff.cookies)).rejects.toBeDefined();
    expect(f.persistent() === f.before).toBe(true); await successful(await login(f.config, "ADMIN"), "ADMIN");
  });
  it.each(["missing", "wrong", "null", "trailing", "duplicate"] as const)("rejects %s Origin before expensive verification", async mode => {
    const f = await fixture(); await f.start(); const calls = probe.nativeCalls;
    const origin = mode === "wrong" ? f.config.authorization.origins.SALESPERSON : mode === "null" ? "null" : f.config.authorization.origins.ADMIN + "/";
    const response = await wire(f.config, "ADMIN", "login", JSON.stringify({ password: passwords.ADMIN }),
      { headers: mode === "duplicate" ? { Origin: [f.config.authorization.origins.ADMIN, f.config.authorization.origins.ADMIN] } : mode === "missing" ? {} : { Origin: origin } }, { noOrigin: mode === "missing" }).promise;
    expect(response.status).toBe(403); expect(response.cookies.length).toBe(0); expect(probe.nativeCalls).toBe(calls);
  });
  it("rejects Host/SNI, forwarded transport, cross-site fetch, unsafe content and preflight attacks", async () => {
    const f = await fixture(); await f.start(); const body = JSON.stringify({ password: passwords.ADMIN }), calls = probe.nativeCalls;
    for (const headers of [{ Host: "wrong.invalid" }, { "X-Forwarded-Proto": "https" }, { Forwarded: "proto=https" }, { "Sec-Fetch-Site": "cross-site" }, { "Content-Type": "text/plain" }, { "Content-Type": "application/x-www-form-urlencoded" }])
      expect((await wire(f.config, "ADMIN", "login", body, { headers }).promise).status >= 400).toBe(true);
    await expect(wire(f.config, "ADMIN", "login", body, { servername: "wrong.invalid" }).promise).rejects.toBeDefined();
    expect((await wire(f.config, "ADMIN", "login", body, { method: "OPTIONS" }).promise).status).toBe(405);
    expect((await wire(f.config, "ADMIN", "login", body, { method: "GET" }).promise).status).toBe(405); expect(probe.nativeCalls).toBe(calls);
  });
  it.each(["json", "utf8", "extra", "duplicate-key", "escaped-key", "short", "too-long", "surrogate", "array", "logout-identity"] as const)("rejects malformed %s before native work", async mode => {
    const f = await fixture(); await f.start(); const calls = probe.nativeCalls;
    const cases: Record<string, string | Buffer> = { json: '{"password":', utf8: Buffer.from([0x7b,0x22,0x70,0xff,0x22,0x7d]),
      extra: JSON.stringify({ password: passwords.ADMIN, role: "ADMIN" }), "duplicate-key": '{"password":"firstone","password":"secondone"}',
      "escaped-key": '{"\\u0070assword":"samplelong"}', short: '{"password":"1234567"}', "too-long": JSON.stringify({ password: "x".repeat(129) }),
      surrogate: '{"password":"12345678\\ud800"}', array: "[]", "logout-identity": '{"role":"ADMIN"}' };
    const response = await wire(f.config, "ADMIN", mode === "logout-identity" ? "logout" : "login", cases[mode]).promise;
    expect(response.status >= 400 && response.cookies.length === 0).toBe(true); expect(probe.nativeCalls).toBe(calls);
  });
  it("accepts bounded chunked JSON/UTF-8 but rejects declared and streaming overflow", async () => {
    const f = await fixture(); await f.start(); const body = Buffer.from(JSON.stringify({ password: passwords.ADMIN }));
    await successful(await wire(f.config, "ADMIN", "login", body, {}, { chunked: true }).promise, "ADMIN");
    const calls = probe.nativeCalls; expect((await wire(f.config, "ADMIN", "login", "x".repeat(2049)).promise).status).toBe(413);
    const streamed = await wire(f.config, "ADMIN", "login", "x".repeat(2049), {}, { chunked: true }).promise;
    expect(streamed.status >= 400 && streamed.cookies.length === 0).toBe(true); expect(probe.nativeCalls).toBe(calls);
  });
  it("denies missing provisioning and unavailable SQL without accounts or cookies", async () => {
    const f = await fixture(false), first = await f.start(), response = await login(f.config, "ADMIN");
    expect(response.status).toBe(401); expect(response.cookies.length).toBe(0);
    expect(f.reader.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(BigInt(0)); await first.runtime.close();
    const other = await fixture(), live = await other.start(); live.owner.quarantine();
    expect((await login(other.config, "ADMIN")).status).toBe(401); expect(other.persistent() === other.before).toBe(true);
  });
  it("leaves anonymous/protected, raw framework/signup and unrelated Next routes inaccessible", async () => {
    const f = await fixture(), { gateway } = await f.start(); await expect(f.authorize(gateway, "ADMIN", [])).rejects.toBeDefined();
    for (const url of ["/", "/admin", "/api/admin/test", "/api/auth/get-session", "/api/auth/sign-in/email", "/api/auth/sign-up/email", "/api/auth/sign-out", "/api/auth/login?role=ADMIN", "/api/%61uth/login"]) {
      const response = await wire(f.config, "ADMIN", "login", "{}", { path: url }).promise;
      expect(response.status).toBe(404); expect(response.cookies.length).toBe(0); expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    }
  });
  it("does not activate production from an env flag or a TEST mode alone", async () => {
    const f = await fixture(); vi.stubEnv("ENABLE_AUTH", "true");
    expect(confinedTestAuthentication({ ...f.config.authorization.database, mode: "persistent" })).toBe(false);
    expect(confinedTestAuthentication({ ...f.config.authorization.database, directory: path.resolve("src") })).toBe(false);
    vi.stubEnv("NODE_ENV", "production"); expect(confinedTestAuthentication(f.config.authorization.database)).toBe(false);
    await expect(startLocalRuntime(f.config)).rejects.toBeDefined();
  });
  it("keeps generated credentials, raw bearers and keys out of ordinary JSON/errors/logs and SQLite", async () => {
    const f = await fixture(), logs = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")], { runtime } = await f.start();
    const success = await login(f.config, "ADMIN"), wrong = randomBytes(12).toString("base64url"); sensitive.add(wrong); persistentForbidden.add(wrong);
    const failure = await login(f.config, "ADMIN", wrong), exiting = await logout(f.config, "ADMIN", success.cookies);
    expect(contains(stable({ bodies: [success.body, failure.body, exiting.body], logs: logs.map(log => log.mock.calls), runtime }))).toBe(false);
    expect(Object.keys(runtime).sort()).toEqual(["address", "authenticationEnabled", "close", "origins"]); expect(f.persistent() === f.before).toBe(true);
  });
  it("enforces the absolute body-read deadline without starting password verification", async () => {
    const f = await fixture(); await f.start(); const calls = probe.nativeCalls;
    const response = await new Promise<{ status: number; cookies: number }>((resolve, reject) => {
      const client = https.request({ hostname: "localhost", family: 4, port: f.config.port, servername: "localhost",
        ca: material.trustAnchor, agent: false, method: "POST", path: "/api/auth/login",
        headers: { Origin: f.config.authorization.origins.ADMIN, "Content-Type": "application/json", "Content-Length": "100" } }, incoming => {
        incoming.resume(); incoming.on("end", () => resolve({ status: incoming.statusCode!, cookies: incoming.headers["set-cookie"]?.length ?? 0 }));
      });
      client.on("error", reject); client.setTimeout(7000, () => client.destroy(new Error("TEST body timeout")));
      client.write('{"password":"'); // Never complete this TEST request; deadline must reject it.
    });
    expect(response.status).toBe(400); expect(response.cookies).toBe(0); expect(probe.nativeCalls).toBe(calls);
  });
  it("rejects ambiguous cookies, duplicate content types and body encodings before credential work", async () => {
    const f = await fixture(); await f.start(); const calls = probe.nativeCalls, body = JSON.stringify({ password: passwords.ADMIN });
    for (const headers of [
      { Cookie: "a=one; a=two" }, { "Content-Type": ["application/json", "application/json"] }, { "Content-Encoding": "gzip" },
    ]) {
      const response = await wire(f.config, "ADMIN", "login", body, { headers }).promise;
      expect(response.status >= 400 && response.cookies.length === 0).toBe(true);
    }
    expect(probe.nativeCalls).toBe(calls);
  });

});

const session = (config: LocalRuntimeConfiguration, role: Role, cookies: readonly string[] = [], overrides: https.RequestOptions = {}) =>
  wire(config, role, "session", "", { ...overrides, method: overrides.method ?? "GET", headers: Array.isArray(overrides.headers) ? overrides.headers : { Cookie: cookieHeader(cookies), ...overrides.headers } }, { noOrigin: true }).promise;
function statusResult(response: WireResult, authenticated: boolean) {
  expect(response.status).toBe(200); expect(response.body).toBe(JSON.stringify({ authenticated }));
  expect(response.cookies.length).toBe(0); expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.headers["x-content-type-options"]).toBe("nosniff");
  expect(response.headers["access-control-allow-origin"]).toBeUndefined(); expect(contains(response.body)).toBe(false);
}
describe("Part3Q authenticated session status and focused boundary review", () => {
  it.each(roles)("reports only %s authentication before login, after login and after logout", async role => {
    const f = await fixture(); await f.start(); statusResult(await session(f.config, role), false);
    const signed = await login(f.config, role), calls = probe.nativeCalls;
    statusResult(await session(f.config, role, signed.cookies), true);
    const registrations = stable(f.reader.all("SELECT * FROM auth_session_authorizations"));
    statusResult(await session(f.config, role, signed.cookies), true);
    expect(probe.nativeCalls).toBe(calls);
    expect(stable(f.reader.all("SELECT * FROM auth_session_authorizations")) === registrations).toBe(true);
    await logout(f.config, role, signed.cookies); statusResult(await session(f.config, role, signed.cookies), false);
    expect(f.persistent() === f.before).toBe(true);
  });
  it.each(roles)("rejects wrong-role, tampered and duplicate %s cookies", async role => {
    const f = await fixture(); await f.start(); const signed = await login(f.config, role), other = role === "ADMIN" ? "SALESPERSON" : "ADMIN";
    statusResult(await session(f.config, other, signed.cookies), false);
    const tampered = signed.cookies.map(cookie => cookie.replace(/=([^;]+)/, "=$1x"));
    statusResult(await session(f.config, role, tampered), false);
    const duplicate = await session(f.config, role, [...signed.cookies, ...signed.cookies]);
    expect(duplicate.status).toBe(403); expect(duplicate.cookies.length).toBe(0);
    statusResult(await session(f.config, role, signed.cookies), true);
  });
  it("denies expired cookies without refreshing their lifetime", async () => {
    const f = await fixture(); await f.start(); const signed = await login(f.config, "ADMIN"), realNow = Date.now;
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + clock.offset);
    statusResult(await session(f.config, "ADMIN", signed.cookies), true);
    clock.offset += 120001; statusResult(await session(f.config, "ADMIN", signed.cookies), false);
  });
  it.each(["revoked", "version", "epoch", "inactive", "missing-registration"] as const)("checks authoritative SQL on every request after %s", async change => {
    const f = await fixture(); await f.start(); const role = change === "inactive" ? "SALESPERSON" : "ADMIN", signed = await login(f.config, role);
    statusResult(await session(f.config, role, signed.cookies), true);
    f.reader.transaction(tx => {
      if (change === "revoked") tx.run("UPDATE auth_session_authorizations SET revoked_at_ms=? WHERE principal_id=?", [BigInt(Date.now()), "ADMIN"]);
      if (change === "version") tx.run("UPDATE auth_principals SET credential_version=credential_version+1 WHERE id=?", ["ADMIN"]);
      if (change === "epoch") tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id=?", ["ADMIN"]);
      if (change === "inactive") tx.run("UPDATE auth_principals SET active=0 WHERE id=?", [role]);
      if (change === "missing-registration") tx.run("DELETE FROM auth_session_authorizations WHERE principal_id=?", [role]);
    });
    statusResult(await session(f.config, role, signed.cookies), false);
  });
  it("denies missing provisioning and unavailable authorization SQL generically", async () => {
    const empty = await fixture(false), first = await empty.start();
    statusResult(await session(empty.config, "ADMIN"), false);
    expect(empty.reader.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(BigInt(0)); await first.runtime.close();
    const f = await fixture(), live = await f.start(), signed = await login(f.config, "ADMIN");
    live.owner.quarantine(); statusResult(await session(f.config, "ADMIN", signed.cookies), false);
    expect(f.persistent() === f.before).toBe(true);
  });
  it("restart invalidates both signed sessions while preserving shop sentinels and history", async () => {
    const f = await fixture(), first = await f.start();
    const a = await login(f.config, "ADMIN"), s = await login(f.config, "SALESPERSON");
    await first.runtime.close(); await f.start();
    statusResult(await session(f.config, "ADMIN", a.cookies), false);
    statusResult(await session(f.config, "SALESPERSON", s.cookies), false);
    expect(f.persistent() === f.before).toBe(true);
  });
  it("is GET-only, bodyless and has no query/role/Next/framework routing escape", async () => {
    const f = await fixture(); await f.start(); const calls = probe.nativeCalls;
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      const response = await session(f.config, "ADMIN", [], { method });
      expect(response.status).toBe(405); expect(response.headers.allow).toBe("GET"); expect(response.cookies.length).toBe(0);
    }
    for (const url of ["/api/auth/session?role=ADMIN", "/api/auth/session/", "/api/auth/get-session", "/api/auth/session/../sign-in/email", "/api/%61uth/session", "/admin", "/_next/server/app"]) {
      expect((await session(f.config, "ADMIN", [], { path: url })).status).toBe(404);
    }
    expect((await session(f.config, "ADMIN", [], { headers: { "Content-Length": "1" } })).status).toBe(400);
    expect((await wire(f.config, "ADMIN", "session", "", { method: "GET", headers: { "Transfer-Encoding": "chunked" } }, { chunked: true, noOrigin: true }).promise).status).toBe(400);
    expect(probe.nativeCalls).toBe(calls);
  });
  it("rejects foreign/ambiguous Origin, Fetch Metadata, Host/SNI and forwarding on status", async () => {
    const f = await fixture(); await f.start(); const signed = await login(f.config, "ADMIN");
    for (const headers of [
      { Origin: f.config.authorization.origins.SALESPERSON }, { Origin: "null" },
      { Origin: [f.config.authorization.origins.ADMIN, f.config.authorization.origins.ADMIN] },
      { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" }, { Host: "wrong.invalid" },
      { "X-Forwarded-Host": new URL(f.config.authorization.origins.ADMIN).host }, { Forwarded: "proto=https" },
    ]) {
      const response = await session(f.config, "ADMIN", signed.cookies, { headers });
      expect(response.status).toBe(403); expect(response.cookies.length).toBe(0);
    }
    await expect(session(f.config, "ADMIN", signed.cookies, { servername: "wrong.invalid" })).rejects.toBeDefined();
    statusResult(await session(f.config, "ADMIN", signed.cookies, { headers: { Origin: f.config.authorization.origins.ADMIN, "Sec-Fetch-Site": "same-origin" } }), true);
  });
  it("bounds real HTTP headers and rejects raw duplicate Cookie fields", async () => {
    const f = await fixture(); await f.start();
    await expect(session(f.config, "ADMIN", [], { headers: { "X-Oversized": "x".repeat(8192) } })).rejects.toBeDefined();
    const headers: string[] = ["Host", new URL(f.config.authorization.origins.ADMIN).host, "Cookie", "first=one", "Cookie", "second=two"];
    expect((await session(f.config, "ADMIN", [], { headers })).status).toBe(403);
    const many = Object.fromEntries(Array.from({ length: 66 }, (_, i) => ["X-Extra-" + i, "x"]));
    expect((await session(f.config, "ADMIN", [], { headers: many })).status >= 400).toBe(true);
  });
  it("serializes concurrent logout/status and never authorizes a stale cookie after confirmed logout", async () => {
    const f = await fixture(); await f.start(); const a = await login(f.config, "ADMIN"), s = await login(f.config, "SALESPERSON");
    const exiting = logout(f.config, "ADMIN", a.cookies);
    const pending = Array.from({ length: 4 }, () => session(f.config, "ADMIN", a.cookies));
    await successful(await exiting, "ADMIN", true); await Promise.all(pending);
    for (let i = 0; i < 3; i++) statusResult(await session(f.config, "ADMIN", a.cookies), false);
    statusResult(await session(f.config, "SALESPERSON", s.cookies), true); expect(f.persistent() === f.before).toBe(true);
  });
  it("does not publish a previously authorized status after shutdown begins", async () => {
    const f = await fixture(), { runtime } = await f.start(), signed = await login(f.config, "ADMIN"), held = barrier();
    probe.afterAuthorization = held.wait;
    const pending = session(f.config, "ADMIN", signed.cookies); await held.ready;
    const closing = runtime.close(); held.release(); const result = await pending;
    expect(result.status).toBe(503); expect(result.cookies.length).toBe(0); expect(result.body.includes("true")).toBe(false); await closing;
  });
  it("aborted status cannot strand shutdown or create sessions", async () => {
    const f = await fixture(), { runtime } = await f.start(), signed = await login(f.config, "ADMIN"), held = barrier();
    probe.afterAuthorization = held.wait;
    const operation = wire(f.config, "ADMIN", "session", "", { method: "GET", headers: { Cookie: cookieHeader(signed.cookies) } }, { noOrigin: true });
    const failed = operation.promise.then(() => false, () => true); await held.ready;
    operation.abort(); expect(await failed).toBe(true); held.release(); await runtime.close();
    expect(f.registered()).toBe(BigInt(1)); expect(f.persistent() === f.before).toBe(true);
  });
  it("returns only safe booleans and no cookies, credential material or internal errors", async () => {
    const f = await fixture(), logs = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")], live = await f.start();
    const signed = await login(f.config, "ADMIN"), yes = await session(f.config, "ADMIN", signed.cookies);
    live.owner.quarantine(); const no = await session(f.config, "ADMIN", signed.cookies);
    statusResult(yes, true); statusResult(no, false);
    expect(contains(stable({ bodies: [yes.body, no.body], logs: logs.map(log => log.mock.calls) }))).toBe(false);
  });
});

// Browser-only TEST trust: one disposable leaf SPKI allowlist, never a global
// ignoreHTTPSErrors/ignore-certificate-errors setting or Windows store change.
// Chromium's documented allowlist skips validation for this key, so ordinary
// CA/hostname validation is proved separately by the real Node TLS clients.
// See https://chromium.googlesource.com/chromium/src/+/HEAD/services/network/ignore_errors_cert_verifier.h
async function browserForTest(pinned = true) {
  const spki = createHash("sha256").update(new X509Certificate(material.certificate).publicKey.export({ type: "spki", format: "der" })).digest("base64");
  const browser = await chromium.launch({ executablePath: chromium.executablePath(), headless: true,
    args: ["--enable-automation", ...(pinned ? ["--ignore-certificate-errors-spki-list=" + spki] : [])] });
  browsers.push(browser);
  const command = await (await browser.newBrowserCDPSession()).send("Browser.getBrowserCommandLine") as { arguments: string[] };
  expect(command.arguments.includes("--ignore-certificate-errors")).toBe(false);
  expect(command.arguments.some(arg => arg.startsWith("--user-data-dir="))).toBe(true);
  expect(command.arguments.filter(arg => arg.startsWith("--ignore-certificate-errors-spki-list=")).length).toBe(pinned ? 1 : 0);
  writeFileSync(path.join(run, "browser-metadata.json"), JSON.stringify({ version: browser.version(), scopedLeafKeyException: pinned,
    globalIgnoreErrors: false, windowsTrustChanges: false, recordings: false }));
  const context = await browser.newContext({ ignoreHTTPSErrors: false, serviceWorkers: "block" });
  return { browser, context };
}
type TestPage = Awaited<ReturnType<Awaited<ReturnType<typeof browserForTest>>["context"]["newPage"]>>;
async function browserCall(page: TestPage, action: "login" | "logout" | "session", password?: string) {
  return page.evaluate(async ({ action, password }) => {
    const response = await fetch("/api/auth/" + action, { method: action === "session" ? "GET" : "POST", credentials: "same-origin",
      cache: "no-store", ...(action === "session" ? {} : { headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "login" ? { password } : {}) }) });
    return { status: response.status, body: await response.text(), cache: response.headers.get("cache-control"),
      cookieVisible: response.headers.has("set-cookie") };
  }, { action, password });
}
async function browserStatus(page: TestPage, authenticated: boolean) {
  const value = await browserCall(page, "session");
  expect(value).toEqual({ status: 200, body: JSON.stringify({ authenticated }), cache: "no-store", cookieVisible: false });
}
async function emptyBrowserStorage(page: TestPage) {
  const empty = await page.evaluate(async () => document.cookie === "" && localStorage.length === 0 && sessionStorage.length === 0 &&
    (await indexedDB.databases()).length === 0 && (await caches.keys()).length === 0 &&
    !location.search && !location.hash && location.pathname === "/api/health");
  expect(empty).toBe(true);
}
describe("Part3Q real Chromium host-only cookie isolation", () => {
  it("trusts only the disposable leaf key in an isolated profile and rejects other certificates", async () => {
    const f = await fixture(); await f.start();
    const untrusted = await browserForTest(false), noTrustPage = await untrusted.context.newPage();
    // A real negative control: no inherited Windows/Chrome trust for our TEST CA.
    const rejected = await noTrustPage.goto(f.config.authorization.origins.ADMIN + "/api/health").then(() => false, () => true);
    expect(rejected).toBe(true); await untrusted.browser.close();
    const pinned = await browserForTest(), page = await pinned.context.newPage();
    for (const role of roles) expect((await page.goto(f.config.authorization.origins[role] + "/api/health"))?.status()).toBe(200);
    const other = https.createServer({ key: readFileSync(path.join(certDirectory, "ca.key")), cert: material.trustAnchor }, (_req, res) => res.end("TEST"));
    other.on("tlsClientError", () => {}); other.listen(0, "127.0.0.1"); await once(other, "listening");
    try {
      const address = other.address(); if (!address || typeof address === "string") throw new Error("TEST listener missing");
      const refused = await page.goto("https://127.0.0.1:" + address.port + "/").then(() => false, () => true);
      expect(refused).toBe(true); // No matching leaf key: browser still verifies TLS.
    } finally { other.closeAllConnections(); await new Promise<void>(resolve => other.close(() => resolve())); }
  }, 30000);
  it("enforces real Secure HttpOnly Strict host-only cookies, role isolation and stale-cookie logout denial", async () => {
    const f = await fixture(); await f.start(); const { context } = await browserForTest();
    const admin = await context.newPage(), staff = await context.newPage(), pages = { ADMIN: admin, SALESPERSON: staff };
    let leaked = false;
    for (const role of roles) {
      pages[role].on("console", message => { if (contains(message.text())) leaked = true; });
      pages[role].on("pageerror", error => { if (contains(error.message)) leaked = true; });
      await pages[role].goto(f.config.authorization.origins[role] + "/api/health");
      await browserStatus(pages[role], false);
    }
    const oldCookies = new Map<Role, Awaited<ReturnType<typeof context.cookies>>>();
    for (const role of roles) {
      const loginResult = await browserCall(pages[role], "login", passwords[role]);
      expect(loginResult).toEqual({ status: 200, body: '{"ok":true}', cache: "no-store", cookieVisible: false });
      const cookies = await context.cookies(f.config.authorization.origins[role]); oldCookies.set(role, cookies);
      const host = new URL(f.config.authorization.origins[role]).hostname;
      const prefix = role === "ADMIN" ? "__Secure-pos-admin." : "__Secure-pos-salesperson.";
      expect(cookies.length >= 2 && cookies.every(cookie => cookie.name.startsWith(prefix) && cookie.domain === host &&
        cookie.path === "/" && cookie.secure && cookie.httpOnly && cookie.sameSite === "Strict" && cookie.expires === -1)).toBe(true);
      for (const cookie of cookies) if (cookie.value.length > 8) { sensitive.add(cookie.value); persistentForbidden.add(cookie.value); }
      await browserStatus(pages[role], true); await emptyBrowserStorage(pages[role]);
      if (role === "ADMIN") {
        expect((await context.cookies(f.config.authorization.origins.SALESPERSON)).length).toBe(0);
        await browserStatus(staff, false);
      }
    }
    // The browser itself prevents a cross-origin authenticated response/CSRF.
    const blocked = await admin.evaluate(async origin => {
      try { const result = await fetch(origin + "/api/auth/session", { credentials: "include" }); return result.ok; } catch { return false; }
    }, f.config.authorization.origins.SALESPERSON);
    expect(blocked).toBe(false);
    for (const role of roles) {
      const result = await browserCall(pages[role], "logout");
      expect(result).toEqual({ status: 200, body: '{"ok":true}', cache: "no-store", cookieVisible: false });
      expect((await context.cookies(f.config.authorization.origins[role])).length).toBe(0);
      await browserStatus(pages[role], false);
      await context.addCookies(oldCookies.get(role)!); // Deliberately replay a real, now-revoked browser cookie.
      await browserStatus(pages[role], false);
      await emptyBrowserStorage(pages[role]);
      if (role === "ADMIN") await browserStatus(staff, true);
    }
    expect(leaked).toBe(false); expect(f.persistent() === f.before).toBe(true);
  }, 30000);
  it("rejects browser cookies after runtime restart and signed cookies moved to the wrong role host", async () => {
    const f = await fixture(), first = await f.start(), { browser, context } = await browserForTest();
    const pages = { ADMIN: await context.newPage(), SALESPERSON: await context.newPage() };
    for (const role of roles) {
      await pages[role].goto(f.config.authorization.origins[role] + "/api/health");
      expect((await browserCall(pages[role], "login", passwords[role])).body).toBe('{"ok":true}');
      await browserStatus(pages[role], true);
    }
    for (const role of roles) {
      const other = role === "ADMIN" ? "SALESPERSON" : "ADMIN", fresh = await browser.newContext({ ignoreHTTPSErrors: false, serviceWorkers: "block" });
      const source = await context.cookies(f.config.authorization.origins[role]);
      await fresh.addCookies(source.map(cookie => ({ ...cookie, domain: new URL(f.config.authorization.origins[other]).hostname })));
      const page = await fresh.newPage(); await page.goto(f.config.authorization.origins[other] + "/api/health");
      await browserStatus(page, false); await fresh.close();
    }
    await first.runtime.close(); await f.start(); // Same hosts/port/profile/cookies, new RAM owner.
    for (const role of roles) {
      expect((await context.cookies(f.config.authorization.origins[role])).length >= 2).toBe(true);
      await browserStatus(pages[role], false); await emptyBrowserStorage(pages[role]);
    }
    expect(f.persistent() === f.before).toBe(true);
  }, 30000);
});
