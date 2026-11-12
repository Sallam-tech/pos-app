import { createPrivateKey, randomBytes } from "node:crypto";
import { execFile, fork } from "node:child_process";
import { inspect, promisify } from "node:util";
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openDatabase, type SqliteConnection } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { openAuthorizationGateway } from "../../src/server/auth/gateway";
import { runTrustedFirstRunSetup } from "../../src/server/auth/provision";
import type { AuthorizationGateway } from "../../src/server/auth/types";
import { createProtectedLocalKeys, withProtectedLocalKeys, type LocalKeyConfiguration, type PrivateLocalKeys } from "../../src/server/bootstrap/keys";
import { prepareOwnerEnrollment } from "../../src/server/bootstrap/enrollment";
import { BootstrapRejected } from "../../src/server/bootstrap/windows";
import { acquireRuntimeOwnership } from "../../src/server/hosting/ownership";
import type { LocalTlsMaterial } from "../../src/server/hosting/https";

const probe = vi.hoisted(() => ({ failSeal: false, corruptAfterSeal: false }));
vi.mock("../../src/server/bootstrap/windows", async original => {
  const actual = await original<typeof import("../../src/server/bootstrap/windows")>();
  return { ...actual, windowsProtection: async (message: Readonly<Record<string, string>>) => {
    if (message.operation === "seal") {
      const payload = JSON.parse(Buffer.from(message.payload, "base64").toString("utf8")) as { signingSecrets: Record<string, string> };
      for (const value of Object.values(payload.signingSecrets)) sensitive.add(value);
    }
    if (message.operation === "seal" && probe.failSeal) throw new actual.BootstrapRejected();
    const value = await actual.windowsProtection(message);
    if (message.operation === "seal" && probe.corruptAfterSeal) {
      writeFileSync(path.join(message.directory, "identity.dpapi"), "POSKEY01TEST-INTERRUPTED");
      throw new actual.BootstrapRejected();
    }
    return value;
  } };
});
const execute = promisify(execFile), migrationsDirectory = path.resolve("src/server/db/migrations");
const root = path.resolve("test-results/sqlite-b1b-part1"); mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "bootstrap3r-")), certDirectory = path.join(run, "tls"), baseDirectory = path.join(run, "base");
const passwords = { ADMIN: randomBytes(15).toString("base64url"), SALESPERSON: randomBytes(15).toString("base64url") };
const sensitive = new Set(Object.values(passwords)), readers: SqliteConnection[] = [], gateways: AuthorizationGateway[] = [];
const guards: Awaited<ReturnType<typeof acquireRuntimeOwnership>>[] = [], audits: (() => void)[] = [];
let tls: LocalTlsMaterial;
const contains = (s: string) => [...sensitive].some(value => s.includes(value));
const stable = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v);
function observe(keys: PrivateLocalKeys) {
  for (const v of Object.values(keys.signingSecrets)) sensitive.add(v);
  sensitive.add(keys.tls.key.toString("utf8"));
}
function fixture() {
  const directory = mkdtempSync(path.join(run, "case-")), data = path.join(directory, "data"); mkdirSync(data);
  copyFileSync(path.join(baseDirectory, "test.sqlite3"), path.join(data, "test.sqlite3"));
  const database = { directory: data, filename: "test.sqlite3", mode: "test" as const, create: false, busyTimeoutMs: 75 };
  const config: LocalKeyConfiguration = { directory, database, migrationsDirectory };
  const reader = openDatabase(database); readers.push(reader);
  const snapshot = () => stable({ version: reader.get("SELECT user_version FROM pragma_user_version"),
    objects: reader.all("SELECT name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' ORDER BY name"),
    history: reader.all("SELECT * FROM schema_migrations ORDER BY version"),
    users: reader.all("SELECT * FROM auth_users"), credentials: reader.all("SELECT * FROM auth_credentials"),
    principals: reader.all("SELECT * FROM auth_principals"), latch: reader.all("SELECT * FROM auth_provisioning") });
  const before = snapshot(), keyDirectory = path.join(directory, "protected-identity"), keyFile = path.join(keyDirectory, "identity.dpapi");
  audits.push(() => {
    for (const name of [keyFile, path.join(data, "test.sqlite3"), path.join(data, "test.sqlite3-wal"), path.join(data, "test.sqlite3-shm")]) {
      if (existsSync(name)) expect([...sensitive].some(value => readFileSync(name).includes(Buffer.from(value)))).toBe(false);
    }
  });
  return { config, reader, snapshot, before, keyDirectory, keyFile };
}
async function denied(operation: Promise<unknown>) {
  let result: unknown;
  try { await operation; } catch (error) { result = error; }
  expect(result instanceof BootstrapRejected).toBe(true);
  const error = result as Error;
  expect({ name: error.name, message: error.message, cause: error.cause }).toEqual({
    name: "BootstrapRejected", message: "Protected setup unavailable.", cause: undefined });
  expect(contains(stable({ message: error.message, stack: error.stack }))).toBe(false);
}
beforeAll(async () => {
  mkdirSync(certDirectory); mkdirSync(baseDirectory);
  const testCertificatePassphrase = randomBytes(48).toString("base64url"); sensitive.add(testCertificatePassphrase);
  const openssl = (...args: string[]) => {
    const operation = execute("C:\\Program Files\\Git\\usr\\bin\\openssl.exe", args, { cwd: certDirectory, windowsHide: true });
    operation.child.stdin!.end(testCertificatePassphrase); return operation;
  };
  await openssl("req", "-x509", "-newkey", "rsa:2048", "-passout", "stdin", "-days", "1", "-subj", "/CN=POS-BOOTSTRAP-TEST-CA", "-addext", "basicConstraints=critical,CA:TRUE", "-keyout", "ca.key", "-out", "ca.pem");
  await openssl("req", "-newkey", "rsa:2048", "-passout", "stdin", "-subj", "/CN=localhost", "-keyout", "leaf.key", "-out", "leaf.csr");
  writeFileSync(path.join(certDirectory, "leaf.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n");
  await openssl("x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-passin", "stdin", "-CAcreateserial", "-days", "1", "-sha256", "-extfile", "leaf.ext", "-out", "leaf.pem");
  tls = { key: Buffer.from(createPrivateKey({ key: readFileSync(path.join(certDirectory, "leaf.key")), passphrase: testCertificatePassphrase }).export({ type: "pkcs8", format: "pem" })), certificate: readFileSync(path.join(certDirectory, "leaf.pem")), trustAnchor: readFileSync(path.join(certDirectory, "ca.pem")) };
  sensitive.add(tls.key.toString()); sensitive.add(readFileSync(path.join(certDirectory, "ca.key"), "utf8"));
  const db = openDatabase({ directory: baseDirectory, filename: "test.sqlite3", mode: "test", create: true });
  applyMigrations(db, migrationsDirectory); db.close();
  // TEST helper only. It never touches a store, account, certificate registry or
  // system setting; file ACL edits are confined to our fresh isolated files.
  writeFileSync(path.join(run, "native-negative.ps1"), String.raw`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$v=[Console]::In.ReadToEnd() | ConvertFrom-Json
if($v.operation -eq 'acl'){
  $a=(New-Object IO.FileInfo($v.filename)).GetAccessControl()
  $s=New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')
  $r=New-Object Security.AccessControl.FileSystemAccessRule($s,'Read','Allow')
  [void]$a.AddAccessRule($r)
  (New-Object IO.FileInfo($v.filename)).SetAccessControl($a)
  [Console]::Out.Write('true')
}else{
  $b=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes('TEST'),[Text.Encoding]::UTF8.GetBytes('OTHER-APPLICATION-CONTEXT'),[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Out.Write([Convert]::ToBase64String($b))
}
`);
});
afterEach(async () => {
  probe.failSeal = probe.corruptAfterSeal = false;
  for (const gateway of gateways.splice(0)) await gateway.close();
  for (const guard of guards.splice(0)) await guard.close();
  for (const reader of readers.splice(0)) reader.close();
  for (const audit of audits.splice(0)) audit();
  vi.restoreAllMocks(); vi.unstubAllEnvs();
});
async function nativeNegative(value: Record<string, string>) {
  const child = execute(path.join(process.env.SystemRoot!, "System32/WindowsPowerShell/v1.0/powershell.exe"),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", path.join(run, "native-negative.ps1")], { windowsHide: true, timeout: 10000 });
  child.child.stdin!.end(JSON.stringify(value)); return (await child).stdout.trim();
}

describe("Part3R real Windows protected local custody", () => {
  it("creates immutable DPAPI material, reopens separate role keys and preserves SQLite", async () => {
    const f = fixture(), metadata = await createProtectedLocalKeys(f.config, tls);
    let retained: PrivateLocalKeys | undefined, first = "";
    await withProtectedLocalKeys(f.config, async keys => {
      observe(keys); retained = keys;
      expect(keys.signingSecrets.ADMIN !== keys.signingSecrets.SALESPERSON).toBe(true);
      expect(Buffer.byteLength(keys.signingSecrets.ADMIN) >= 48 && Buffer.byteLength(keys.signingSecrets.SALESPERSON) >= 48).toBe(true);
      expect(keys.metadata.installationId === metadata.installationId && keys.metadata.deviceId === metadata.deviceId).toBe(true);
      expect(() => JSON.stringify(keys)).toThrow(BootstrapRejected);
      expect(inspect(keys)).toBe("[ProtectedLocalKeys]"); expect(contains(inspect(keys))).toBe(false);
      first = keys.signingSecrets.ADMIN;
    });
    expect(retained!.tls.key.every(byte => byte === 0)).toBe(true);
    await withProtectedLocalKeys(f.config, async keys => { observe(keys); expect(keys.signingSecrets.ADMIN === first).toBe(true); });
    expect(metadata.productionActivation).toBe(false); expect(contains(JSON.stringify(metadata))).toBe(false);
    expect(readFileSync(f.keyFile).subarray(0, 8).toString()).toBe("POSKEY01");
    expect(f.snapshot() === f.before).toBe(true);
  });
  it("never overwrites completed, empty or partially written previous custody", async () => {
    const f = fixture(); await createProtectedLocalKeys(f.config, tls); const stored = readFileSync(f.keyFile);
    await denied(createProtectedLocalKeys(f.config, tls)); expect(readFileSync(f.keyFile).equals(stored)).toBe(true);
    const other = fixture(); mkdirSync(other.keyDirectory);
    await denied(createProtectedLocalKeys(other.config, tls)); expect(readdirSync(other.keyDirectory).length).toBe(0);
  });
  it.each(["magic", "ciphertext", "truncated"] as const)("rejects %s corruption without regeneration", async kind => {
    const f = fixture(); await createProtectedLocalKeys(f.config, tls); let value = readFileSync(f.keyFile);
    if (kind === "magic") value[0] ^= 1;
    if (kind === "ciphertext") value[value.length - 4] ^= 1;
    if (kind === "truncated") value = value.subarray(0, 12);
    writeFileSync(f.keyFile, value);
    await denied(withProtectedLocalKeys(f.config, async () => {})); await denied(createProtectedLocalKeys(f.config, tls));
    expect(readFileSync(f.keyFile).equals(value)).toBe(true);
  });
  it("rejects another DPAPI application protection context", async () => {
    const f = fixture(); await createProtectedLocalKeys(f.config, tls);
    const other = await nativeNegative({ operation: "context" });
    writeFileSync(f.keyFile, Buffer.concat([Buffer.from("POSKEY01"), Buffer.from(other, "base64")]));
    await denied(withProtectedLocalKeys(f.config, async () => {}));
  });
  it("rejects broadened file ACLs without silently repairing them", async () => {
    const f = fixture(); await createProtectedLocalKeys(f.config, tls);
    expect(await nativeNegative({ operation: "acl", filename: f.keyFile })).toBe("true");
    const before = readFileSync(f.keyFile); await denied(withProtectedLocalKeys(f.config, async () => {}));
    expect(readFileSync(f.keyFile).equals(before)).toBe(true);
  });
  it("rejects a hard-linked key file", async () => {
    const f = fixture(); await createProtectedLocalKeys(f.config, tls);
    linkSync(f.keyFile, path.join(path.dirname(f.keyDirectory), "TEST-copy-link"));
    await denied(withProtectedLocalKeys(f.config, async () => {}));
  });
  it("rejects replaced SQLite and a copied identity from another database", async () => {
    const f = fixture(); await createProtectedLocalKeys(f.config, tls);
    f.reader.close(); renameSync(path.join(f.config.database.directory, "test.sqlite3"), path.join(f.config.database.directory, "original.sqlite3"));
    copyFileSync(path.join(baseDirectory, "test.sqlite3"), path.join(f.config.database.directory, "test.sqlite3"));
    await denied(withProtectedLocalKeys(f.config, async () => {}));
    const other = fixture(); await createProtectedLocalKeys(other.config, tls);
    copyFileSync(f.keyFile, other.keyFile); await denied(withProtectedLocalKeys(other.config, async () => {}));
  });
  it("rejects invalid paths and invalid TLS before creating key storage", async () => {
    const f = fixture();
    await denied(createProtectedLocalKeys({ ...f.config, directory: path.resolve("src") }, tls));
    await denied(createProtectedLocalKeys(f.config, { ...tls, certificate: Buffer.from("TEST-invalid") }));
    expect(existsSync(f.keyDirectory)).toBe(false);
    await denied(createProtectedLocalKeys({ ...f.config, database: { ...f.config.database, create: true } }, tls));
  });
  it("retains failed creation evidence and requires review instead of auto repair", async () => {
    const f = fixture(); probe.failSeal = true; await denied(createProtectedLocalKeys(f.config, tls)); probe.failSeal = false;
    await denied(createProtectedLocalKeys(f.config, tls)); await denied(withProtectedLocalKeys(f.config, async () => {}));
    const partial = fixture(); probe.corruptAfterSeal = true; await denied(createProtectedLocalKeys(partial.config, tls)); probe.corruptAfterSeal = false;
    const stored = readFileSync(partial.keyFile);
    await denied(withProtectedLocalKeys(partial.config, async () => {})); await denied(createProtectedLocalKeys(partial.config, tls));
    expect(readFileSync(partial.keyFile).equals(stored)).toBe(true); expect(partial.snapshot() === partial.before).toBe(true);
  });
  it("rejects simultaneous creation and competing existing runtime ownership", async () => {
    const f = fixture(), results = await Promise.allSettled([createProtectedLocalKeys(f.config, tls), createProtectedLocalKeys(f.config, tls)]);
    expect(results.filter(r => r.status === "fulfilled").length).toBe(1);
    const other = fixture(), guard = await acquireRuntimeOwnership(path.join(other.config.database.directory, "test.sqlite3")); guards.push(guard);
    await denied(createProtectedLocalKeys(other.config, tls)); expect(existsSync(other.keyDirectory)).toBe(false);
  });
  it("uses only local facilities without a Node internet connection or secret output", async () => {
    const f = fixture(), output = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    const connection = vi.spyOn(net.Socket.prototype, "connect").mockImplementation(() => { throw new Error("TEST outbound connection forbidden"); });
    const metadata = await createProtectedLocalKeys(f.config, tls);
    await withProtectedLocalKeys(f.config, async keys => { observe(keys); });
    expect(connection).not.toHaveBeenCalled();
    expect(contains(stable({ metadata, output: output.map(spy => spy.mock.calls) }))).toBe(false);
  });
});
describe("Part3R non-activating owner enrollment preparation", () => {
  it("requires valid protected material and pristine reviewed schema but never grants enrollment", async () => {
    const f = fixture();
    await denied(prepareOwnerEnrollment({ ...f.config, migrationsDirectory }));
    await createProtectedLocalKeys(f.config, tls);
    const result = await prepareOwnerEnrollment({ ...f.config, migrationsDirectory });
    expect(result.ownerAuthorizationRequired && !result.enrollmentAccepted && !result.productionActivation).toBe(true);
    expect(Object.keys(result).sort()).toEqual(["deviceId", "enrollmentAccepted", "installationId", "ownerAuthorizationRequired", "productionActivation", "status"]);
    expect(f.snapshot() === f.before).toBe(true);
  });
  it("preserves completed two-account provisioning and rejects replay or missing latch", async () => {
    const f = fixture(); await createProtectedLocalKeys(f.config, tls);
    await runTrustedFirstRunSetup({ database: f.config.database, migrationsDirectory }, async () => passwords);
    const before = f.snapshot(); await denied(prepareOwnerEnrollment({ ...f.config, migrationsDirectory }));
    expect(f.snapshot() === before).toBe(true);
    f.reader.transaction(tx => { tx.run("DELETE FROM auth_provisioning"); });
    await denied(prepareOwnerEnrollment({ ...f.config, migrationsDirectory }));
    expect(f.reader.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(BigInt(2));
  });
  it("rejects changed migration history, unknown schema and concurrent preparation", async () => {
    const f = fixture(); await createProtectedLocalKeys(f.config, tls);
    const simultaneous = await Promise.allSettled([prepareOwnerEnrollment({ ...f.config, migrationsDirectory }), prepareOwnerEnrollment({ ...f.config, migrationsDirectory })]);
    expect(simultaneous.filter(r => r.status === "fulfilled").length).toBe(1);
    f.reader.transaction(tx => { tx.run("UPDATE schema_migrations SET checksum=? WHERE version=?", ["0".repeat(64), BigInt(1)]); });
    await denied(prepareOwnerEnrollment({ ...f.config, migrationsDirectory }));
    const other = fixture(); await createProtectedLocalKeys(other.config, tls);
    other.reader.transaction(tx => { tx.run("CREATE TABLE TEST_unknown(id INTEGER) STRICT"); });
    await denied(prepareOwnerEnrollment({ ...other.config, migrationsDirectory }));
  });
  it("does not auto-provision on import and rejects a missing database", async () => {
    const f = fixture(); await import("../../src/server/bootstrap/enrollment");
    expect(f.snapshot() === f.before).toBe(true); expect(existsSync(f.keyDirectory)).toBe(false);
    await denied(createProtectedLocalKeys({ ...f.config, database: { ...f.config.database, filename: "missing.sqlite3" } }, tls));
    expect(existsSync(f.keyDirectory)).toBe(false);
  });
  it("reuses the real private gateway with persisted keys; restart still invalidates RAM sessions", async () => {
    const f = fixture(); await createProtectedLocalKeys(f.config, tls);
    await runTrustedFirstRunSetup({ database: f.config.database, migrationsDirectory }, async () => passwords);
    let cookies = "", first: AuthorizationGateway | undefined;
    const origins = { ADMIN: "https://localhost:9771", SALESPERSON: "https://127.0.0.1:9771" };
    await withProtectedLocalKeys(f.config, async keys => {
      observe(keys);
      first = await openAuthorizationGateway({ database: f.config.database, migrationsDirectory, origins,
        signingSecrets: keys.signingSecrets, sessionLifetimeSeconds: 120 }); gateways.push(first);
      const response = await first.issueAdminSession(await first.verifyAdminPassword(passwords.ADMIN));
      cookies = response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
      for (const c of response.headers.getSetCookie()) {
        const value = c.split(";")[0].split("=").slice(1).join("="); if (value.length > 8) sensitive.add(value);
      }
      const request = new Request(origins.ADMIN + "/TEST", { headers: { origin: origins.ADMIN, cookie: cookies } });
      expect((await first.authorizeAdmin(request)).role).toBe("ADMIN");
      await denied(prepareOwnerEnrollment({ ...f.config, migrationsDirectory })); // SAME auth fence rejects another owner.
      await first.close();
    });
    await withProtectedLocalKeys(f.config, async keys => {
      const second = await openAuthorizationGateway({ database: f.config.database, migrationsDirectory, origins,
        signingSecrets: keys.signingSecrets, sessionLifetimeSeconds: 120 }); gateways.push(second);
      await expect(second.authorizeAdmin(new Request(origins.ADMIN + "/TEST", { headers: { origin: origins.ADMIN, cookie: cookies } }))).rejects.toBeDefined();
      expect(f.reader.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(BigInt(2));
    });
  });
});

describe("Part3R independent process and missing-identity guards", () => {
  it("reopens protected keys in an independent Node/Windows DPAPI process", async () => {
    const f = fixture(), expected = await createProtectedLocalKeys(f.config, tls);
    const child = fork(path.resolve("tests/helpers/protected-bootstrap-child.mjs"), [], { silent: true, windowsHide: true,
      execArgv: ["--experimental-transform-types", "--disable-warning=ExperimentalWarning"], env: { ...process.env, NODE_ENV: "test" } });
    const exit = new Promise<number | null>(resolve => child.once("exit", resolve));
    const result = new Promise<Record<string, unknown>>((resolve, reject) => {
      child.once("message", value => resolve(value as Record<string, unknown>)); child.once("error", () => reject(new Error("TEST child unavailable")));
    });
    child.send({ action: "read", config: f.config });
    try {
      const value = await result; expect(value.status).toBe("read");
      expect(stable(value.metadata) === stable(expected)).toBe(true);
      expect(contains(stable(value))).toBe(false); expect(await exit).toBe(0);
    } finally { if (child.exitCode === null) child.kill(); }
  });
  it("rejects key creation while another process owns the application guard", async () => {
    const f = fixture(), child = fork(path.resolve("tests/helpers/protected-bootstrap-child.mjs"), [], { silent: true, windowsHide: true,
      execArgv: ["--experimental-transform-types", "--disable-warning=ExperimentalWarning"], env: { ...process.env, NODE_ENV: "test" } });
    const exit = new Promise<number | null>(resolve => child.once("exit", resolve));
    const held = new Promise<string>(resolve => child.once("message", value => resolve((value as { status: string }).status)));
    child.send({ action: "hold", config: f.config });
    try {
      expect(await held).toBe("held"); await denied(createProtectedLocalKeys(f.config, tls));
      expect(existsSync(f.keyDirectory)).toBe(false);
    } finally {
      if (child.connected) child.send("release");
      expect(await exit).toBe(0);
    }
  });
  it("cannot regenerate identity for an already-provisioned database with no key directory", async () => {
    const f = fixture(); await runTrustedFirstRunSetup({ database: f.config.database, migrationsDirectory }, async () => passwords);
    const before = f.snapshot();
    await denied(createProtectedLocalKeys(f.config, tls));
    expect(existsSync(f.keyDirectory)).toBe(false); expect(f.snapshot() === before).toBe(true);
  });
});
