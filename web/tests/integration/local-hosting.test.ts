import { randomBytes, X509Certificate } from "node:crypto";
import { execFile, fork, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import path from "node:path";
import { once } from "node:events";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthorizationGateway, Role } from "../../src/server/auth/types";
import { runTrustedFirstRunSetup } from "../../src/server/auth/provision";
import { openDatabase, type SqliteConnection } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { startLocalRuntime, type LocalRuntime, type LocalRuntimeConfiguration } from "../../src/server/hosting/runtime";
import { LocalRuntimeRejected } from "../../src/server/hosting/ownership";
import { validateLocalOrigins } from "../../src/server/hosting/https";

type NextFactory = typeof import("next").default;
const observed = vi.hoisted(() => ({ gateways: [] as AuthorizationGateway[], apps: [] as ReturnType<NextFactory>[], closes: 0 }));
const probe = vi.hoisted(() => ({ failPrepare: false, holdRequest: undefined as (() => Promise<void>) | undefined, releaseRequest: undefined as (() => void) | undefined }));
// Instrument actual installed framework/gateway only for observation or explicit
// fault/barrier injection. Successful cases use real Next, Better Auth and SQLite.
vi.mock("../../src/server/auth/gateway", async original => {
  const actual = await original<typeof import("../../src/server/auth/gateway")>();
  return { ...actual, openAuthorizationGateway: async (...args: Parameters<typeof actual.openAuthorizationGateway>) => {
    const gateway = await actual.openAuthorizationGateway(...args); observed.gateways.push(gateway); return Object.freeze({ ...gateway, async close() { observed.closes++; await gateway.close(); } });
  } };
});
vi.mock("next", async original => {
  const actual = await original<typeof import("next")>();
  return { ...actual, default: (options: Parameters<NextFactory>[0]) => {
    const app = actual.default(options); observed.apps.push(app);
    const prepare = app.prepare.bind(app);
    app.prepare = async (...args) => { await prepare(...args); if (probe.failPrepare) throw new Error("TEST startup failure"); };
    const get = app.getRequestHandler.bind(app);
    app.getRequestHandler = () => {
      const handler = get();
      return async (...args) => { await probe.holdRequest?.(); await handler(...args); };
    };
    return app;
  } };
});
const execute = promisify(execFile);
const root = path.resolve("test-results/sqlite-b1b-part1"); mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "hosting3o-"));
const fixtureApp = process.env.SHOP_POS_HOSTING_BUILT_APP ?? path.join(run, "next-app"), certDir = path.join(run, "tls"), baseDirectory = path.join(run, "base");
const migrationsDirectory = path.resolve("src/server/db/migrations");
const openssl = "C:\\Program Files\\Git\\usr\\bin\\openssl.exe"; // Existing TEST tooling only; not a runtime dependency.
const roles = ["ADMIN", "SALESPERSON"] as const;
const passwords = { ADMIN: randomBytes(12).toString("base64url"), SALESPERSON: randomBytes(12).toString("base64url") };
const sensitive = new Set(Object.values(passwords));
const privateKeys = new Set<string>();
const persistentForbidden = new Set(Object.values(passwords));
const runtimes: LocalRuntime[] = [], readers: SqliteConnection[] = [], children: ChildProcess[] = [];
const audits: (() => void)[] = [];
let material: LocalRuntimeConfiguration["tls"];
const contains = (value: string) => [...sensitive, ...privateKeys].some(secret => value.includes(secret));
const stable = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v);
async function rejected(work: Promise<unknown>) {
  let error: unknown; try { await work; } catch (caught) { error = caught; }
  expect(error instanceof LocalRuntimeRejected).toBe(true);
  expect((error as Error).message).toBe("Local service unavailable.");
  expect(Object.hasOwn(error as Error, "cause")).toBe(false);
  expect(contains(stable({ message: (error as Error).message, stack: (error as Error).stack }))).toBe(false);
}
async function freePort() {
  const server = net.createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("TEST port unavailable");
  await new Promise<void>(resolve => server.close(() => resolve())); return address.port;
}
async function fixture() {
  const directory = mkdtempSync(path.join(run, "db-"));
  copyFileSync(path.join(baseDirectory, "test.sqlite3"), path.join(directory, "test.sqlite3"));
  const reader = openDatabase({ directory, filename: "test.sqlite3", mode: "test", busyTimeoutMs: 75 }); readers.push(reader);
  const port = await freePort();
  const signingSecrets = { ADMIN: randomBytes(48).toString("base64url"), SALESPERSON: randomBytes(48).toString("base64url") };
  for (const secret of Object.values(signingSecrets)) { sensitive.add(secret); persistentForbidden.add(secret); }
  const config: LocalRuntimeConfiguration = { applicationDirectory: fixtureApp, port, tls: material, authorization: {
    database: { directory, filename: "test.sqlite3", mode: "test", create: false, busyTimeoutMs: 75 },
    migrationsDirectory, origins: { ADMIN: "https://localhost:" + port, SALESPERSON: "https://127.0.0.1:" + port },
    signingSecrets, sessionLifetimeSeconds: 120,
  } };
  const persistent = () => stable(Object.fromEntries(["schema_migrations", "auth_users", "auth_credentials", "auth_principals",
    "auth_provisioning", "auth_login_attempts", "test_runtime_sentinel"].map(table => [table, reader.all("SELECT * FROM " + table)])));
  const before = persistent();
  const start = async () => {
    const runtime = await startLocalRuntime(config); runtimes.push(runtime);
    return { runtime, gateway: observed.gateways.at(-1)! };
  };
  audits.push(() => {
    for (const suffix of ["", "-wal", "-shm"]) {
      const filename = path.join(directory, "test.sqlite3") + suffix;
      if (existsSync(filename)) expect([...persistentForbidden, ...privateKeys].some(secret => readFileSync(filename).toString("latin1").includes(secret))).toBe(false);
    }
  });
  return { config, start, directory, reader, persistent, before };
}
function request(config: LocalRuntimeConfiguration, role: Role, overrides: https.RequestOptions = {}, ca: Buffer | null = material.trustAnchor) {
  const hostname = role === "ADMIN" ? "localhost" : "127.0.0.1";
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string; authorized: boolean; peer: tls.PeerCertificate }>((resolve, fail) => {
    const req = https.request({ hostname, family: 4, port: config.port, path: "/api/health", agent: false,
      servername: role === "ADMIN" ? "localhost" : "", ca: ca ?? undefined, ...overrides }, response => {
      let body = ""; response.setEncoding("utf8"); response.on("data", part => { body += part; });
      const socket = response.socket as tls.TLSSocket;
      const authorized = socket.authorized, peer = socket.getPeerCertificate();
      response.on("end", () => resolve({ status: response.statusCode!, headers: response.headers, body, authorized, peer }));
    });
    req.on("error", fail); req.setTimeout(4000, () => req.destroy(new Error("TEST timeout"))); req.end();
  });
}
async function raw(config: LocalRuntimeConfiguration, text: string) {
  return new Promise<string>((resolve, fail) => {
    const socket = tls.connect({ host: "127.0.0.1", port: config.port, servername: "localhost", ca: material.trustAnchor },
      () => socket.write(text));
    let result = ""; socket.setEncoding("utf8"); socket.on("data", part => { result += part; });
    socket.on("error", fail); socket.on("close", () => resolve(result));
    socket.setTimeout(4000, () => socket.destroy(new Error("TEST timeout")));
  });
}
async function child(filename: string, runtimePort?: number) {
  const args = runtimePort === undefined ? [filename] : [filename, "runtime", fixtureApp, certDir, String(runtimePort), migrationsDirectory];
  const process = fork(path.resolve("tests/helpers/runtime-ownership-child.mjs"), args,
    { execArgv: ["--experimental-transform-types", "--disable-warning=ExperimentalWarning"], stdio: ["ignore", "pipe", "pipe", "ipc"], env: { ...globalThis.process.env, NODE_ENV: "test" } });
  children.push(process);
  let output = ""; process.stdout?.on("data", part => { output += part; }); process.stderr?.on("data", part => { output += part; });
  const [message] = await once(process, "message");
  expect(contains(output)).toBe(false);
  return { process, message };
}
beforeAll(async () => {
  for (const directory of [certDir, baseDirectory]) mkdirSync(directory);
  if (!process.env.SHOP_POS_HOSTING_BUILT_APP) {
  mkdirSync(fixtureApp);
  mkdirSync(path.join(fixtureApp, "app/api/health"), { recursive: true });
  writeFileSync(path.join(fixtureApp, "package.json"), '{"private":true}');
  writeFileSync(path.join(fixtureApp, "next.config.mjs"), "export default {poweredByHeader:false,experimental:{cpus:1}};");
  writeFileSync(path.join(fixtureApp, "app/layout.js"), 'import React from "react"; export default function Layout({children}){return React.createElement("html",null,React.createElement("body",null,children));}');
  writeFileSync(path.join(fixtureApp, "app/page.js"), 'export default function Page(){return "TEST";}');
  copyFileSync(path.resolve("src/app/api/health/route.ts"), path.join(fixtureApp, "app/api/health/route.ts"));
  // ONE tiny isolated production build, not the frozen app/frontend suite.
  const built = await execute(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "build", fixtureApp, "--webpack"],
    { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" }, maxBuffer: 2 * 1024 * 1024 });
  writeFileSync(path.join(run, "next-build.txt"), built.stdout + built.stderr);
  }
  const opensslRun = (...args: string[]) => execute(openssl, args, { cwd: certDir, maxBuffer: 16384 });
  await opensslRun("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=SHOP-POS-TEST-CA",
    "-addext", "basicConstraints=critical,CA:TRUE", "-keyout", "ca.key", "-out", "ca.pem");
  await opensslRun("req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=localhost", "-keyout", "leaf.key", "-out", "leaf.csr");
  writeFileSync(path.join(certDir, "leaf.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n");
  await opensslRun("x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial",
    "-days", "1", "-sha256", "-extfile", "leaf.ext", "-out", "leaf.pem");
  material = { key: readFileSync(path.join(certDir, "leaf.key")), certificate: readFileSync(path.join(certDir, "leaf.pem")), trustAnchor: readFileSync(path.join(certDir, "ca.pem")) };
  privateKeys.add(material.key.toString()); privateKeys.add(readFileSync(path.join(certDir, "ca.key"), "utf8"));
  const database = openDatabase({ directory: baseDirectory, filename: "test.sqlite3", mode: "test", create: true });
  applyMigrations(database, migrationsDirectory); database.close();
  await runTrustedFirstRunSetup({ database: { directory: baseDirectory, filename: "test.sqlite3", mode: "test" }, migrationsDirectory },
    async () => passwords); // Explicit disposable TEST setup, never runtime bootstrap.
  const reader = openDatabase({ directory: baseDirectory, filename: "test.sqlite3", mode: "test" });
  reader.transaction(tx => { tx.run("CREATE TABLE test_runtime_sentinel (id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT"); tx.run("INSERT INTO test_runtime_sentinel VALUES(?,?)", [BigInt(1), "TEST-preserved"]); });
  for (const row of reader.all("SELECT password FROM auth_credentials")) sensitive.add(String(row.password));
  reader.close();
});
afterEach(async () => {
  probe.failPrepare = false; probe.releaseRequest?.(); probe.releaseRequest = undefined; probe.holdRequest = undefined;
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const child of children.splice(0)) if (child.exitCode === null) await new Promise<void>(resolve => {
    child.once("exit", () => resolve()); if (child.connected) child.send("release", () => {});
  });
  for (const reader of readers.splice(0)) reader.close();
  for (const audit of audits.splice(0)) audit();
  vi.restoreAllMocks();
});
describe("Part3O real local HTTPS and gateway lifecycle", () => {
  it.each(roles)("serves real Next health over verified TLS for %s with no public bind or internal HTTP listener", async role => {
    const f = await fixture(), listen = vi.spyOn(net.Server.prototype, "listen");
    const { runtime } = await f.start(), result = await request(f.config, role);
    expect(runtime.address).toEqual({ address: "127.0.0.1", port: f.config.port });
    expect(listen.mock.calls.length).toBe(2); // OS ownership guard + direct HTTPS only.
    expect(listen.mock.calls.every(args => typeof args[0] === "object" && "host" in args[0]! && args[0].host === "127.0.0.1")).toBe(true);
    expect(result.status).toBe(200); expect(result.authorized).toBe(true);
    expect(JSON.parse(result.body)).toEqual({ status: "ok", service: "pos-web" });
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.headers["set-cookie"]).toBeUndefined();
    expect(contains(result.body + stable(result.headers))).toBe(false);
    expect(f.persistent() === f.before).toBe(true);
  });
  it("requires explicit certificate trust and real hostname verification", async () => {
    const f = await fixture(); await f.start();
    await expect(request(f.config, "ADMIN", {}, null)).rejects.toBeDefined();
    const result = await request(f.config, "ADMIN");
    expect(tls.checkServerIdentity("localhost", result.peer)).toBeUndefined();
    expect((tls.checkServerIdentity("wrong.invalid", result.peer) as NodeJS.ErrnoException)?.code).toBe("ERR_TLS_CERT_ALTNAME_INVALID");
    await expect(request(f.config, "ADMIN", { checkServerIdentity: (_host, certificate) => tls.checkServerIdentity("wrong.invalid", certificate) })).rejects.toBeDefined();
    expect(new X509Certificate(material.certificate).checkIP("127.0.0.1")).toBe("127.0.0.1");
  });
  it("verifies actual Windows localhost IPv4 resolution and rejects invented role DNS assumptions", async () => {
    const addresses = await lookup("localhost", { all: true, family: 4 });
    expect(addresses.length > 0 && addresses.every(a => a.address === "127.0.0.1")).toBe(true);
    const f = await fixture();
    await rejected(validateLocalOrigins(f.config.port, { ADMIN: "https://admin.localhost:" + f.config.port, SALESPERSON: "https://salesperson.localhost:" + f.config.port }));
  });
  it.each(["wrong.invalid", "localhost:1", "localhost.", "127.0.0.1"])("rejects incorrect Host %s", async host => {
    const f = await fixture(); await f.start();
    expect((await request(f.config, "ADMIN", { headers: { Host: host } })).status).toBe(403);
  });
  it("rejects wrong SNI, absent Admin SNI and cross-role Host/SNI combinations", async () => {
    const f = await fixture(); await f.start();
    await expect(request(f.config, "ADMIN", { servername: "wrong.invalid" })).rejects.toBeDefined();
    expect((await request(f.config, "ADMIN", { servername: "" })).status).toBe(403);
    expect((await request(f.config, "SALESPERSON", { servername: "localhost" })).status).toBe(403);
  });
  it.each(["Forwarded", "X-Forwarded-Proto", "X-Forwarded-Host", "X-Forwarded-For", "X-Real-IP", "X-Original-URL"])("rejects spoofed %s before Next", async header => {
    const f = await fixture(); await f.start();
    expect((await request(f.config, "ADMIN", { headers: { [header]: "https" } })).status).toBe(403);
  });
  it("rejects cross-origin requests, duplicate Host, oversized headers, upgrades and plaintext HTTP", async () => {
    const f = await fixture(); await f.start();
    expect((await request(f.config, "ADMIN", { headers: { Origin: f.config.authorization.origins.SALESPERSON } })).status).toBe(403);
    expect((await raw(f.config, "GET /api/health HTTP/1.1\r\nHost: localhost:" + f.config.port + "\r\nHost: localhost:" + f.config.port + "\r\nConnection: close\r\n\r\n")).includes("200 OK")).toBe(false);
    expect((await raw(f.config, "GET /api/health HTTP/1.1\r\nHost: localhost:" + f.config.port + "\r\nX-Fill: " + "x".repeat(9000) + "\r\n\r\n")).includes("200 OK")).toBe(false);
    const many = Array.from({length:70}, (_,i) => "X-Fill-" + i + ": value\r\n").join("");
    expect((await raw(f.config, "GET /api/health HTTP/1.1\r\nHost: localhost:" + f.config.port + "\r\n" + many + "X-Forwarded-Proto: https\r\nConnection: close\r\n\r\n")).includes("200 OK")).toBe(false);
    expect(await raw(f.config, "GET /api/health HTTP/1.1\r\nHost: localhost:" + f.config.port + "\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n")).toBe("");
    await expect(new Promise((resolve, fail) => {
      const req = http.get({ host: "127.0.0.1", port: f.config.port, path: "/api/health", agent: false }, response => { response.resume(); resolve(response.statusCode); });
      req.on("error", fail);
    })).rejects.toBeDefined();
  });
  it("retains the narrow host allowlist; raw framework, unapproved paths, signup, Admin and encoded paths stay inaccessible", async () => {
    const f = await fixture(); const { runtime } = await f.start();
    expect(runtime.authenticationEnabled).toBe(true); // Part3P: only this validated isolated TEST DB.
    expect(Object.keys(runtime).sort()).toEqual(["address", "authenticationEnabled", "close", "origins"]);
    for (const url of ["/", "/admin", "/api/auth/get-session", "/api/auth/sign-up/email", "/api/admin/login", "/api/logout", "/api/%68ealth", "/api/health?password=" + passwords.ADMIN]) {
      const result = await request(f.config, "ADMIN", { path: url });
      expect(result.status).toBe(404); expect(contains(result.body + stable(result.headers))).toBe(false);
    }
    expect((await request(f.config, "ADMIN", { method: "POST" })).status).toBe(405);
    expect((await request(f.config, "ADMIN", { headers: { "Content-Length": "1" } })).status).toBe(400);
  });
  it("rejects duplicate runtime in the same process without closing the existing owner", async () => {
    const f = await fixture(); await f.start();
    await rejected(startLocalRuntime(f.config));
    expect((await request(f.config, "ADMIN")).status).toBe(200);
  });
  it("rejects a competing real process for the same DB independently of the service port", async () => {
    const f = await fixture(); await f.start();
    const competing = await child(path.join(f.directory, "test.sqlite3"), await freePort());
    expect(competing.message).toBe("denied");
    expect((await request(f.config, "ADMIN")).status).toBe(200);
  });
  it("rejects a full competing runtime with another DB and HTTPS port, not just another owner of the same file", async () => {
    const first = await fixture(); await first.start(); const other = await fixture();
    const competing = await child(path.join(other.directory, "test.sqlite3"), other.config.port);
    expect(competing.message).toBe("denied");
    expect(other.persistent() === other.before).toBe(true);
    expect((await request(first.config, "ADMIN")).status).toBe(200);
  });
  it("starts the complete runtime in a real Node child, serves trusted HTTPS, then releases ownership for restart", async () => {
    const f = await fixture(), owned = await child(path.join(f.directory, "test.sqlite3"), f.config.port);
    expect(owned.message).toBe("owned");
    expect((await request(f.config, "ADMIN")).status).toBe(200);
    expect((await request(f.config, "SALESPERSON")).authorized).toBe(true);
    await rejected(startLocalRuntime(f.config));
    owned.process.send("release"); await once(owned.process, "exit");
    await f.start(); expect((await request(f.config, "ADMIN")).status).toBe(200);
    expect(f.persistent() === f.before).toBe(true);
  });
  it("recovers after an owned competing process exits abruptly without deleting a stale lock", async () => {
    const f = await fixture(), competing = await child(path.join(f.directory, "test.sqlite3"));
    expect(competing.message).toBe("owned"); await rejected(startLocalRuntime(f.config));
    competing.process.send("crash"); await once(competing.process, "exit");
    await f.start(); expect((await request(f.config, "SALESPERSON")).status).toBe(200);
    expect(f.persistent() === f.before).toBe(true);
  });
  it.each(["missing", "malformed", "wrong-key", "expired"] as const)("fails closed on %s TLS and permits corrected startup", async kind => {
    const f = await fixture();
    const bad = { ...material };
    if (kind === "missing") bad.key = Buffer.alloc(0);
    if (kind === "malformed") bad.certificate = Buffer.from("not a certificate");
    if (kind === "wrong-key") bad.key = readFileSync(path.join(certDir, "ca.key"));
    const clock = kind === "expired" ? vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3 * 86400000) : undefined;
    await rejected(startLocalRuntime({ ...f.config, tls: bad })); clock?.mockRestore();
    await f.start(); expect((await request(f.config, "ADMIN")).status).toBe(200);
  });
  it("rejects missing signing keys, unsafe origins and invalid session lifetime without disclosure", async () => {
    const f = await fixture();
    for (const authorization of [
      { ...f.config.authorization, signingSecrets: { ADMIN: "", SALESPERSON: "" } },
      { ...f.config.authorization, origins: { ADMIN: "http://localhost:" + f.config.port, SALESPERSON: "https://127.0.0.1:" + f.config.port } },
      { ...f.config.authorization, sessionLifetimeSeconds: 0 },
    ]) await rejected(startLocalRuntime({ ...f.config, authorization }));
    await f.start();
  });
  it("rejects missing, unreviewed and corrupt database state without creating/resetting anything", async () => {
    const f = await fixture();
    await rejected(startLocalRuntime({ ...f.config, authorization: { ...f.config.authorization, database: { ...f.config.authorization.database, filename: "missing.sqlite3" } } }));
    expect(existsSync(path.join(f.directory, "missing.sqlite3"))).toBe(false);
    await rejected(startLocalRuntime({ ...f.config, authorization: { ...f.config.authorization, database: { ...f.config.authorization.database, create: true } } }));
    f.reader.transaction(tx => tx.run("UPDATE schema_migrations SET checksum=? WHERE version=?", ["0".repeat(64), BigInt(1)]));
    await rejected(startLocalRuntime(f.config));
    expect(f.reader.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(BigInt(2));
    const badDirectory = mkdtempSync(path.join(run, "corrupt-")); writeFileSync(path.join(badDirectory, "bad.sqlite3"), "TEST-not-SQLite");
    await rejected(startLocalRuntime({ ...f.config, authorization: { ...f.config.authorization, database: { ...f.config.authorization.database, directory: badDirectory, filename: "bad.sqlite3" } } }));
    expect(readFileSync(path.join(badDirectory, "bad.sqlite3"), "utf8")).toBe("TEST-not-SQLite");
  });
  it("cleans partial Next preparation and bind failures, preserving the DB and releasing ownership last", async () => {
    const f = await fixture(), listeners = process.listeners("uncaughtException"); probe.failPrepare = true;
    await rejected(startLocalRuntime(f.config)); probe.failPrepare = false;
    expect(process.listeners("uncaughtException").length === listeners.length && process.listeners("uncaughtException").every(l => listeners.includes(l))).toBe(true);
    await expect(observed.gateways.at(-1)!.verifyAdminPassword(passwords.ADMIN)).rejects.toBeDefined();
    const blocker = net.createServer(socket => socket.destroy()); blocker.listen(f.config.port, "127.0.0.1"); await once(blocker, "listening");
    await rejected(startLocalRuntime(f.config)); await new Promise<void>(resolve => blocker.close(() => resolve()));
    await f.start(); expect((await request(f.config, "ADMIN")).status).toBe(200);
    expect(f.persistent() === f.before).toBe(true);
  });
  it("rejects missing production build or standalone output instead of improvising packaging", async () => {
    const f = await fixture(), empty = mkdtempSync(path.join(run, "app-missing-"));
    await rejected(startLocalRuntime({ ...f.config, applicationDirectory: empty }));
    mkdirSync(path.join(empty, ".next")); writeFileSync(path.join(empty, ".next/BUILD_ID"), "TEST");
    writeFileSync(path.join(empty, ".next/required-server-files.json"), JSON.stringify({ config: { distDir: ".next", output: "standalone" } }));
    await rejected(startLocalRuntime({ ...f.config, applicationDirectory: empty }));
    await f.start();
  });
  it("does not auto-provision an empty migrated database on import or startup", async () => {
    const f = await fixture(), empty = mkdtempSync(path.join(run, "empty-"));
    const reader = openDatabase({ directory: empty, filename: "empty.sqlite3", mode: "test", create: true }); readers.push(reader);
    applyMigrations(reader, migrationsDirectory);
    const config = { ...f.config, authorization: { ...f.config.authorization, database: { ...f.config.authorization.database, directory: empty, filename: "empty.sqlite3" } } };
    const runtime = await startLocalRuntime(config); runtimes.push(runtime);
    await expect(observed.gateways.at(-1)!.verifyAdminPassword(passwords.ADMIN)).rejects.toBeDefined();
    expect(reader.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(BigInt(0));
    expect(reader.get("SELECT count(*) AS n FROM auth_provisioning")?.n).toBe(BigInt(0));
    expect(reader.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(8));
  });
  it("drains admitted real HTTP before gateway close, rejects new work and closes idempotently", async () => {
    const f = await fixture(), listeners = process.listeners("uncaughtException"); const { runtime, gateway } = await f.start();
    let release!: () => void, entered!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { entered = resolve; });
    probe.releaseRequest = release; probe.holdRequest = async () => { entered(); await barrier; };
    const pending = request(f.config, "ADMIN"); await ready;
    const closes = observed.closes, closing = runtime.close();
    expect(observed.closes).toBe(closes);
    await expect(request(f.config, "SALESPERSON")).rejects.toBeDefined();
    release(); expect((await pending).status).toBe(200); await closing; await runtime.close();
    expect(observed.closes).toBe(closes + 1);
    expect(process.listeners("uncaughtException").length === listeners.length && process.listeners("uncaughtException").every(l => listeners.includes(l))).toBe(true);
    await expect(gateway.verifyAdminPassword(passwords.ADMIN)).rejects.toBeDefined();
    probe.holdRequest = undefined;
    await f.start(); expect((await request(f.config, "ADMIN")).status).toBe(200);
  });
  it("shutdown/restart invalidates both real private signed sessions and preserves accounts/history", async () => {
    const f = await fixture(); const first = await f.start(), cookies = {} as Record<Role, string[]>;
    const verify = (g: AuthorizationGateway, role: Role) => role === "ADMIN" ? g.verifyAdminPassword(passwords[role]) : g.verifySalespersonPassword(passwords[role]);
    const issue = (g: AuthorizationGateway, role: Role, proof: unknown) => role === "ADMIN" ? g.issueAdminSession(proof) : g.issueSalespersonSession(proof);
    const req = (role: Role) => new Request(f.config.authorization.origins[role] + "/protected-test",
      { headers: { cookie: cookies[role].map(value => value.split(";")[0]).join("; ") } });
    for (const role of roles) {
      cookies[role] = (await issue(first.gateway, role, await verify(first.gateway, role))).headers.getSetCookie();
      for (const cookie of cookies[role]) { const value = cookie.split(";")[0].split("=").slice(1).join("="); if (value) { sensitive.add(value); persistentForbidden.add(value); } }
      const actor = role === "ADMIN" ? await first.gateway.authorizeAdmin(req(role)) : await first.gateway.authorizeSalesperson(req(role));
      expect(actor.role).toBe(role);
    }
    const before = f.persistent(); await first.runtime.close();
    const second = await f.start();
    await expect(second.gateway.authorizeAdmin(req("ADMIN"))).rejects.toBeDefined();
    await expect(second.gateway.authorizeSalesperson(req("SALESPERSON"))).rejects.toBeDefined();
    expect(f.persistent() === before).toBe(true);
    expect((await request(f.config, "SALESPERSON")).status).toBe(200);
  });
  it("keeps credentials/keys out of ordinary output, errors and runtime capability", async () => {
    const f = await fixture(), error = vi.spyOn(console, "error"), log = vi.spyOn(console, "log"), warn = vi.spyOn(console, "warn");
    const { runtime } = await f.start();
    const response = await request(f.config, "ADMIN", { headers: { "X-Forwarded-Host": passwords.ADMIN } });
    expect(response.status).toBe(403);
    expect(contains(stable(response) + stable(runtime) + stable([error.mock.calls, log.mock.calls, warn.mock.calls]))).toBe(false);
    expect(f.persistent() === f.before).toBe(true);
  });
});
