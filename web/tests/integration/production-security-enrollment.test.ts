import type { CandidateRecord } from "../../src/server/bootstrap/candidate-records";
import { once } from "node:events";
import { createPrivateKey, randomBytes } from "node:crypto";
import { execFile, fork } from "node:child_process";
import { promisify } from "node:util";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { applySalesMigration36 } from "../../src/server/db/sales-migrate";
import { applyReturnsMigration37 } from "../../src/server/db/returns-migrate";
import { applyExpensesMigration38 } from "../../src/server/db/expenses-migrate";
import { applyInvoicesMigration39 } from "../../src/server/db/invoices-migrate";
import { applyCashMigration40 } from "../../src/server/db/cash-migrate";
import { applySettingsMigration41 } from "../../src/server/db/settings-migrate";
import { createProtectedLocalKeys, type LocalKeyConfiguration } from "../../src/server/bootstrap/keys";
import { bindTrustedDesktopOwnerInteraction, createTrustedOwnerEnrollmentEntry, inspectOwnerEnrollment } from "../../src/server/bootstrap/owner-enrollment";
import { runTrustedFirstRunSetup } from "../../src/server/auth/provision";
import { passwordCallbacks } from "../../src/server/auth/password";
import type { LocalTlsMaterial } from "../../src/server/hosting/https";

const fault = vi.hoisted(() => ({ sql: false, lostCommit: false, anchor: false, copyAfterBackup: false, lostCurrent: false, currentPublications: 0, afterClose: undefined as undefined | (() => void) }));
vi.mock("../../src/server/bootstrap/windows", async original => {
  const actual = await original<typeof import("../../src/server/bootstrap/windows")>();
  return { ...actual, windowsProtection: async (message: Readonly<Record<string, string>>) => {
    if (fault.anchor && message.operation === "record-create" && message.name === "enrolled.dpapi") {
      fault.anchor = false; throw new actual.BootstrapRejected();
    }
    const result = await actual.windowsProtection(message);
    if (message.operation === "candidate-append" && message.payload && JSON.parse(Buffer.from(message.payload,"base64").toString("utf8")).kind === "CURRENT") {
      fault.currentPublications++; if (fault.lostCurrent) { fault.lostCurrent=false; throw new actual.BootstrapRejected(); }
    }
    return result;
  } };
});
vi.mock("../../src/server/auth/database", async original => {
  const actual = await original<typeof import("../../src/server/auth/database")>();
  return { ...actual, openAsyncOwner: (config: Parameters<typeof actual.openAsyncOwner>[0]) => {
    const owner = actual.openAsyncOwner(config), run = owner.run, close = owner.close;
    owner.close = async () => { await close(); const action = fault.afterClose; fault.afterClose = undefined; action?.(); };
    owner.run = (sql, values) => {
      const result = run(sql, values);
      if (fault.sql && sql.startsWith("INSERT INTO auth_principals")) { fault.sql = false; throw Error("TEST actual first account write fault"); }
      return result;
    };
    return owner;
  } };
});
vi.mock("../../src/server/auth/provision", async original => {
  const actual = await original<typeof import("../../src/server/auth/provision")>();
  return { ...actual, runTrustedFirstRunSetup: async (...args: Parameters<typeof actual.runTrustedFirstRunSetup>) => {
    const result = await actual.runTrustedFirstRunSetup(...args);
    if (fault.lostCommit) { fault.lostCommit = false; throw Error("TEST lost actual COMMIT acknowledgement"); }
    return result;
  } };
});

vi.mock("../../src/server/backup/snapshot", async original => {
  const actual = await original<typeof import("../../src/server/backup/snapshot")>();
  return { ...actual, openProofDatabase: (...args: Parameters<typeof actual.openProofDatabase>) => {
    const db = actual.openProofDatabase(...args), backup = db.backup;
    db.backup = async (...parameters: Parameters<typeof backup>) => {
      const result = await backup.apply(db, parameters);
      if (fault.copyAfterBackup) { fault.copyAfterBackup = false; throw Error("TEST lost actual native copy acknowledgement"); }
      return result;
    };
    return db;
  } };
});

const root = path.resolve("test-results/sqlite-b1b-part1");
mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "production-security41-"));
const migrations = path.resolve("src/server/db/migrations");
let tls: LocalTlsMaterial;
let candidateTls: LocalTlsMaterial;
let reissuedSourceTls: LocalTlsMaterial;
let blank41: string;
const stable = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v);

beforeAll(async () => {
  const cert = path.join(run, "tls"); mkdirSync(cert);
  const passphrase = randomBytes(36).toString("base64url"), execute = promisify(execFile);
  const openssl = (...args: string[]) => { const job = execute("C:\\Program Files\\Git\\usr\\bin\\openssl.exe", args, { cwd: cert, windowsHide: true }); job.child.stdin!.end(passphrase); return job; };
  await openssl("req", "-x509", "-newkey", "rsa:2048", "-passout", "stdin", "-days", "1", "-subj", "/CN=POS-PRODUCTION-BOUNDARY-TEST", "-addext", "basicConstraints=critical,CA:TRUE", "-keyout", "ca.key", "-out", "ca.pem");
  await openssl("req", "-newkey", "rsa:2048", "-passout", "stdin", "-subj", "/CN=localhost", "-keyout", "leaf.key", "-out", "leaf.csr");
  writeFileSync(path.join(cert, "leaf.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n");
  await openssl("x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-passin", "stdin", "-CAcreateserial", "-days", "1", "-sha256", "-extfile", "leaf.ext", "-out", "leaf.pem");
  tls = { key: Buffer.from(createPrivateKey({ key: readFileSync(path.join(cert, "leaf.key")), passphrase }).export({ type: "pkcs8", format: "pem" })), certificate: readFileSync(path.join(cert, "leaf.pem")), trustAnchor: readFileSync(path.join(cert, "ca.pem")) };
  await openssl("req", "-newkey", "rsa:2048", "-passout", "stdin", "-subj", "/CN=localhost", "-keyout", "candidate.key", "-out", "candidate.csr");
  await openssl("x509", "-req", "-in", "candidate.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-passin", "stdin", "-CAcreateserial", "-days", "1", "-sha256", "-extfile", "leaf.ext", "-out", "candidate.pem");
  candidateTls = { key: Buffer.from(createPrivateKey({ key: readFileSync(path.join(cert, "candidate.key")), passphrase }).export({ type: "pkcs8", format: "pem" })), certificate: readFileSync(path.join(cert, "candidate.pem")), trustAnchor: readFileSync(path.join(cert, "ca.pem")) };
  await openssl("x509","-req","-in","leaf.csr","-CA","ca.pem","-CAkey","ca.key","-passin","stdin","-CAcreateserial","-days","1","-sha256","-extfile","leaf.ext","-out","reissued-source.pem");
  reissuedSourceTls={key:Buffer.from(tls.key),certificate:readFileSync(path.join(cert,"reissued-source.pem")),trustAnchor:Buffer.from(tls.trustAnchor)};
  const base = path.join(run, "blank41"); mkdirSync(base);
  const db = openDatabase({ directory: base, filename: "test.sqlite3", mode: "test", create: true });
  try { applyMigrations(db, migrations); applySalesMigration36(db); applyReturnsMigration37(db); applyExpensesMigration38(db); applyInvoicesMigration39(db); applyCashMigration40(db); applySettingsMigration41(db); } finally { db.close(); }
  blank41 = path.join(base, "test.sqlite3");
});

async function fixture(version: 8 | 41 = 41) {
  const directory = mkdtempSync(path.join(run, "case-")), data = path.join(directory, "data");
  const { storage } = await import("../../src/server/backup/storage"); await storage(directory,"initialize"); mkdirSync(data); await storage(data,"initialize");
  let manifest = migrations;
  if (version === 41) copyFileSync(blank41, path.join(data, "test.sqlite3"));
  else {
    manifest = path.join(directory, "migrations8"); mkdirSync(manifest);
    for (const name of readdirSync(migrations).filter(n => /^000[1-8]_.*\.sql$/.test(n))) copyFileSync(path.join(migrations, name), path.join(manifest, name));
    const db = openDatabase({ directory: data, filename: "test.sqlite3", mode: "test", create: true }); try { applyMigrations(db, manifest); } finally { db.close(); }
  }
  const config: LocalKeyConfiguration = { directory, database: { directory: data, filename: "test.sqlite3", mode: "test", create: false }, migrationsDirectory: manifest };
  const inspect = <T>(read: (db: ReturnType<typeof openDatabase>) => T) => { const db = openDatabase(config.database); try { return read(db); } finally { db.close(); } };
  const history = inspect(db => stable(db.all("SELECT * FROM schema_migrations ORDER BY version")));
  await createProtectedLocalKeys(config, tls);
  const values = { ADMIN: randomBytes(20).toString("base64url"), SALESPERSON: randomBytes(20).toString("base64url") };
  const read = vi.fn(async () => values);
  const interaction = bindTrustedDesktopOwnerInteraction({ confirm: async request => request.action === "FIRST_ENROLLMENT" ? "CONFIRM_FIRST_ENROLLMENT" : "CONFIRM_MATCHING_COMMITTED_ENROLLMENT", readPasswords: read });
  const entry = createTrustedOwnerEnrollmentEntry(config, interaction);
  return { config, inspect, history, values, read, entry, journal: path.join(directory, "protected-identity/enrollment") };
}

it("fresh exact41 uses the sole writer, real hashes and DPAPI V2 receipts; repeated enrollment is denied", async () => {
  const f = await fixture();
  expect(await f.entry.enroll()).toEqual({ enrollmentAccepted: true, productionActivation: false });
  expect((await inspectOwnerEnrollment(f.config)).status).toBe("ENROLLED");
  expect(f.inspect(db => db.all("SELECT id,role FROM auth_users ORDER BY id"))).toEqual([{ id: "ADMIN", role: "ADMIN" }, { id: "SALESPERSON", role: "SALESPERSON" }]);
  for (const role of ["ADMIN", "SALESPERSON"] as const) {
    const hash = f.inspect(db => String(db.get("SELECT password FROM auth_credentials WHERE id=?", [role])?.password));
    expect(await passwordCallbacks.verify({ hash, password: f.values[role] })).toBe(true);
    for (const name of readdirSync(f.journal)) expect(readFileSync(path.join(f.journal, name)).includes(Buffer.from(f.values[role]))).toBe(false);
  }
  const { readEnrollmentJournal } = await import("../../src/server/bootstrap/journal");
  const { inspectLocalVault } = await import("../../src/server/bootstrap/keys");
  const { enrollmentDigest } = await import("../../src/server/bootstrap/database");
  const { reviewedMigrations } = await import("../../src/server/db/reviewed-schema");
  const records = await readEnrollmentJournal(await inspectLocalVault(f.config), enrollmentDigest(reviewedMigrations().map(m => [m.version, m.name, m.checksum])));
  expect(records).toHaveLength(3); expect(records.every(r => r.format === "POS_ENROLL_SCHEMA41_V2")).toBe(true);
  expect(f.inspect(db => stable(db.all("SELECT * FROM schema_migrations ORDER BY version")))).toBe(f.history);
  await expect(f.entry.enroll()).rejects.toThrow("Protected setup unavailable."); expect(f.read).toHaveBeenCalledTimes(1);
  expect(f.inspect(db => db.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n)).toBe(BigInt(0));
});

it("forged owner interaction and an unleased schema41 writer cannot read passwords or provision", async () => {
  const f = await fixture();
  expect(() => createTrustedOwnerEnrollmentEntry(f.config, {} as Parameters<typeof createTrustedOwnerEnrollmentEntry>[1])).toThrow("Protected setup unavailable.");
  const read = vi.fn(async () => f.values);
  await expect(runTrustedFirstRunSetup(f.config, read)).rejects.toThrow("Account setup was rejected."); expect(read).not.toHaveBeenCalled();
  expect(f.inspect(db => db.get("SELECT count(*) AS n FROM auth_users")?.n)).toBe(BigInt(0));
});

it("actual first-account SQL failure rolls back all41 state and protected abort allows a fresh confirmed retry", async () => {
  const f = await fixture(); fault.sql = true;
  await expect(f.entry.enroll()).rejects.toThrow("Protected setup unavailable.");
  expect(f.inspect(db => db.get("SELECT count(*) AS n FROM auth_users")?.n)).toBe(BigInt(0));
  expect((await inspectOwnerEnrollment(f.config)).status).toBe("RETRY_REQUIRES_OWNER");
  expect(await f.entry.enroll()).toEqual({ enrollmentAccepted: true, productionActivation: false }); expect(f.read).toHaveBeenCalledTimes(2);
});

it("lost actual SQL COMMIT acknowledgement stays recovery-locked and never provisions again", async () => {
  const f = await fixture(); fault.lostCommit = true;
  await expect(f.entry.enroll()).rejects.toThrow("Protected setup unavailable.");
  expect(f.inspect(db => db.get("SELECT count(*) AS n FROM auth_users")?.n)).toBe(BigInt(2));
  expect((await inspectOwnerEnrollment(f.config)).status).toBe("RECOVERY_REVIEW_REQUIRED");
  await expect(f.entry.enroll()).rejects.toThrow("Protected setup unavailable."); expect(f.read).toHaveBeenCalledTimes(1);
  expect(readdirSync(f.journal)).toEqual(["00000001.intent.dpapi"]);
});

it("actual child death after durable intent preserves empty SQL and locks recovery after process restart", async () => {
  const f = await fixture(), helper = path.resolve("tests/helpers/production-security-child.mjs");
  const child = fork(helper, [], { cwd: process.cwd(), execArgv: ["--experimental-transform-types", "--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"], env: { ...process.env, NODE_ENV: "test" }, stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true });
  const message = new Promise<unknown>((resolve, reject) => { child.once("message", resolve); child.once("error", reject); child.once("exit", () => reject(Error("TEST child exited before intent"))); });
  child.send({ action: "pause-at-password", config: f.config });
  expect(await message).toEqual({ status: "DURABLE_INTENT_PASSWORD_PENDING" });
  await new Promise<void>(resolve => { child.once("exit", () => resolve()); child.kill(); });
  expect(f.inspect(db => db.get("SELECT count(*) AS n FROM auth_users")?.n)).toBe(BigInt(0));
  const restart = fork(helper, [], { cwd: process.cwd(), execArgv: ["--experimental-transform-types", "--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"], env: { ...process.env, NODE_ENV: "test" }, stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true });
  const observed = new Promise<unknown>((resolve, reject) => { restart.once("message", resolve); restart.once("error", reject); });
  restart.send({ action: "inspect", config: f.config });
  expect(await observed).toEqual({ status: "RECOVERY_REVIEW_REQUIRED", productionActivation: false });
  await new Promise<void>(resolve => { if (restart.exitCode !== null) resolve(); else restart.once("exit", () => resolve()); });
});

it("altered native DPAPI completion cannot validate an otherwise correct enrolled41 database", async () => {
  const f = await fixture(); await f.entry.enroll();
  const file = path.join(f.journal, "00000001.committed.dpapi"), bytes = readFileSync(file); bytes[bytes.length - 1] ^= 1; writeFileSync(file, bytes);
  expect((await inspectOwnerEnrollment(f.config)).status).toBe("RECOVERY_REVIEW_REQUIRED");
  await expect(f.entry.enroll()).rejects.toThrow("Protected setup unavailable."); expect(f.read).toHaveBeenCalledTimes(1);
});

it("the exact8 path retains V1 semantics, original migration history and no production activation", async () => {
  const f = await fixture(8);
  expect(await f.entry.enroll()).toEqual({ enrollmentAccepted: true, productionActivation: false });
  expect((await inspectOwnerEnrollment(f.config)).status).toBe("ENROLLED");
  expect(f.inspect(db => stable(db.all("SELECT * FROM schema_migrations ORDER BY version")))).toBe(f.history);
  expect(f.inspect(db => db.get("SELECT user_version FROM pragma_user_version")?.user_version)).toBe(BigInt(8));
});

it("confirmed41 COMMITTED without final anchor permits only owner-confirmed finalization without reading passwords again", async () => {
  const f = await fixture(); fault.anchor = true;
  await expect(f.entry.enroll()).rejects.toThrow("Protected setup unavailable.");
  expect((await inspectOwnerEnrollment(f.config)).status).toBe("RECONCILIATION_REQUIRES_OWNER");
  expect(f.read).toHaveBeenCalledTimes(1);
  expect(await f.entry.reconcile()).toEqual({ enrollmentAccepted: true, productionActivation: false });
  expect(f.read).toHaveBeenCalledTimes(1);
  expect((await inspectOwnerEnrollment(f.config)).status).toBe("ENROLLED");
  expect(f.inspect(db => db.get("SELECT count(*) AS n FROM auth_users")?.n)).toBe(BigInt(2));
});

it("cancelled41 owner confirmation reads no passwords and creates no intent or accounts", async () => {
  const f = await fixture();
  const handle = bindTrustedDesktopOwnerInteraction({ confirm: async () => "CANCELLED", readPasswords: f.read });
  await expect(createTrustedOwnerEnrollmentEntry(f.config, handle).enroll()).rejects.toThrow("Protected setup unavailable.");
  expect(f.read).not.toHaveBeenCalled();
  expect((await inspectOwnerEnrollment(f.config)).status).toBe("UNENROLLED");
  expect(f.inspect(db => db.get("SELECT count(*) AS n FROM auth_users")?.n)).toBe(BigInt(0));
});

async function journalFixture(version: 8 | 41, purpose: "SCHEMA8_TO_41" | "RETIRE41") {
  const f = await fixture(version); await f.entry.enroll();
  const { inspectLocalVault } = await import("../../src/server/bootstrap/keys");
  const { readEnrollmentJournal } = await import("../../src/server/bootstrap/journal");
  const { enrollmentDigest } = await import("../../src/server/bootstrap/database");
  const { protectedManifestDigest } = await import("../../src/server/bootstrap/maintenance-journal");
  const vault = await inspectLocalVault(f.config);
  const anchor = (await readEnrollmentJournal(vault, protectedManifestDigest(version))).find(r => r.kind === "ENROLLED")!;
  const state = () => enrollmentDigest(f.inspect(db => [db.all("SELECT * FROM auth_users ORDER BY id"), db.all("SELECT * FROM auth_credentials ORDER BY id"), db.all("SELECT * FROM auth_principals ORDER BY id"), db.all("SELECT * FROM schema_migrations ORDER BY version")]));
  // Journal primitive test: these are non-authorizing fixture metadata, NOT
  // evidence of a verified archive, SQL migration or runtime writer retirement.
  const sourceStateDigest = state();
  const intent: import("../../src/server/bootstrap/maintenance-journal").MaintenanceIntent = {
    format: "POS_SCHEMA41_MAINTENANCE_V1", kind: "INTENT", sequence: "1", operationId: (await import("node:crypto")).randomUUID(), purpose,
    installationId: vault.metadata.installationId, deviceId: vault.metadata.deviceId, vaultDigest: vault.vaultDigest, databaseFingerprint: vault.databaseFingerprint,
    anchorSchema: version === 8 ? "8" : "41", anchorDigest: enrollmentDigest(anchor), sourceSchema: version === 8 ? "8" : "41", targetSchema: "41",
    sourceManifestDigest: protectedManifestDigest(version), targetManifestDigest: protectedManifestDigest(41),
    backupArchiveId: (await import("node:crypto")).randomUUID(), backupCiphertextSha256: enrollmentDigest("JOURNAL_PRIMITIVE_ONLY_NOT_A_VERIFIED_ARCHIVE"),
    sourceStateDigest, expectedTargetStateDigest: sourceStateDigest, destinationFingerprint: vault.databaseFingerprint,
    createdAtMs: String(Date.now()), previousOutcomeDigest: null,
  };
  return { ...f, state, vault, intent, enrollmentDigest };
}

it("maintenance DPAPI primitive requires genuine ownership and preserved anchor; intent/abort is durable, bounded and duplicate-safe", async () => {
  const f = await journalFixture(8, "SCHEMA8_TO_41");
  const { appendProtectedMaintenance, readProtectedMaintenance, classifyProtectedMaintenance } = await import("../../src/server/bootstrap/maintenance-journal");
  const { withBootstrapOwnership } = await import("../../src/server/bootstrap/ownership");
  await expect(appendProtectedMaintenance(f.config, {} as Parameters<typeof appendProtectedMaintenance>[1], f.intent)).rejects.toThrow("Protected setup unavailable.");
  expect((await readProtectedMaintenance(f.vault))).toHaveLength(0);
  await withBootstrapOwnership(f.config.database, async (_retain, lease) => {
    await appendProtectedMaintenance(f.config, lease, f.intent);
    expect(classifyProtectedMaintenance(await readProtectedMaintenance(f.vault)).status).toBe("RECOVERY_REVIEW_REQUIRED");
    const { kind: _kind, previousOutcomeDigest: _prior, ...common } = f.intent; void _kind; void _prior;
    const outcome = { ...common, kind: "ABORTED" as const, intentDigest: f.enrollmentDigest(f.intent), observedStateDigest: f.state() };
    expect(outcome.observedStateDigest).toBe(f.intent.sourceStateDigest);
    await appendProtectedMaintenance(f.config, lease, outcome);
    expect(classifyProtectedMaintenance(await readProtectedMaintenance(f.vault)).status).toBe("ABORTED");
    await expect(appendProtectedMaintenance(f.config, lease, f.intent)).rejects.toThrow("Protected setup unavailable.");
    const forged = { ...f.intent, sequence: "2", operationId: (await import("node:crypto")).randomUUID(), previousOutcomeDigest: f.enrollmentDigest("WRONG_CHAIN") };
    await expect(appendProtectedMaintenance(f.config, lease, forged)).rejects.toThrow("Protected setup unavailable.");
  });
  expect(f.state()).toBe(f.intent.sourceStateDigest);
  expect((await readProtectedMaintenance(f.vault))).toHaveLength(2);
});

it("maintenance terminal retirement storage rejects further intent and corrupted DPAPI; it grants no SQL/runtime capability", async () => {
  const f = await journalFixture(41, "RETIRE41");
  const { appendProtectedMaintenance, readProtectedMaintenance, classifyProtectedMaintenance } = await import("../../src/server/bootstrap/maintenance-journal");
  const { withBootstrapOwnership } = await import("../../src/server/bootstrap/ownership");
  await withBootstrapOwnership(f.config.database, async (_retain, lease) => {
    await appendProtectedMaintenance(f.config, lease, f.intent);
    const { kind: _kind, previousOutcomeDigest: _prior, ...common } = f.intent; void _kind; void _prior;
    const outcome = { ...common, kind: "COMMITTED" as const, intentDigest: f.enrollmentDigest(f.intent), observedStateDigest: f.state() };
    await appendProtectedMaintenance(f.config, lease, outcome);
    expect(classifyProtectedMaintenance(await readProtectedMaintenance(f.vault)).status).toBe("RETIRED");
    await expect(appendProtectedMaintenance(f.config, lease, { ...f.intent, sequence: "2", operationId: (await import("node:crypto")).randomUUID(), previousOutcomeDigest: f.enrollmentDigest(outcome) })).rejects.toThrow("Protected setup unavailable.");
  });
  expect(f.state()).toBe(f.intent.sourceStateDigest);
  const file = path.join(f.config.directory, "protected-identity/maintenance/00000001.committed.dpapi"), bytes = readFileSync(file); bytes[bytes.length - 1] ^= 1; writeFileSync(file, bytes);
  await expect(readProtectedMaintenance(f.vault)).rejects.toThrow("Protected setup unavailable.");
});

it("patched Node serves genuine bounded TLS and survives aborted handshakes while preserving origin and health-only admission", async () => {
  const net = await import("node:net"), https = await import("node:https"), tlsClient = await import("node:tls");
  const { createLocalHttpsHost, validateLocalOrigins } = await import("../../src/server/hosting/https");
  const probe = net.createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const address = probe.address(); if (!address || typeof address === "string") throw Error("TEST port unavailable");
  const port = address.port; await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const origins = await validateLocalOrigins(port, { ADMIN: "https://localhost:" + port, SALESPERSON: "https://127.0.0.1:" + port });
  const host = createLocalHttpsHost(port, origins, tls, async (_request, response) => { response.statusCode = 200; response.end('{"ok":true}'); });
  const request = (url: string, origin = origins.ADMIN) => new Promise<{ status: number; cache: string | undefined }>((resolve, reject) => {
    const req = https.get({ hostname: "127.0.0.1", servername: "localhost", port, path: url, ca: tls.trustAnchor, agent: false, headers: { host: "localhost:" + port, origin } }, response => {
      response.resume(); response.once("end", () => resolve({ status: response.statusCode!, cache: response.headers["cache-control"] }));
    }); req.once("error", reject);
  });
  try {
    await host.listen(); expect(host.server.address()).toMatchObject({ address: "127.0.0.1", port });
    expect(await request("/api/health")).toEqual({ status: 200, cache: "no-store" });
    expect((await request("/api/auth/login")).status).toBe(404);
    expect((await request("/api/health", "https://foreign.invalid")).status).toBe(403);
    await Promise.all(Array.from({ length: 12 }, () => new Promise<void>(resolve => {
      const socket = tlsClient.connect({ host: "127.0.0.1", servername: "localhost", port, ca: tls.trustAnchor });
      socket.once("connect", () => socket.destroy()); socket.once("error", () => socket.destroy()); socket.once("close", () => resolve());
    })));
    expect((await request("/api/health")).status).toBe(200);
  } finally { await host.close(); }
});

it("exact8 pre-maintenance archive preserves protected abort history, source rows and fresh restored credentials; proofs reject forgery, expiry and ciphertext tampering", async () => {
  const started = Date.now(), stage = (name: string) => console.info("AUTH8_TEST_STAGE", name, Date.now() - started);
  stage("fixture-start"); const f = await fixture(8); stage("fixture-ready"); fault.sql = true;
  await expect(f.entry.enroll()).rejects.toThrow("Protected setup unavailable."); await f.entry.enroll(); stage("enrolled-after-rollback");
  const { createAuthenticationBackup8, authenticationBackup8Evidence } = await import("../../src/server/bootstrap/authentication-backup");
  const { createTestCustody, custodyMetadata, decryptSnapshot, withTestRecoveryMaterial, importTestPortableRecovery, hashFile, signProtectedEvidence } = await import("../../src/server/backup/crypto");
  const { storage } = await import("../../src/server/backup/storage");
  const { withBootstrapOwnership } = await import("../../src/server/bootstrap/ownership");
  const { openProofDatabase, fingerprint } = await import("../../src/server/backup/snapshot");
  const { enrollmentDigest } = await import("../../src/server/bootstrap/database");
  const { openAuthorizationGateway } = await import("../../src/server/auth/gateway");
  const source = path.join(f.config.database.directory, f.config.database.filename);
  const state = () => { const db = openProofDatabase(source); try { return enrollmentDigest(fingerprint(db)); } finally { db.close(); } };
  const before = state(), custodyDirectory = path.join(f.config.directory, "backup-keys"), directory = path.join(f.config.directory, "precopy"), restoredDirectory = path.join(f.config.directory, "restored-private8");
  [custodyDirectory, directory, restoredDirectory].forEach(d => mkdirSync(d));
  const custody = await createTestCustody(custodyDirectory), archiveId = (await import("node:crypto")).randomUUID(), archive = path.join(directory, archiveId + ".age");
  stage("custody-ready");
  let result!: Awaited<ReturnType<typeof createAuthenticationBackup8>>, savedLease!: Parameters<typeof authenticationBackup8Evidence>[2];
  let decoded: unknown, portableCustody!: typeof custody;
  await withBootstrapOwnership(f.config.database, async (_retain, lease) => {
    stage("lease-held"); savedLease = lease;
    result = await createAuthenticationBackup8(f.config, lease, custody, directory, archiveId);
    stage("archive-verified"); const evidence = await authenticationBackup8Evidence(result, f.config, lease);
    stage("proof-revalidated"); expect(evidence.archiveId).toBe(archiveId); expect(evidence.ciphertextSha256).toBe((await hashFile(archive)).sha256);
    expect(() => JSON.stringify(result)).toThrow("Backup or recovery unavailable.");
    await expect(authenticationBackup8Evidence({}, f.config, lease)).rejects.toThrow("Backup or recovery unavailable.");
    expect(readdirSync(directory)).toEqual([archiveId + ".age"]);
    await storage(restoredDirectory, "initialize");
    const trust = custodyMetadata(custody);
    const portable = await withTestRecoveryMaterial(custody, identity => importTestPortableRecovery(identity, { id: trust.id, signingPublic: trust.signingPublic }));
    expect(() => signProtectedEvidence(portable, { test: true })).toThrow("Backup or recovery unavailable.");
    await expect(decryptSnapshot(portable, archive, path.join(restoredDirectory, "wrong-schema.pending"))).rejects.toThrow("Backup or recovery unavailable.");
    stage("default41-rejected-auth8"); const restored = path.join(restoredDirectory, "restored8.sqlite3");
    const manifest = await decryptSnapshot(portable, archive, restored, undefined, undefined, evidence.ciphertextSha256, 8);
    decoded = manifest; portableCustody = portable;
    stage("portable-readback"); expect(manifest.format).toBe("POS_AUTH8_SNAPSHOT_V1"); expect(manifest.schema).toBe(8);
    const facts = manifest.fingerprint as { database: unknown; enrollmentRecords: readonly unknown[] };
    expect(facts.enrollmentRecords).toHaveLength(5);
    const db = openProofDatabase(restored); try { expect(enrollmentDigest(fingerprint(db))).toBe(enrollmentDigest(facts.database)); } finally { db.close(); }
    // Failure injection is confined to disposable files. Retain a byte-identical
    // authenticated archive before corrupting the proof-bound fixture copy.
    const retained = path.join(restoredDirectory, "retained.age"); copyFileSync(archive, retained);
    expect((await hashFile(retained)).sha256).toBe(evidence.ciphertextSha256);
    const bytes = readFileSync(archive); bytes[bytes.length - 1] ^= 1; writeFileSync(archive, bytes);
    await expect(authenticationBackup8Evidence(result, f.config, lease)).rejects.toThrow("Backup or recovery unavailable.");
    expect(state()).toBe(before); stage("tampered-proof-rejected");
  });
  await expect(authenticationBackup8Evidence(result, f.config, savedLease)).rejects.toThrow("Backup or recovery unavailable.");
  stage("lease-closed");
  const { acquireRuntimeOwnership } = await import("../../src/server/hosting/ownership"), { createAuthentication8ReadbackAdmission } = await import("../../src/server/bootstrap/writer-admission");
  const dbOptions = { directory: restoredDirectory, filename: "restored8.sqlite3", mode: "test" as const, create: false }, config = { directory: restoredDirectory, database: dbOptions, migrationsDirectory: f.config.migrationsDirectory };
  const signingSecrets = { ADMIN: randomBytes(48).toString("base64url"), SALESPERSON: randomBytes(48).toString("base64url") };
  const runtime = await acquireRuntimeOwnership(path.join(restoredDirectory, "restored8.sqlite3"));
  try {
    const admission = await createAuthentication8ReadbackAdmission(config, runtime, decoded, portableCustody, path.join(restoredDirectory, "retained.age"), signingSecrets);
    const gateway = await openAuthorizationGateway({ database: dbOptions, migrationsDirectory: f.config.migrationsDirectory, protectedAdmission: admission,
      origins: { ADMIN: "https://localhost:7443", SALESPERSON: "https://127.0.0.1:7443" }, signingSecrets, sessionLifetimeSeconds: 120 });
    try {
      const admin = await gateway.verifyAdminPassword(f.values.ADMIN); expect((await gateway.issueAdminSession(admin)).status).toBe(200);
      const staff = await gateway.verifySalespersonPassword(f.values.SALESPERSON); expect((await gateway.issueSalespersonSession(staff)).status).toBe(200);
      await expect(gateway.withAdminTransaction(new Request("https://localhost:7443"), async () => {})).rejects.toThrow("Access denied.");
    } finally { await gateway.close(); }
  } finally { await runtime.close(); }
  expect(state()).toBe(before); stage("fresh-logins-and-source-preserved");
});


it("authentication8 failure/cancellation preserves source and existing files; decrypt-only B cannot create a signed pre-copy", async () => {
  const f = await fixture(8); await f.entry.enroll();
  const { createAuthenticationBackup8 } = await import("../../src/server/bootstrap/authentication-backup");
  const { createTestCustody, custodyMetadata, withTestRecoveryMaterial, importTestPortableRecovery } = await import("../../src/server/backup/crypto");
  const { withBootstrapOwnership } = await import("../../src/server/bootstrap/ownership");
  const { openProofDatabase, fingerprint } = await import("../../src/server/backup/snapshot");
  const { enrollmentDigest } = await import("../../src/server/bootstrap/database");
  const { randomUUID } = await import("node:crypto");
  const source = path.join(f.config.database.directory, f.config.database.filename);
  const state = () => { const db = openProofDatabase(source); try { return enrollmentDigest(fingerprint(db)); } finally { db.close(); } };
  const before = state(), keys = path.join(f.config.directory, "negative-backup-keys"), staging = path.join(f.config.directory, "negative-backup-staging"), occupied = path.join(f.config.directory, "occupied-backup-staging");
  [keys, staging, occupied].forEach(d => mkdirSync(d));
  const sentinel = path.join(occupied, "existing-evidence.txt"); writeFileSync(sentinel, "PRESERVE_EXISTING_TEST_EVIDENCE");
  const custody = await createTestCustody(keys), trust = custodyMetadata(custody);
  const portable = await withTestRecoveryMaterial(custody, identity => importTestPortableRecovery(identity, { id: trust.id, signingPublic: trust.signingPublic }));
  await expect(createAuthenticationBackup8(f.config, {} as Parameters<typeof createAuthenticationBackup8>[1], custody, staging, randomUUID())).rejects.toThrow("Backup or recovery unavailable.");
  await withBootstrapOwnership(f.config.database, async (_retain, lease) => {
    const cancelled = new AbortController(); cancelled.abort();
    await expect(createAuthenticationBackup8(f.config, lease, custody, staging, randomUUID(), cancelled.signal)).rejects.toThrow("Backup or recovery unavailable.");
    expect(readdirSync(staging)).toEqual([]);
    await expect(createAuthenticationBackup8(f.config, lease, custody, occupied, randomUUID())).rejects.toThrow("Backup or recovery unavailable.");
    expect(readFileSync(sentinel, "utf8")).toBe("PRESERVE_EXISTING_TEST_EVIDENCE");
    expect(readdirSync(occupied)).toEqual(["existing-evidence.txt"]);
    await expect(createAuthenticationBackup8(f.config, lease, portable, staging, randomUUID())).rejects.toThrow("Backup or recovery unavailable.");
    expect(readdirSync(staging)).toEqual([]);
    expect(state()).toBe(before);
  });
  expect(state()).toBe(before);
});


// These tests authenticate journal STORAGE facts, not a verified migration or
// selected writer. Fixture target/archive digests intentionally confer no authority.
async function candidateStorageFixture() {
  const f = await journalFixture(8, "SCHEMA8_TO_41");
  const { candidateRecordBytes, candidateRecordDigest, candidateLedgerContext, readProtectedCandidateLedger, classifyCandidateLedger } = await import("../../src/server/bootstrap/candidate-records");
  const { windowsProtection } = await import("../../src/server/bootstrap/windows");
  const { withBootstrapOwnership, hasActiveBootstrapLease } = await import("../../src/server/bootstrap/ownership");
  const { randomUUID } = await import("node:crypto");
  const context = candidateLedgerContext(f.vault, f.intent.anchorDigest);
  const first: CandidateRecord = { format: "POS_CANDIDATE_LEDGER_V1", kind: "INTENT", sequence: "1", previousDigest: null, operationId: randomUUID(), purpose: "UPGRADE8",
    installationId: f.vault.metadata.installationId, deviceId: f.vault.metadata.deviceId, vaultDigest: f.vault.vaultDigest, originalAnchorDigest: f.intent.anchorDigest,
    rootDatabaseFingerprint: f.vault.databaseFingerprint, sourceFileIdentity: f.vault.databaseFingerprint, destinationFileIdentity: f.enrollmentDigest("STORAGE_ONLY_TARGET_" + randomUUID()),
    sourceSchema: "8", sourceStateDigest: f.state(), targetSpecificationDigest: f.intent.targetManifestDigest,
    backupArchiveId: randomUUID(), backupCiphertextSha256: f.enrollmentDigest("STORAGE_ONLY_NO_ACTUAL_ARCHIVE"), createdAtMs: String(Date.now()),
    intentDigest: null, targetStateDigest: null, targetVaultDigest: null, generation: null };
  let activeLease: Parameters<typeof hasActiveBootstrapLease>[0];
  const message = (record: CandidateRecord) => ({ ...context, operation: "candidate-append", payload: candidateRecordBytes(record).toString("base64") });
  const append = async (record: CandidateRecord) => {
    expect(hasActiveBootstrapLease(activeLease, f.config.database)).toBe(true);
    expect(await windowsProtection(message(record))).toBe(true);
  };
  const owned = async (work: () => Promise<void>) => {
    let failed = false, failure: unknown;
    try { await withBootstrapOwnership(f.config.database, async (_retain, lease) => {
      activeLease = lease;
      try { await work(); } catch (error) { failed = true; failure = error; throw error; } finally { activeLease = undefined; }
    }); } catch (error) { if (failed) throw failure; throw error; }
  };
  const next = (base: CandidateRecord, previous: CandidateRecord, fields: Partial<CandidateRecord>) => ({ ...base, sequence: String(Number(previous.sequence) + 1), previousDigest: candidateRecordDigest(previous), createdAtMs: String(Math.max(Date.now(), Number(previous.createdAtMs))), ...fields }) as CandidateRecord;
  const quarantine = (intent: CandidateRecord, previous = intent) => next(intent, previous, { kind: "QUARANTINED_NO_ADMISSION", intentDigest: candidateRecordDigest(intent), targetStateDigest: null, targetVaultDigest: null, generation: null });
  const commit = (intent: CandidateRecord, previous = intent) => next(intent, previous, { kind: "COMMITTED", intentDigest: candidateRecordDigest(intent), targetStateDigest: f.enrollmentDigest("STORAGE_ONLY_NOT_VERIFIED_SQL"), targetVaultDigest: f.enrollmentDigest("STORAGE_ONLY_NOT_DESTINATION_KEYS"), generation: null });
  const read = () => readProtectedCandidateLedger(f.vault, f.intent.anchorDigest);
  return { ...f, context, first, append, owned, next, quarantine, commit, read, message, digest: candidateRecordDigest, classify: classifyCandidateLedger, native: windowsProtection };
}

it("candidate ledger mutex storage preserves source, chains terminal quarantine and CURRENT generations, and rejects old-writer facts", async () => {
  const f = await candidateStorageFixture(), before = f.state();
  expect(f.classify(await f.read()).status).toBe("ABSENT");
  await f.owned(async () => {
    await f.append(f.first);
    expect(f.classify(await f.read()).status).toBe("RECOVERY_REVIEW_REQUIRED");
    const q = f.quarantine(f.first);
    await expect(f.native({ ...f.message(q), vaultDigest: f.enrollmentDigest("WRONG_ROOT_CUSTODY") })).rejects.toThrow("Protected setup unavailable.");
    await f.append(q);
    expect(f.classify(await f.read()).status).toBe("QUARANTINED_ONLY");
    await expect(f.append(f.commit(f.first, q))).rejects.toThrow("Protected setup unavailable.");
    const fresh = f.next(f.first, q, { operationId: (await import("node:crypto")).randomUUID(), destinationFileIdentity: f.enrollmentDigest("DIFFERENT_STORAGE_TARGET") });
    await f.append(fresh); const committed = f.commit(fresh); await f.append(committed);
    expect(f.classify(await f.read()).status).toBe("RECOVERY_REVIEW_REQUIRED");
    await expect(f.append(f.quarantine(fresh, committed))).rejects.toThrow("Protected setup unavailable.");
    const current = f.next(committed, committed, { kind: "CURRENT", generation: "1" }); await f.append(current);
    const classified = f.classify(await f.read()); expect(classified.status).toBe("RECORDED_CURRENT"); expect(classified.recordedCurrent?.destinationFileIdentity).toBe(fresh.destinationFileIdentity);
    const { inspectLocalVault } = await import("../../src/server/bootstrap/keys");
    const { readEnrollmentJournal } = await import("../../src/server/bootstrap/journal");
    const { protectedManifestDigest } = await import("../../src/server/bootstrap/maintenance-journal");
    const reopened = await inspectLocalVault(f.config); expect(reopened.vaultDigest).toBe(f.vault.vaultDigest);
    const original = (await readEnrollmentJournal(reopened, protectedManifestDigest(8))).find(r => r.kind === "ENROLLED");
    expect(f.enrollmentDigest(original)).toBe(f.intent.anchorDigest);
    await expect(f.append(f.next(f.first, current, { operationId: (await import("node:crypto")).randomUUID() }))).rejects.toThrow("Protected setup unavailable.");
    expect(f.state()).toBe(before);
  });
  expect(f.state()).toBe(before); expect((await f.read()).records).toHaveLength(5);
});

it("candidate ledger preserves unknown pending ciphertext, fences its operation without claiming rollback, and rejects DPAPI corruption", async () => {
  const f = await candidateStorageFixture(), before = f.state();
  await f.owned(async () => {
    await f.append(f.first);
    const name = "000002." + f.first.operationId + ".committed.dpapi." + (await import("node:crypto")).randomUUID() + ".pending";
    const pending = path.join(f.context.directory, name); writeFileSync(pending, Buffer.from("PARTIAL_TEST_PUBLICATION"));
    const partial = readFileSync(pending);
    expect(f.classify(await f.read()).status).toBe("RECOVERY_REVIEW_REQUIRED");
    await f.append(f.quarantine(f.first));
    const facts = await f.read(); expect(facts.pending).toHaveLength(1); expect(f.classify(facts).status).toBe("QUARANTINED_ONLY"); expect(readFileSync(pending)).toEqual(partial);
    const record = path.join(f.context.directory, "000001." + f.first.operationId + ".intent.dpapi");
    copyFileSync(record, path.join(f.config.directory, "retained-original-candidate-record.dpapi"));
    const bytes = readFileSync(record); bytes[bytes.length - 1] ^= 1; writeFileSync(record, bytes);
    await expect(f.read()).rejects.toThrow("Protected setup unavailable."); expect(f.state()).toBe(before);
  });
});

it("candidate ledger serializes genuine concurrent native COMMITTED versus quarantine; exactly one terminal outcome wins", async () => {
  const f = await candidateStorageFixture(), before = f.state();
  await f.owned(async () => {
    await f.append(f.first);
    const results = await Promise.allSettled([f.native(f.message(f.commit(f.first))), f.native(f.message(f.quarantine(f.first)))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const facts = await f.read(); expect(facts.records).toHaveLength(2);
    const last = facts.records[1]; expect(["COMMITTED", "QUARANTINED_NO_ADMISSION"]).toContain(last.kind);
    await expect(f.append(last.kind === "COMMITTED" ? f.quarantine(f.first, last) : f.commit(f.first, last))).rejects.toThrow("Protected setup unavailable.");
    expect(f.state()).toBe(before);
  });
});

it("candidate ledger refuses a delayed native helper after its actual Node parent dies and quarantine is durable", async () => {
  const f = await candidateStorageFixture(), before = f.state();
  await f.owned(async () => {
    await f.append(f.first); const q = f.quarantine(f.first), late = f.commit(f.first, q);
    const directory = f.config.directory, gate = path.join(directory, "orphan-go.txt"), ready = path.join(directory, "orphan-ready.txt"), result = path.join(directory, "orphan-result.json");
    const child = fork(path.resolve("tests/helpers/candidate-publication-child.mjs"), [], { cwd: process.cwd(), execArgv: [], windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
    const notification = new Promise<unknown>((resolve, reject) => { child.once("message", resolve); child.once("error", reject); child.once("exit", () => reject(Error("TEST publication parent exited before helper ready"))); });
    try {
      child.send({ message: f.message(late), nativeScript: path.resolve("src/server/bootstrap/windows-candidate-records.ps1"), gate, ready, result, stdout: path.join(directory, "orphan-native.stdout.log"), stderr: path.join(directory, "orphan-native.stderr.log") });
      expect(await notification).toMatchObject({ status: "DELAYED_NATIVE_HELPER_READY", pid: expect.any(Number) });
      expect(readFileSync(ready, "utf8")).toBe("READY_BEFORE_NATIVE_CALL");
      await new Promise<void>(resolve => { child.once("exit", () => resolve()); child.kill(); });
      await f.append(q); writeFileSync(gate, "RELEASE_ONLY_AFTER_DURABLE_QUARANTINE");
      await expect.poll(() => { try { return JSON.parse(readFileSync(result, "utf8")); } catch { return null; } }, { timeout: 30000 }).toEqual({ finished: true, exitCode: 1 });
      const nativeErrorBytes = readFileSync(path.join(directory, "orphan-native.stderr.log"));
      const nativeError = nativeErrorBytes.subarray(0, 2).equals(Buffer.from([255, 254])) ? nativeErrorBytes.toString("utf16le") : nativeErrorBytes.toString("utf8");
      expect(nativeError).toContain("Protected candidate publication unavailable.");
      const facts = await f.read(); expect(facts.records).toHaveLength(2); expect(f.classify(facts).status).toBe("QUARANTINED_ONLY"); expect(f.state()).toBe(before);
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill(); if (!(await import("node:fs")).existsSync(gate)) writeFileSync(gate, "TEST_CLEANUP_RELEASE"); }
  });
});

it("candidate ledger native reads reject hidden hard links and foreign ACLs on disposable protected records", async () => {
  const f = await candidateStorageFixture(), before = f.state();
  await f.owned(async () => {
    await f.append(f.first);
    const file = path.join(f.context.directory, "000001." + f.first.operationId + ".intent.dpapi"), alias = path.join(f.config.directory, "own-test-hardlink.dpapi");
    const { linkSync } = await import("node:fs"); linkSync(file, alias);
    await expect(f.native({ ...f.context, operation: "candidate-list" })).rejects.toThrow("Protected setup unavailable.");
    await expect(f.read()).rejects.toThrow("Protected setup unavailable."); expect(f.state()).toBe(before);
  });
  const weak = await candidateStorageFixture(), weakBefore = weak.state();
  await weak.owned(async () => {
    await weak.append(weak.first);
    const file = path.join(weak.context.directory, "000001." + weak.first.operationId + ".intent.dpapi");
    const changeJob = promisify(execFile)(path.join(process.env.SystemRoot!, "System32/WindowsPowerShell/v1.0/powershell.exe"), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$file=[Console]::In.ReadToEnd();$acl=Get-Acl -LiteralPath $file;$identity=New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545');$rule=New-Object Security.AccessControl.FileSystemAccessRule($identity,'Read','Allow');[void]$acl.AddAccessRule($rule);Set-Acl -LiteralPath $file -AclObject $acl"], { windowsHide: true });
    changeJob.child.stdin!.end(file); const change = await changeJob;
    expect(change.stderr).toBe("");
    await expect(weak.native({ ...weak.context, operation: "candidate-list" })).rejects.toThrow("Protected setup unavailable."); expect(weak.state()).toBe(weakBefore);
  });
});

async function adminHandoffFixture(version: 8 | 41 = 8) {
  const f = await fixture(version); await f.entry.enroll();
  const authorization: import("../../src/server/auth/types").AuthorizationConfiguration = { database: f.config.database, migrationsDirectory: f.config.migrationsDirectory,
    origins: { ADMIN: "https://localhost:7443", SALESPERSON: "https://127.0.0.1:7443" },
    signingSecrets: { ADMIN: randomBytes(48).toString("base64url"), SALESPERSON: randomBytes(48).toString("base64url") }, sessionLifetimeSeconds: 120 };
  const { acquireRuntimeOwnership } = await import("../../src/server/hosting/ownership");
  const { openAuthorizationGateway } = await import("../../src/server/auth/gateway");
  const filename = path.join(f.config.database.directory, f.config.database.filename);
  const runtime = await acquireRuntimeOwnership(filename);
  {
    const { createProtectedRootWriterAdmission } = await import("../../src/server/bootstrap/writer-admission"), { withProtectedLocalKeys } = await import("../../src/server/bootstrap/keys");
    await withProtectedLocalKeys(f.config, async keys => { authorization.signingSecrets = { ...keys.signingSecrets }; });
    authorization.protectedAdmission = await createProtectedRootWriterAdmission(f.config, runtime, version);
  }
  let gateway;
  try { gateway = await openAuthorizationGateway(authorization, version === 41 ? 41 : undefined); }
  catch (error) { await runtime.close(); throw error; }
  const { openProofDatabase, fingerprint } = await import("../../src/server/backup/snapshot");
  const { enrollmentDigest } = await import("../../src/server/bootstrap/database");
  const state = () => { const db = openProofDatabase(filename); try { return enrollmentDigest(fingerprint(db)); } finally { db.close(); } };
  return { ...f, authorization, runtime, gateway, filename, state };
}

it("Admin maintenance handoff consumes genuine fresh proof, preserves exact8 and continuously holds the same runtime fence", async () => {
  const f = await adminHandoffFixture();
  const { withAdminMaintenanceSource, adminMaintenanceSourceEvidence, openAuthorizationGateway } = await import("../../src/server/auth/gateway");
  const { hasActiveBootstrapLease } = await import("../../src/server/bootstrap/ownership");
  const { acquireRuntimeOwnership } = await import("../../src/server/hosting/ownership");
  const { randomUUID } = await import("node:crypto");
  const receipt = await f.gateway.verifyAdminPassword(f.values.ADMIN), before = f.state();
  const operation = { operationId: randomUUID(), purpose: "UPGRADE8" as const };
  let savedSource: unknown, savedLease!: Parameters<typeof adminMaintenanceSourceEvidence>[2];
  try {
    expect(await withAdminMaintenanceSource(f.gateway, receipt, f.runtime, operation, async (source, lease) => {
      savedSource = source; savedLease = lease;
      expect(hasActiveBootstrapLease(lease, f.config.database)).toBe(true);
      const facts = adminMaintenanceSourceEvidence(source, f.config.database, lease, operation);
      expect(facts).toMatchObject({ ...operation, schema: 8, productionActivation: false, credentialVersion: "1", authEpoch: "1" });
      expect(facts.filename).toBe(f.filename.toLowerCase());
      expect(() => JSON.stringify(source)).toThrow("Access denied.");
      expect(() => adminMaintenanceSourceEvidence({}, f.config.database, lease, operation)).toThrow("Access denied.");
      expect(() => adminMaintenanceSourceEvidence(source, f.config.database, {} as typeof lease, operation)).toThrow("Access denied.");
      expect(() => adminMaintenanceSourceEvidence(source, f.config.database, lease, { ...operation, operationId: randomUUID() })).toThrow("Access denied.");
      expect(() => adminMaintenanceSourceEvidence(source, f.config.database, lease, { ...operation, purpose: "RESTORE41" })).toThrow("Access denied.");
      await expect(f.gateway.close()).rejects.toThrow("Access denied.");
      await expect(openAuthorizationGateway(f.authorization)).rejects.toThrow("Access denied.");
      await expect(acquireRuntimeOwnership(f.filename)).rejects.toThrow("Local service unavailable.");
      const child = fork(path.resolve("tests/helpers/maintenance-runtime-probe.mjs"), [], { execArgv: ["--experimental-transform-types"], silent: true, windowsHide: true, env: { ...process.env, NODE_ENV: "test" } });
      const message = once(child, "message"), exited = once(child, "exit");
      child.send({ action: "probe", filename: f.filename });
      expect((await message)[0]).toEqual({ status: "FENCE_DENIED" });
      expect((await exited)[0]).toBe(0);
      return "SOURCE_SCOPE_ONLY";
    })).toBe("SOURCE_SCOPE_ONLY");
    expect(f.state()).toBe(before);
    f.runtime.assertHeld();
    expect(() => adminMaintenanceSourceEvidence(savedSource, f.config.database, savedLease, operation)).toThrow("Access denied.");
    expect(hasActiveBootstrapLease(savedLease, f.config.database)).toBe(false);
    await expect(f.gateway.issueAdminSession(receipt)).rejects.toThrow("Access denied.");
    await expect(f.gateway.verifySalespersonPassword(f.values.SALESPERSON)).rejects.toThrow("Access denied.");
    const fresh = await openAuthorizationGateway(f.authorization);
    try { for (const role of ["ADMIN", "SALESPERSON"] as const) {
      const proof = await (role === "ADMIN" ? fresh.verifyAdminPassword(f.values[role]) : fresh.verifySalespersonPassword(f.values[role]));
      expect((await (role === "ADMIN" ? fresh.issueAdminSession(proof) : fresh.issueSalespersonSession(proof))).status).toBe(200);
    } } finally { await fresh.close(); }
  } finally { await f.gateway.close(); await f.runtime.close(); }
});

it("Admin maintenance rejects forged gateway and proofs, Staff, stale receipt and counterfeit lease before source authority", async () => {
  const f = await adminHandoffFixture();
  const { withAdminMaintenanceSource } = await import("../../src/server/auth/gateway");
  const operation = { operationId: (await import("node:crypto")).randomUUID(), purpose: "UPGRADE8" as const }, work = vi.fn(async () => {});
  try {
    await expect(withAdminMaintenanceSource({} as typeof f.gateway, {}, f.runtime, operation, work)).rejects.toThrow("Access denied.");
    await expect(withAdminMaintenanceSource(f.gateway, { signal: { aborted: false } }, f.runtime, operation, work)).rejects.toThrow("Access denied.");
    const staff = await f.gateway.verifySalespersonPassword(f.values.SALESPERSON);
    await expect(withAdminMaintenanceSource(f.gateway, staff, f.runtime, operation, work)).rejects.toThrow("Access denied.");
    await expect(f.gateway.issueSalespersonSession(staff)).rejects.toThrow("Access denied.");
    const old = await f.gateway.verifyAdminPassword(f.values.ADMIN);
    await new Promise(resolve => setTimeout(resolve, 5100));
    await expect(withAdminMaintenanceSource(f.gateway, old, f.runtime, operation, work)).rejects.toThrow("Access denied.");
    const proof = await f.gateway.verifyAdminPassword(f.values.ADMIN), counterfeit = { assertHeld: vi.fn() };
    await expect(withAdminMaintenanceSource(f.gateway, proof, counterfeit, operation, work)).rejects.toThrow("Access denied.");
    expect(counterfeit.assertHeld).not.toHaveBeenCalled();
    await expect(f.gateway.issueAdminSession(proof)).rejects.toThrow("Access denied.");
    expect(work).not.toHaveBeenCalled();
    expect((await f.gateway.issueAdminSession(await f.gateway.verifyAdminPassword(f.values.ADMIN))).status).toBe(200);
  } finally { await f.gateway.close(); await f.runtime.close(); }
});

it("Admin maintenance reopens and rejects actual post-close credential revocation or replacement file without minting a source scope", async () => {
  const { withAdminMaintenanceSource } = await import("../../src/server/auth/gateway");
  for (const variant of ["revoke", "replacement"] as const) {
    const f = await adminHandoffFixture(), operation = { operationId: (await import("node:crypto")).randomUUID(), purpose: "UPGRADE8" as const }, work = vi.fn(async () => {});
    const receipt = await f.gateway.verifyAdminPassword(f.values.ADMIN), before = f.state();
    const preserved = path.join(f.config.database.directory, "preserved-original8.sqlite3");
    fault.afterClose = () => {
      if (variant === "revoke") f.inspect(db => db.transaction(tx => tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='ADMIN'")));
      else { renameSync(f.filename, preserved); copyFileSync(preserved, f.filename); }
    };
    try {
      await expect(withAdminMaintenanceSource(f.gateway, receipt, f.runtime, operation, work)).rejects.toThrow("Protected setup unavailable.");
      expect(work).not.toHaveBeenCalled(); f.runtime.assertHeld();
      if (variant === "replacement") expect(f.state()).toBe(before);
      else expect(f.inspect(db => db.get("SELECT auth_epoch FROM auth_principals WHERE id='ADMIN'")?.auth_epoch)).toBe(BigInt(2));
    } finally { fault.afterClose = undefined; await f.gateway.close().catch(() => {}); await f.runtime.close(); }
  }
});

it("Admin maintenance exact41 drains an admitted transaction, denies new work and never transfers the same receipt twice", async () => {
  const f = await adminHandoffFixture(41);
  const { withAdminMaintenanceSource, adminMaintenanceSourceEvidence } = await import("../../src/server/auth/gateway");
  const operation = { operationId: (await import("node:crypto")).randomUUID(), purpose: "RESTORE41" as const };
  const login = await f.gateway.issueAdminSession(await f.gateway.verifyAdminPassword(f.values.ADMIN));
  const cookie = login.headers.get("set-cookie")!.split(";")[0], request = () => new Request(f.authorization.origins.ADMIN + "/api/test", { headers: { cookie, origin: f.authorization.origins.ADMIN } });
  const receipt = await f.gateway.verifyAdminPassword(f.values.ADMIN);
  let release!: () => void, ready!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), admitted = new Promise<void>(resolve => { ready = resolve; });
  let drained = false;
  const existing = f.gateway.withAdminTransaction(request(), async () => { ready(); await gate; drained = true; });
  await admitted;
  try {
    const work = vi.fn(async (source: Parameters<typeof adminMaintenanceSourceEvidence>[0], lease: Parameters<typeof adminMaintenanceSourceEvidence>[2]) => {
      expect(drained).toBe(true);
      expect(adminMaintenanceSourceEvidence(source, f.config.database, lease, operation).schema).toBe(41);
    });
    const transfer = withAdminMaintenanceSource(f.gateway, receipt, f.runtime, operation, work);
    await expect(f.gateway.publicShopName()).rejects.toThrow("Access denied.");
    await expect(f.gateway.withAdminTransaction(request(), async () => {})).rejects.toThrow("Access denied.");
    release(); await existing; await transfer;
    expect(work).toHaveBeenCalledTimes(1);
    await expect(withAdminMaintenanceSource(f.gateway, receipt, f.runtime, operation, work)).rejects.toThrow("Access denied.");
  } finally { release(); await existing.catch(() => {}); await f.gateway.close(); await f.runtime.close(); }
});

it("Admin maintenance actual child death releases only its runtime fence and preserves the post-authentication source", async () => {
  const f = await adminHandoffFixture();
  await f.gateway.close(); await f.runtime.close();
  const operation = { operationId: (await import("node:crypto")).randomUUID(), purpose: "UPGRADE8" as const };
  const child = fork(path.resolve("tests/helpers/maintenance-runtime-probe.mjs"), [], { execArgv: ["--experimental-transform-types"], silent: true, windowsHide: true, env: { ...process.env, NODE_ENV: "test" } });
  const output: Buffer[] = []; let size = 0;
  child.stderr!.on("data", (b: Buffer) => { size += b.length; if (size < 16384) output.push(b); });
  const message = once(child, "message"), exited = once(child, "exit");
  child.send({ action: "pause-maintenance", filename: f.filename, config: f.config, authorization: { ...f.authorization, protectedAdmission: undefined }, password: f.values.ADMIN, operation });
  try {
    const [reply] = await message;
    expect(reply).toMatchObject({ status: "MAINTENANCE_SOURCE_HELD", schema: 8, productionActivation: false });
    expect(child.kill("SIGTERM")).toBe(true); await exited;
    expect(f.state()).toBe((reply as { state: string }).state);
    const { acquireRuntimeOwnership } = await import("../../src/server/hosting/ownership");
    const { openAuthorizationGateway } = await import("../../src/server/auth/gateway");
    const runtime = await acquireRuntimeOwnership(f.filename);
    try {
      const { createProtectedRootWriterAdmission } = await import("../../src/server/bootstrap/writer-admission");
      const gateway = await openAuthorizationGateway({ ...f.authorization, protectedAdmission: await createProtectedRootWriterAdmission(f.config, runtime, 8) });
      try {
        for (const role of ["ADMIN", "SALESPERSON"] as const) {
          const proof = await (role === "ADMIN" ? gateway.verifyAdminPassword(f.values[role]) : gateway.verifySalespersonPassword(f.values[role]));
          expect((await (role === "ADMIN" ? gateway.issueAdminSession(proof) : gateway.issueSalespersonSession(proof))).status).toBe(200);
        }
      } finally { await gateway.close(); }
    } finally { await runtime.close(); }
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM"); await exited; }
    writeFileSync(path.join(f.config.directory, "maintenance-child-stderr.log"), Buffer.concat(output));
  }
});

async function copyTestHandoff(f: Awaited<ReturnType<typeof candidateCopyFixture>>, proof: unknown,
  work: (source: import("../../src/server/auth/gateway").AdminMaintenanceSource, lease: import("../../src/server/bootstrap/ownership").BootstrapLease) => Promise<void>) {
  const { withAdminMaintenanceSource } = await import("../../src/server/auth/gateway");
  let failed = false, cause: unknown;
  try { await withAdminMaintenanceSource(f.gateway, proof, f.runtime, f.operation, async (source, lease) => {
    try { await work(source, lease); } catch (error) { failed = true; cause = error; throw error; }
  }); } catch (error) { if (failed) throw cause; throw error; }
}

async function candidateCopyFixture() {
  const f = await adminHandoffFixture();
  const { createTestCustody } = await import("../../src/server/backup/crypto");
  const directory = path.join(f.config.directory, "copy-test-custody"); mkdirSync(directory);
  const custody = await createTestCustody(directory);
  const operation = { operationId: (await import("node:crypto")).randomUUID(), purpose: "UPGRADE8" as const };
  const precopy = path.join(f.config.directory, "copy-test-authenticated-precopy"), target = path.join(f.config.directory, operation.operationId);
  mkdirSync(precopy); mkdirSync(target);
  return { ...f, custody, operation, precopy, target };
}

it("unadmitted copy8 requires genuine source and archive plus deliberate owner confirmation, preserving rows and publishing only INTENT", async () => {
  const f = await candidateCopyFixture();
  const { createAuthenticationBackup8 } = await import("../../src/server/bootstrap/authentication-backup");
  const { withUnadmittedCandidateCopy8, unadmittedCandidateCopy8Evidence, bindTrustedCandidateCopyInteraction } = await import("../../src/server/bootstrap/candidate-copy8");
  const { readProtectedCandidateLedger, classifyCandidateLedger } = await import("../../src/server/bootstrap/candidate-records");
  const { inspectLocalVault } = await import("../../src/server/bootstrap/keys");
  const { readEnrollmentJournal } = await import("../../src/server/bootstrap/journal");
  const { enrollmentDigest } = await import("../../src/server/bootstrap/database");
  const { protectedManifestDigest } = await import("../../src/server/bootstrap/maintenance-journal");
  let saved: unknown;
  try {
    const proof = await f.gateway.verifyAdminPassword(f.values.ADMIN), before = f.state();
    await copyTestHandoff(f, proof, async (source, lease) => {
      const backup = await createAuthenticationBackup8(f.config, lease, f.custody, f.precopy, (await import("node:crypto")).randomUUID());
      const confirm = vi.fn(async (request: { operationId: string; productionActivation: false }) => { expect(request).toMatchObject({ operationId: f.operation.operationId, productionActivation: false }); return "CONFIRM_NEW_UNADMITTED_COPY8" as const; });
      const interaction = bindTrustedCandidateCopyInteraction({ confirm });
      await expect(withUnadmittedCandidateCopy8(f.config, {} as typeof source, lease, backup, f.target, interaction, async () => {})).rejects.toThrow("Protected setup unavailable.");
      expect(confirm).not.toHaveBeenCalled();
      await expect(withUnadmittedCandidateCopy8(f.config, source, lease, {} as typeof backup, f.target, interaction, async () => {})).rejects.toThrow("Protected setup unavailable.");
      await expect(withUnadmittedCandidateCopy8(f.config, source, lease, backup, f.target, {} as typeof interaction, async () => {})).rejects.toThrow("Protected setup unavailable.");
      const occupiedParent = path.join(f.config.directory, "occupied-copy-parent"); mkdirSync(occupiedParent);
      const occupied = path.join(occupiedParent, f.operation.operationId); mkdirSync(occupied); writeFileSync(path.join(occupied, "existing.txt"), "TEST EXISTING EVIDENCE");
      await expect(withUnadmittedCandidateCopy8(f.config, source, lease, backup, occupied, interaction, async () => {})).rejects.toThrow("Protected setup unavailable.");
      expect(readFileSync(path.join(occupied, "existing.txt"), "utf8")).toBe("TEST EXISTING EVIDENCE"); expect(confirm).not.toHaveBeenCalled();
      console.info("COPY8_TEST_STAGE", "authenticated-backup-and-forgery-complete");
      await withUnadmittedCandidateCopy8(f.config, source, lease, backup, f.target, interaction, async copy => {
        console.info("COPY8_TEST_STAGE", "copy-callback-entered");
        saved = copy;
        expect(() => JSON.stringify(copy)).toThrow("Protected setup unavailable.");
        await expect(unadmittedCandidateCopy8Evidence({})).rejects.toThrow("Protected setup unavailable.");
        expect(await unadmittedCandidateCopy8Evidence(copy)).toMatchObject({ operationId: f.operation.operationId, schema: 8, admission: false, copyFingerprint: before, productionActivation: false });
      });
      console.info("COPY8_TEST_STAGE", "copy-scope-closed");
      expect(confirm).toHaveBeenCalledTimes(1);
      await expect(unadmittedCandidateCopy8Evidence(saved)).rejects.toThrow("Protected setup unavailable.");
      await expect(withUnadmittedCandidateCopy8(f.config, source, lease, backup, f.target, interaction, async () => {})).rejects.toThrow("Protected setup unavailable.");
      const vault = await inspectLocalVault(f.config), records = await readEnrollmentJournal(vault, protectedManifestDigest(8)), anchor = records.find(r => r.kind === "ENROLLED")!;
      const ledger = await readProtectedCandidateLedger(vault, enrollmentDigest(anchor));
      expect(ledger.records.map(r => r.kind)).toEqual(["INTENT"]); expect(classifyCandidateLedger(ledger).status).toBe("RECOVERY_REVIEW_REQUIRED");
      // This WAL-mode fixture legitimately retains read-only inspection sidecars.
      expect(readdirSync(f.target).sort()).toEqual(["candidate8.sqlite3", "candidate8.sqlite3-shm", "candidate8.sqlite3-wal"]);
      expect(f.state()).toBe(before);
    });
  } finally { await f.gateway.close().catch(() => {}); await f.runtime.close(); }
});

it("unadmitted copy8 lost actual native copy acknowledgement retains target and INTENT without issuing or replaying authority", async () => {
  const f = await candidateCopyFixture();
  const { createAuthenticationBackup8 } = await import("../../src/server/bootstrap/authentication-backup");
  const { withUnadmittedCandidateCopy8, bindTrustedCandidateCopyInteraction } = await import("../../src/server/bootstrap/candidate-copy8");
  try {
    const proof = await f.gateway.verifyAdminPassword(f.values.ADMIN), before = f.state();
    await copyTestHandoff(f, proof, async (source, lease) => {
      const backup = await createAuthenticationBackup8(f.config, lease, f.custody, f.precopy, (await import("node:crypto")).randomUUID());
      const confirm = vi.fn(async () => "CONFIRM_NEW_UNADMITTED_COPY8" as const), interaction = bindTrustedCandidateCopyInteraction({ confirm }), work = vi.fn(async () => {});
      fault.copyAfterBackup = true;
      await expect(withUnadmittedCandidateCopy8(f.config, source, lease, backup, f.target, interaction, work)).rejects.toThrow("Protected setup unavailable.");
      expect(fault.copyAfterBackup).toBe(false); expect(work).not.toHaveBeenCalled();
      const target = path.join(f.target, "candidate8.sqlite3"), bytes = readFileSync(target);
      expect(bytes.length).toBeGreaterThan(0); expect(bytes.subarray(0, 16).toString()).toBe("SQLite format 3\0");
      await expect(withUnadmittedCandidateCopy8(f.config, source, lease, backup, f.target, interaction, work)).rejects.toThrow("Protected setup unavailable.");
      expect(confirm).toHaveBeenCalledTimes(1); expect(readFileSync(target)).toEqual(bytes); expect(f.state()).toBe(before);
      const { inspectLocalVault } = await import("../../src/server/bootstrap/keys"), { readEnrollmentJournal } = await import("../../src/server/bootstrap/journal"), { protectedManifestDigest } = await import("../../src/server/bootstrap/maintenance-journal"), { enrollmentDigest } = await import("../../src/server/bootstrap/database"), { readProtectedCandidateLedger } = await import("../../src/server/bootstrap/candidate-records");
      const vault = await inspectLocalVault(f.config), anchor = (await readEnrollmentJournal(vault, protectedManifestDigest(8))).find(r => r.kind === "ENROLLED")!;
      expect((await readProtectedCandidateLedger(vault, enrollmentDigest(anchor))).records.map(r => r.kind)).toEqual(["INTENT"]);
    });
  } finally { fault.copyAfterBackup = false; await f.gateway.close().catch(() => {}); await f.runtime.close(); }
});

it("unadmitted copy8 cancellation invalidates the live proof after copying and preserves the unresolved target", async () => {
  const f = await candidateCopyFixture();
  const { createAuthenticationBackup8 } = await import("../../src/server/bootstrap/authentication-backup");
  const { withUnadmittedCandidateCopy8, unadmittedCandidateCopy8Evidence, bindTrustedCandidateCopyInteraction } = await import("../../src/server/bootstrap/candidate-copy8");
  const controller = new AbortController();
  try {
    const proof = await f.gateway.verifyAdminPassword(f.values.ADMIN), before = f.state();
    await copyTestHandoff(f, proof, async (source, lease) => {
      const backup = await createAuthenticationBackup8(f.config, lease, f.custody, f.precopy, (await import("node:crypto")).randomUUID());
      const confirm = vi.fn(async () => "CONFIRM_NEW_UNADMITTED_COPY8" as const), interaction = bindTrustedCandidateCopyInteraction({ confirm });
      const alreadyAborted = new AbortController(); alreadyAborted.abort();
      await expect(withUnadmittedCandidateCopy8(f.config, source, lease, backup, f.target, interaction, async () => {}, alreadyAborted.signal)).rejects.toThrow("Protected setup unavailable.");
      expect(confirm).not.toHaveBeenCalled(); expect(readdirSync(f.target)).toEqual([]);
      const work = vi.fn(async (copy: Parameters<typeof unadmittedCandidateCopy8Evidence>[0]) => {
        expect((await unadmittedCandidateCopy8Evidence(copy)).schema).toBe(8);
        controller.abort();
        await expect(unadmittedCandidateCopy8Evidence(copy)).rejects.toThrow("Protected setup unavailable.");
      });
      await expect(withUnadmittedCandidateCopy8(f.config, source, lease, backup, f.target, interaction, work, controller.signal)).rejects.toThrow("Protected setup unavailable.");
      expect(confirm).toHaveBeenCalledTimes(1); expect(work).toHaveBeenCalledTimes(1);
      expect(readFileSync(path.join(f.target, "candidate8.sqlite3")).length).toBeGreaterThan(0); expect(f.state()).toBe(before);
    });
  } finally { await f.gateway.close().catch(() => {}); await f.runtime.close(); }
});


it("candidate migration8 executes the actual reviewed41 programs once and independently preserves all original typed rows and empty financial ledgers", async () => {
  console.info("MIGRATION8_TEST_STAGE", "fixture-start");
  const f = await candidateCopyFixture();
  console.info("MIGRATION8_TEST_STAGE", "fixture-ready");
  const { createAuthenticationBackup8 } = await import("../../src/server/bootstrap/authentication-backup");
  const { withUnadmittedCandidateCopy8, migrateUnadmittedCandidate8, verifiedCandidate41Evidence, bindTrustedCandidateCopyInteraction } = await import("../../src/server/bootstrap/candidate-copy8");
  let saved: unknown;
  try {
    const proof = await f.gateway.verifyAdminPassword(f.values.ADMIN), before = f.state();
    await copyTestHandoff(f, proof, async (source, lease) => {
      const backup = await createAuthenticationBackup8(f.config, lease, f.custody, f.precopy, (await import("node:crypto")).randomUUID());
      console.info("MIGRATION8_TEST_STAGE", "backup-ready");
      const interaction = bindTrustedCandidateCopyInteraction({ confirm: async () => "CONFIRM_NEW_UNADMITTED_COPY8" });
      await expect(migrateUnadmittedCandidate8({} as Parameters<typeof migrateUnadmittedCandidate8>[0])).rejects.toThrow("Protected setup unavailable.");
      await withUnadmittedCandidateCopy8(f.config, source, lease, backup, f.target, interaction, async copy => {
        saved = copy; console.info("MIGRATION8_TEST_STAGE", "copy-ready");
        await expect(verifiedCandidate41Evidence(copy)).rejects.toThrow("Protected setup unavailable.");
        await migrateUnadmittedCandidate8(copy); console.info("MIGRATION8_TEST_STAGE", "migration-verified");
        expect(await verifiedCandidate41Evidence(copy)).toMatchObject({ operationId: f.operation.operationId, knownSqlCompletion: true, schema: 41, admission: false, productionActivation: false });
        await expect(migrateUnadmittedCandidate8(copy)).rejects.toThrow("Protected setup unavailable.");
        const { openProofDatabase } = await import("../../src/server/backup/snapshot");
        const db = openProofDatabase(path.join(f.target, "candidate8.sqlite3"));
        try {
          expect(db.prepare("SELECT count(*) AS n FROM schema_migrations").get()?.n).toBe(BigInt(41));
          for (const table of ["products", "sales", "stock_movements", "financial_events", "cash_movements", "returns", "expenses", "shop_settings_revisions"]) expect(db.prepare("SELECT count(*) AS n FROM " + table).get()?.n).toBe(BigInt(0));
          for (const role of ["ADMIN", "SALESPERSON"] as const) expect(await passwordCallbacks.verify({ hash: String(db.prepare("SELECT password FROM auth_credentials WHERE id=?").get(role)?.password), password: f.values[role] })).toBe(true);
        } finally { db.close(); }
      });
      expect(f.state()).toBe(before);
      await expect(verifiedCandidate41Evidence(saved)).rejects.toThrow("Protected setup unavailable.");
    });
  } finally { await f.gateway.close().catch(() => {}); await f.runtime.close(); }
});


let knownSelectionFixture: Awaited<ReturnType<typeof candidateCopyFixture>> | undefined;
it("candidate fresh keys require genuine known41 completion and fresh TLS without rewriting original SQL binding", async () => {
  const f = await candidateCopyFixture();
  const { createAuthenticationBackup8 } = await import("../../src/server/bootstrap/authentication-backup");
  const { withUnadmittedCandidateCopy8, migrateUnadmittedCandidate8, recordKnownCandidateCompletion8, bindTrustedCandidateCopyInteraction } = await import("../../src/server/bootstrap/candidate-copy8");
  const { createCandidateProtectedLocalKeys, inspectLocalVault, withProtectedLocalKeys } = await import("../../src/server/bootstrap/keys");
  const destination: LocalKeyConfiguration = { directory: f.target, database: { directory: f.target, filename: "candidate8.sqlite3", mode: "test", create: false }, migrationsDirectory: migrations };
  try {
    const proof = await f.gateway.verifyAdminPassword(f.values.ADMIN), before = f.state();
    await copyTestHandoff(f, proof, async (source, lease) => {
      const old = await inspectLocalVault(f.config);
      const backup = await createAuthenticationBackup8(f.config, lease, f.custody, f.precopy, (await import("node:crypto")).randomUUID());
      await withUnadmittedCandidateCopy8(f.config, source, lease, backup, f.target, bindTrustedCandidateCopyInteraction({ confirm: async () => "CONFIRM_NEW_UNADMITTED_COPY8" }), async copy => {
        await expect(createCandidateProtectedLocalKeys(destination, candidateTls, {} as typeof copy)).rejects.toThrow("Protected setup unavailable.");
        await migrateUnadmittedCandidate8(copy);
        // The original certificate cannot become a destination identity.
        await expect(createCandidateProtectedLocalKeys(destination, tls, copy)).rejects.toThrow("Protected setup unavailable.");
        const fresh = await createCandidateProtectedLocalKeys(destination, candidateTls, copy);
        expect(fresh.installationId).not.toBe(old.metadata.installationId); expect(fresh.deviceId).not.toBe(old.metadata.deviceId);
        expect(fresh.certificateFingerprint).not.toBe(old.metadata.certificateFingerprint); expect(fresh.productionActivation).toBe(false);
        await withProtectedLocalKeys(f.config, async rootKeys => withProtectedLocalKeys(destination, async keys => {
          expect(keys.signingSecrets.ADMIN === rootKeys.signingSecrets.ADMIN).toBe(false);
          expect(keys.signingSecrets.SALESPERSON === rootKeys.signingSecrets.SALESPERSON).toBe(false);
        }).then(() => {}));
        const { openProofDatabase } = await import("../../src/server/backup/snapshot");
        const original = openProofDatabase(f.filename), target = openProofDatabase(path.join(f.target, "candidate8.sqlite3"));
        try { expect(stable(target.prepare("SELECT rowid,* FROM auth_enrollment_binding").all())).toBe(stable(original.prepare("SELECT rowid,* FROM auth_enrollment_binding").all())); }
        finally { original.close(); target.close(); }
        expect(await recordKnownCandidateCompletion8(copy, destination)).toMatchObject({ operationId: f.operation.operationId, status: "COMMITTED_UNADMITTED", productionActivation: false });
        await expect(recordKnownCandidateCompletion8(copy, destination)).rejects.toThrow("Protected setup unavailable.");
        const { readProtectedCandidateLedger } = await import("../../src/server/bootstrap/candidate-records"), { readEnrollmentJournal } = await import("../../src/server/bootstrap/journal"), { protectedManifestDigest } = await import("../../src/server/bootstrap/maintenance-journal"), { enrollmentDigest } = await import("../../src/server/bootstrap/database");
        const anchor = (await readEnrollmentJournal(old, protectedManifestDigest(8))).find(r => r.kind === "ENROLLED")!;
        expect((await readProtectedCandidateLedger(old, enrollmentDigest(anchor))).records.map(r => r.kind)).toEqual(["INTENT", "COMMITTED"]);

      });
      expect(f.state()).toBe(before);
    });
    const { openAuthorizationGateway } = await import("../../src/server/auth/gateway");
    const authorization = { ...f.authorization, database: destination.database, migrationsDirectory: migrations };
    await expect(openAuthorizationGateway(authorization, 41)).rejects.toThrow("Access denied.");
    await expect(openAuthorizationGateway({ ...authorization, protectedAdmission: {} as NonNullable<typeof authorization.protectedAdmission> }, 41)).rejects.toThrow("Access denied.");
    f.runtime.assertHeld(); knownSelectionFixture = f;
  } finally { await f.gateway.close().catch(() => {}); await f.runtime.close(); }
});


it("candidate unknown actual final COMMIT is never adopted or replayed and deliberate quarantine preserves both files", async () => {
  const f = await candidateCopyFixture();
  const { createAuthenticationBackup8 } = await import("../../src/server/bootstrap/authentication-backup");
  const { withUnadmittedCandidateCopy8, migrateUnadmittedCandidate8, verifiedCandidate41Evidence, bindTrustedCandidateCopyInteraction } = await import("../../src/server/bootstrap/candidate-copy8");
  const { bindTrustedCandidateRecoveryInteraction, quarantineNeverAdmittedCandidate8 } = await import("../../src/server/bootstrap/candidate-recovery8");
  const { createRequire } = await import("node:module");
  const Driver = createRequire(import.meta.url)("better-sqlite3") as { prototype: { exec(this: { name: string; prepare(sql: string): { get(): Record<string, unknown> } }, sql: string): unknown } };
  let commits = 0, lost = false;
  try {
    const proof = await f.gateway.verifyAdminPassword(f.values.ADMIN), before = f.state();
    await copyTestHandoff(f, proof, async (source, lease) => {
      const backup = await createAuthenticationBackup8(f.config, lease, f.custody, f.precopy, (await import("node:crypto")).randomUUID());
      await expect(withUnadmittedCandidateCopy8(f.config, source, lease, backup, f.target, bindTrustedCandidateCopyInteraction({ confirm: async () => "CONFIRM_NEW_UNADMITTED_COPY8" }), async copy => {
        const actual = Driver.prototype.exec;
        const spy = vi.spyOn(Driver.prototype, "exec").mockImplementation(function(this: { name: string; prepare(sql: string): { get(): Record<string, unknown> } }, sql) {
          const result = actual.call(this, sql);
          if (this.name.toLowerCase() === path.join(f.target, "candidate8.sqlite3").toLowerCase() && sql === "COMMIT") {
            commits++;
            if (this.prepare("PRAGMA user_version").get().user_version === BigInt(41)) { lost = true; throw Error("TEST lost actual final COMMIT acknowledgement"); }
          }
          return result;
        });
        try {
          await expect(migrateUnadmittedCandidate8(copy)).rejects.toThrow("Protected setup unavailable.");
          expect(lost).toBe(true); expect(commits).toBe(7);
          await expect(verifiedCandidate41Evidence(copy)).rejects.toThrow("Protected setup unavailable.");
          await expect(migrateUnadmittedCandidate8(copy)).rejects.toThrow("Protected setup unavailable."); expect(commits).toBe(7);
        } finally { spy.mockRestore(); }
      })).rejects.toThrow("Protected setup unavailable.");
      const filename = path.join(f.target, "candidate8.sqlite3"), bytes = readFileSync(filename);
      const confirm = vi.fn(async () => "CONFIRM_PERMANENT_NO_ADMISSION" as const), interaction = bindTrustedCandidateRecoveryInteraction({ confirm });
      await expect(quarantineNeverAdmittedCandidate8(f.config, source, lease, f.operation.operationId, {} as typeof interaction)).rejects.toThrow("Protected setup unavailable.");
      expect(confirm).not.toHaveBeenCalled();
      expect(await quarantineNeverAdmittedCandidate8(f.config, source, lease, f.operation.operationId, interaction)).toMatchObject({ status: "QUARANTINED_NO_ADMISSION", sqlOutcome: "UNKNOWN", sourcePreserved: true, productionActivation: false });
      expect(readFileSync(filename)).toEqual(bytes); expect(f.state()).toBe(before);
      await expect(quarantineNeverAdmittedCandidate8(f.config, source, lease, f.operation.operationId, interaction)).rejects.toThrow("Protected setup unavailable."); expect(confirm).toHaveBeenCalledTimes(1);
    });
  } finally { await f.gateway.close().catch(() => {}); await f.runtime.close(); }
});


let schema8CrashFixture: (Awaited<ReturnType<typeof adminHandoffFixture>> & { operation: {operationId:string;purpose:"UPGRADE8"}; target:string;precopy:string;custodyDirectory:string;archiveId:string;candidateState?:string }) | undefined;
it("auth8 crash prerequisite enrolls and closes the original source before a new disposable operation",async()=>{
 const f=await adminHandoffFixture(),{randomUUID}=await import("node:crypto"),operation={operationId:randomUUID(),purpose:"UPGRADE8" as const};
 const target=path.join(f.config.directory,operation.operationId),precopy=path.join(f.config.directory,"crash-precopy"),custodyDirectory=path.join(f.config.directory,"crash-custody"),archiveId=randomUUID();mkdirSync(target);mkdirSync(precopy);
 await f.gateway.close();await f.runtime.close();schema8CrashFixture={...f,operation,target,precopy,custodyDirectory,archiveId};
});
it("candidate actual child killed after final COMMIT leaves exact source and no reconstructed completion",async()=>{
 const f=schema8CrashFixture;if(!f)throw Error("TEST enrolled auth8 crash fixture required");const {operation,target,precopy,custodyDirectory,archiveId}=f;
 const child=fork(path.resolve("tests/helpers/maintenance-runtime-probe.mjs"),[],{cwd:process.cwd(),execArgv:["--experimental-transform-types","--disable-warning=ExperimentalWarning","--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"],env:{...process.env,NODE_ENV:"test"},stdio:["ignore","ignore","pipe","ipc"],windowsHide:true});
 const errors:Buffer[]=[];child.stderr!.on("data",b=>errors.push(Buffer.from(b)));const exited=once(child,"exit");
 try{
  const pending=new Promise<{status:string;sourceState:string}>((resolve,reject)=>{child.once("message",resolve);child.once("error",reject);child.once("exit",()=>reject(Error("TEST candidate child exited before final COMMIT")));});
  child.send({action:"pause-candidate-final-commit",filename:f.filename,config:f.config,authorization:{...f.authorization,protectedAdmission:undefined},password:f.values.ADMIN,operation,target,precopy,archiveId,custodyDirectory});
  const observed=await pending;expect(observed.status).toBe("ACTUAL_FINAL_COMMIT_UNACKNOWLEDGED");expect(child.kill("SIGTERM")).toBe(true);await exited;expect(f.state()).toBe(observed.sourceState);
  const {openProofDatabase,fingerprint}=await import("../../src/server/backup/snapshot"),{enrollmentDigest}=await import("../../src/server/bootstrap/database"),db=openProofDatabase(path.join(target,"candidate8.sqlite3"));
  try{expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(BigInt(41));f.candidateState=enrollmentDigest(fingerprint(db));}finally{db.close();}
 }finally{if(child.exitCode===null&&child.signalCode===null){child.kill("SIGTERM");await exited;}writeFileSync(path.join(f.config.directory,"candidate-crash-child-stderr.log"),Buffer.concat(errors));}
});
it("auth8 interrupted COMMIT restart requires original authenticated archive and permanent no-admission quarantine",async()=>{
 const f=schema8CrashFixture;if(!f?.candidateState)throw Error("TEST actual unacknowledged auth8 COMMIT required");const {operation,target,precopy,custodyDirectory,archiveId}=f;
 const {openProofDatabase,fingerprint}=await import("../../src/server/backup/snapshot"),{enrollmentDigest}=await import("../../src/server/bootstrap/database");
 const state=()=>{const db=openProofDatabase(path.join(target,"candidate8.sqlite3"));try{return enrollmentDigest(fingerprint(db));}finally{db.close();}};
    const { acquireRuntimeOwnership } = await import("../../src/server/hosting/ownership"), { openAuthorizationGateway, withAdminMaintenanceSource } = await import("../../src/server/auth/gateway");
    const runtime = await acquireRuntimeOwnership(f.filename);
    const { createProtectedRootRecoveryAdmission } = await import("../../src/server/bootstrap/writer-admission");
    const gateway = await openAuthorizationGateway({ ...f.authorization, protectedAdmission: await createProtectedRootRecoveryAdmission(f.config, runtime, 8) });
    try {
      const proof = await gateway.verifyAdminPassword(f.values.ADMIN);
      let failure: unknown;
      await withAdminMaintenanceSource(gateway, proof, runtime, operation, async (source, lease) => {
        try {
          const { inspectLocalVault } = await import("../../src/server/bootstrap/keys"), { readEnrollmentJournal } = await import("../../src/server/bootstrap/journal"), { protectedManifestDigest } = await import("../../src/server/bootstrap/maintenance-journal"), { readProtectedCandidateLedger } = await import("../../src/server/bootstrap/candidate-records");
          const vault = await inspectLocalVault(f.config), anchor = (await readEnrollmentJournal(vault, protectedManifestDigest(8))).find(r => r.kind === "ENROLLED")!;
          const records = (await readProtectedCandidateLedger(vault, enrollmentDigest(anchor))).records; expect(records.map(r => r.kind)).toEqual(["INTENT"]);
          const intent = records[0];
          const { bindTrustedCandidateRecoveryInteraction, quarantineNeverAdmittedCandidate8 } = await import("../../src/server/bootstrap/candidate-recovery8");
          const confirm = vi.fn(async () => "CONFIRM_PERMANENT_NO_ADMISSION" as const), interaction = bindTrustedCandidateRecoveryInteraction({ confirm });
          await expect(quarantineNeverAdmittedCandidate8(f.config, source, lease, operation.operationId, interaction)).rejects.toThrow(); expect(confirm).not.toHaveBeenCalled();
          const { openTestCustody } = await import("../../src/server/backup/crypto"), { verifyAuthentication8Recovery } = await import("../../src/server/bootstrap/authentication-backup");
          const staging = path.join(f.config.directory, "restart-readback"); mkdirSync(staging);
          const recovery = await verifyAuthentication8Recovery(f.config, lease, await openTestCustody(custodyDirectory), path.join(precopy, archiveId + ".age"), staging,
            { archiveId: intent.backupArchiveId, ciphertextSha256: intent.backupCiphertextSha256, sourceStateDigest: intent.sourceStateDigest, originalAnchorDigest: intent.originalAnchorDigest });
          expect(readdirSync(staging)).toEqual([]);
          expect(await quarantineNeverAdmittedCandidate8(f.config, source, lease, operation.operationId, interaction, recovery)).toMatchObject({ status: "QUARANTINED_NO_ADMISSION", sqlOutcome: "UNKNOWN", productionActivation: false });
          expect(state()).toBe(f.candidateState); expect(confirm).toHaveBeenCalledTimes(1);
          expect((await readProtectedCandidateLedger(vault, enrollmentDigest(anchor))).records.map(r => r.kind)).toEqual(["INTENT", "QUARANTINED_NO_ADMISSION"]);
        } catch (error) { failure = error; throw error; }
      }).catch(error => { throw failure ?? error; });
    } finally { await gateway.close().catch(() => {}); await runtime.close(); }
});


it("candidate rollback and tampering never renew a failed migration capability even when native rollback leaves exact8", async () => {
  const f = await candidateCopyFixture();
  const { createAuthenticationBackup8 } = await import("../../src/server/bootstrap/authentication-backup");
  const { withUnadmittedCandidateCopy8, unadmittedCandidateCopy8Evidence, migrateUnadmittedCandidate8, verifiedCandidate41Evidence, bindTrustedCandidateCopyInteraction } = await import("../../src/server/bootstrap/candidate-copy8");
  const { createRequire } = await import("node:module");
  type Native = { name: string; prepare(sql: string): { get(): Record<string, unknown> } };
  const Driver = createRequire(import.meta.url)("better-sqlite3") as { prototype: { exec(this: Native, sql: string): unknown } };
  let beforeCommit = false;
  try {
    const proof = await f.gateway.verifyAdminPassword(f.values.ADMIN), before = f.state();
    await copyTestHandoff(f, proof, async (source, lease) => {
      const backup = await createAuthenticationBackup8(f.config, lease, f.custody, f.precopy, (await import("node:crypto")).randomUUID());
      await expect(withUnadmittedCandidateCopy8(f.config, source, lease, backup, f.target, bindTrustedCandidateCopyInteraction({ confirm: async () => "CONFIRM_NEW_UNADMITTED_COPY8" }), async copy => {
        const actual = Driver.prototype.exec, spy = vi.spyOn(Driver.prototype, "exec").mockImplementation(function(this: Native, sql) {
          if (sql === "COMMIT" && this.name.toLowerCase() === path.join(f.target, "candidate8.sqlite3").toLowerCase()) { beforeCommit = true; throw Error("TEST before first candidate COMMIT"); }
          return actual.call(this, sql);
        });
        try { await expect(migrateUnadmittedCandidate8(copy)).rejects.toThrow("Protected setup unavailable."); expect(beforeCommit).toBe(true); }
        finally { spy.mockRestore(); }
        const { openProofDatabase, fingerprint } = await import("../../src/server/backup/snapshot"), { enrollmentDigest } = await import("../../src/server/bootstrap/database");
        const db = openProofDatabase(path.join(f.target, "candidate8.sqlite3"));
        try { expect(enrollmentDigest(fingerprint(db))).toBe(before); } finally { db.close(); }
        await expect(unadmittedCandidateCopy8Evidence(copy)).rejects.toThrow("Protected setup unavailable.");
        await expect(verifiedCandidate41Evidence(copy)).rejects.toThrow("Protected setup unavailable.");
        await expect(migrateUnadmittedCandidate8(copy)).rejects.toThrow("Protected setup unavailable.");
        const tamper = openProofDatabase(path.join(f.target, "candidate8.sqlite3"), false);
        try { tamper.prepare("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='ADMIN'").run(); } finally { tamper.close(); }
        await expect(unadmittedCandidateCopy8Evidence(copy)).rejects.toThrow("Protected setup unavailable."); expect(f.state()).toBe(before);
      })).rejects.toThrow("Protected setup unavailable.");
      expect(f.state()).toBe(before);
    });
  } finally { await f.gateway.close().catch(() => {}); await f.runtime.close(); }
});


it("protected root41 admission requires genuine runtime, actual keys and DPAPI anchor and rejects live checkpoint tampering", async () => {
  const f = await fixture(); await f.entry.enroll();
  const { acquireRuntimeOwnership } = await import("../../src/server/hosting/ownership"), { openAuthorizationGateway } = await import("../../src/server/auth/gateway");
  const { createProtectedRootWriterAdmission } = await import("../../src/server/bootstrap/writer-admission"), { withProtectedLocalKeys } = await import("../../src/server/bootstrap/keys");
  const runtime = await acquireRuntimeOwnership(path.join(f.config.database.directory, f.config.database.filename));
  let gateway: Awaited<ReturnType<typeof openAuthorizationGateway>> | undefined;
  try {
    await expect(createProtectedRootWriterAdmission(f.config, {})).rejects.toThrow("Protected setup unavailable.");
    let secrets: { ADMIN: string; SALESPERSON: string } | undefined;
    await withProtectedLocalKeys(f.config, async keys => { secrets = { ...keys.signingSecrets }; });
    const authorization = { database: f.config.database, migrationsDirectory: migrations, origins: { ADMIN: "https://localhost:7443", SALESPERSON: "https://127.0.0.1:7443" }, signingSecrets: secrets!, sessionLifetimeSeconds: 120 };
    await expect(openAuthorizationGateway(authorization, 41)).rejects.toThrow("Access denied.");
    const admission = await createProtectedRootWriterAdmission(f.config, runtime);
    expect(() => JSON.stringify(admission)).toThrow("Protected setup unavailable.");
    await expect(openAuthorizationGateway({ ...authorization, protectedAdmission: {} as typeof admission }, 41)).rejects.toThrow("Access denied.");
    await expect(openAuthorizationGateway({ ...authorization, protectedAdmission: admission, signingSecrets: { ADMIN: randomBytes(48).toString("base64url"), SALESPERSON: randomBytes(48).toString("base64url") } }, 41)).rejects.toThrow("Access denied.");
    await expect(openAuthorizationGateway({ ...authorization, protectedAdmission: admission })).rejects.toThrow("Access denied.");
    gateway = await openAuthorizationGateway({ ...authorization, protectedAdmission: admission }, 41);
    for (const role of ["ADMIN", "SALESPERSON"] as const) {
      const proof = await (role === "ADMIN" ? gateway.verifyAdminPassword(f.values[role]) : gateway.verifySalespersonPassword(f.values[role]));
      expect((await (role === "ADMIN" ? gateway.issueAdminSession(proof) : gateway.issueSalespersonSession(proof))).status).toBe(200);
    }
    const anchor = path.join(f.journal, "enrolled.dpapi"), bytes = readFileSync(anchor); bytes[bytes.length - 1] ^= 1; writeFileSync(anchor, bytes);
    await expect(gateway.publicShopName()).rejects.toThrow("Access denied.");
    await expect(gateway.verifyAdminPassword(f.values.ADMIN)).rejects.toThrow("Access denied.");
    await expect(createProtectedRootWriterAdmission(f.config, runtime)).rejects.toThrow("Protected setup unavailable.");
  } finally { await gateway?.close().catch(() => {}); await runtime.close(); }
});


let boundedSelectionSetup: Awaited<ReturnType<typeof candidateCopyFixture>> | undefined;
it("selection disposable source enrolls both roles and binds the original writer", async () => {
  boundedSelectionSetup = await candidateCopyFixture();
  expect(boundedSelectionSetup.authorization.protectedAdmission).toBeDefined();
});
afterAll(async () => { if (boundedSelectionSetup) { await boundedSelectionSetup.gateway.close().catch(() => {}); await boundedSelectionSetup.runtime.close().catch(() => {}); } });
it("selection prerequisite records a fresh known completed candidate without admission", async () => {
  const f = boundedSelectionSetup; if (!f) throw Error("TEST requires enrolled source fixture"); console.info("SELECTION_TEST_STAGE", "fixture-ready");
  const { createAuthenticationBackup8 } = await import("../../src/server/bootstrap/authentication-backup");
  const { withUnadmittedCandidateCopy8, migrateUnadmittedCandidate8, recordKnownCandidateCompletion8, bindTrustedCandidateCopyInteraction } = await import("../../src/server/bootstrap/candidate-copy8");
  const { createCandidateProtectedLocalKeys } = await import("../../src/server/bootstrap/keys");
  const destination: LocalKeyConfiguration = { directory: f.target, database: { directory: f.target, filename: "candidate8.sqlite3", mode: "test", create: false }, migrationsDirectory: migrations };
  try {
    await copyTestHandoff(f, await f.gateway.verifyAdminPassword(f.values.ADMIN), async (source, lease) => {
      const backup = await createAuthenticationBackup8(f.config, lease, f.custody, f.precopy, (await import("node:crypto")).randomUUID()); console.info("SELECTION_TEST_STAGE", "archive-ready");
      await withUnadmittedCandidateCopy8(f.config, source, lease, backup, f.target, bindTrustedCandidateCopyInteraction({ confirm: async () => "CONFIRM_NEW_UNADMITTED_COPY8" }), async copy => {
        await migrateUnadmittedCandidate8(copy); console.info("SELECTION_TEST_STAGE", "migration-ready");
        await createCandidateProtectedLocalKeys(destination, candidateTls, copy); console.info("SELECTION_TEST_STAGE", "keys-ready");
        expect(await recordKnownCandidateCompletion8(copy, destination)).toMatchObject({ status: "COMMITTED_UNADMITTED" }); console.info("SELECTION_TEST_STAGE", "committed");
      });
    }); knownSelectionFixture = f;
  } finally { await f.gateway.close().catch(() => {}); await f.runtime.close(); }
});

it("CURRENT selects only known completed generation, retires original writer and survives owner restart with fresh role sessions", async () => {
  const f = knownSelectionFixture; expect(f).toBeDefined(); if (!f) throw Error("TEST requires verified known-completion fixture");
  const { withProtectedLocalKeys, inspectLocalVault } = await import("../../src/server/bootstrap/keys");
  const { bindTrustedCandidateSelectionInteraction, selectKnownCompletedCandidate8 } = await import("../../src/server/bootstrap/candidate-selection");
  const { createSelectedWriterAdmission, createProtectedRootWriterAdmission, createProtectedRootRecoveryAdmission } = await import("../../src/server/bootstrap/writer-admission");
  const { openAuthorizationGateway, withAdminMaintenanceSource } = await import("../../src/server/auth/gateway");
  const { acquireRuntimeOwnership } = await import("../../src/server/hosting/ownership");
  const { readProtectedCandidateLedger } = await import("../../src/server/bootstrap/candidate-records"), { readEnrollmentJournal } = await import("../../src/server/bootstrap/journal"), { protectedManifestDigest } = await import("../../src/server/bootstrap/maintenance-journal"), { enrollmentDigest } = await import("../../src/server/bootstrap/database");
  const { verifyAuthentication8Recovery } = await import("../../src/server/bootstrap/authentication-backup");
  const destination: LocalKeyConfiguration = { directory: f.target, database: { directory: f.target, filename: "candidate8.sqlite3", mode: "test", create: false }, migrationsDirectory: migrations };
  const runtime = await acquireRuntimeOwnership(f.filename); let gateway: Awaited<ReturnType<typeof openAuthorizationGateway>> | undefined;
  try {
    const admission = await createProtectedRootRecoveryAdmission(f.config, runtime, 8);
    gateway = await openAuthorizationGateway({ ...f.authorization, protectedAdmission: admission });
    await expect(gateway.issueAdminSession({})).rejects.toThrow("Access denied.");
    await expect(gateway.verifySalespersonPassword(f.values.SALESPERSON)).rejects.toThrow("Access denied.");
    const proof = await gateway.verifyAdminPassword(f.values.ADMIN), originalState = f.state();
    await withAdminMaintenanceSource(gateway, proof, runtime, f.operation, async (source, lease) => {
      const vault = await inspectLocalVault(f.config), anchor = (await readEnrollmentJournal(vault, protectedManifestDigest(8))).find(r => r.kind === "ENROLLED")!;
      const intent = (await readProtectedCandidateLedger(vault, enrollmentDigest(anchor))).records[0];
      const staging = path.join(f.config.directory, "selection-restart-validation"); mkdirSync(staging);
      const recovery = await verifyAuthentication8Recovery(f.config, lease, f.custody, path.join(f.precopy, intent.backupArchiveId + ".age"), staging,
        { archiveId: intent.backupArchiveId, ciphertextSha256: intent.backupCiphertextSha256, sourceStateDigest: intent.sourceStateDigest, originalAnchorDigest: intent.originalAnchorDigest });
      expect(await selectKnownCompletedCandidate8(f.config, source, lease, f.operation.operationId, destination,
        bindTrustedCandidateSelectionInteraction({ confirm: async () => "CONFIRM_TEST_WRITER_SELECTION" }), recovery)).toMatchObject({ generation: "1", sourceRetired: true, productionActivation: false });
    });
    expect(f.state()).toBe(originalState);
    await expect(createProtectedRootWriterAdmission(f.config, runtime, 8)).rejects.toThrow();
    await expect(openAuthorizationGateway(f.authorization)).rejects.toThrow("Access denied.");
    let secrets!: typeof f.authorization.signingSecrets; await withProtectedLocalKeys(destination, async keys => { secrets = { ...keys.signingSecrets }; });
    const selected = await createSelectedWriterAdmission(f.config, destination, runtime);
    const config = { ...f.authorization, database: destination.database, migrationsDirectory: destination.migrationsDirectory, protectedAdmission: selected, signingSecrets: secrets };
    await expect(openAuthorizationGateway({ ...config, protectedAdmission: undefined }, 41)).rejects.toThrow("Access denied.");
    gateway = await openAuthorizationGateway(config, 41);
    expect((await gateway.issueAdminSession(await gateway.verifyAdminPassword(f.values.ADMIN))).status).toBe(200);
    expect((await gateway.issueSalespersonSession(await gateway.verifySalespersonPassword(f.values.SALESPERSON))).status).toBe(200);
    expect(f.state()).toBe(originalState);
  } finally { await gateway?.close(); await runtime.close(); }
});


let protectedRestoreFixture: (Awaited<ReturnType<typeof adminHandoffFixture>> & { custody: import("../../src/server/backup/crypto").BackupCustody; archive: string; originalRequest: Request; staffRequest: Request; saleId: string; receipt: unknown; settingsContext: string; destination?: LocalKeyConfiguration; backupConfiguration?: import("../../src/server/backup/worker").TestBackupConfiguration; runtimeConfig?: import("../../src/server/hosting/runtime").LocalRuntimeConfiguration }) | undefined;
afterAll(async () => { const f = protectedRestoreFixture; if (f) { await f.gateway.close().catch(() => {}); await f.runtime.close().catch(() => {}); } });
it("protected restore enrolls an original41 and records actual stock sale cash and Settings history", async () => {
  const f = await adminHandoffFixture(41), { randomUUID } = await import("node:crypto");
  try {
    const session = async (role: "ADMIN" | "SALESPERSON") => { const response = role === "ADMIN" ? await f.gateway.issueAdminSession(await f.gateway.verifyAdminPassword(f.values.ADMIN)) : await f.gateway.issueSalespersonSession(await f.gateway.verifySalespersonPassword(f.values.SALESPERSON));
      return new Request(f.authorization.origins[role] + "/private", { method: "POST", headers: { origin: f.authorization.origins[role], cookie: response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ") } }); };
    const originalRequest = await session("ADMIN"), staffRequest = await session("SALESPERSON");
    const { createInventoryService } = await import("../../src/server/inventory/service"), { createSalesService } = await import("../../src/server/sales/service"), { createCashService } = await import("../../src/server/cash/service"), { createSettingsService } = await import("../../src/server/settings/service");
    const product = await createInventoryService(f.gateway,41).createProduct(originalRequest,{ requestKey:randomUUID(),name:"TEST protected restore",unit:"PACK",buyingPricePaisa:"12300",sellingPricePaisa:"15000",sellingActive:true,openingQuantity:"10",lowStockThreshold:"1" });
    const settingsApi = createSettingsService(f.gateway,"TEST SHOP"), current = await settingsApi.current(originalRequest,"ADMIN"); if (!("context" in current) || typeof current.context !== "string") throw Error();
    await settingsApi.save(originalRequest,f.values.ADMIN,randomUUID(),current.context,{expectedRevision:"0",settings:{shopName:"TEST protected restore",address:"",phone:"",footer:"",receiptLayout:"ordinary",currency:"PKR",timezone:"Asia/Karachi"},reason:"TEST original immutable Settings context"});
    const cash = createCashService(f.gateway,"TEST SHOP",41), ctx=(await cash.context(originalRequest)).context, date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const action = async (kind:import("../../src/server/cash/service").CashAction,input:unknown) => { const key=randomUUID();await cash.prepare(originalRequest,f.values.ADMIN,key,ctx,kind,input);const result=await cash.execute(originalRequest,key,ctx,"ADMIN_VERIFIED_CASH_FACTS");if(result.state!=="COMMITTED")throw Error();return result.result as Record<string,unknown>; };
    const count=await action("START_COUNT",{businessDate:date,evidence:"TEST disposable physical-count declaration"});
    const recorded=await action("RECORD_COUNT",{sessionId:count.sessionId,actualPaisa:"100000",evidence:"TEST disposable opening cash"});
    await action("OPEN_ANCHOR",{countId:recorded.countId,untouchedOpening:"NO",evidence:"TEST prior unknown period preserved"});
    const sales=createSalesService(f.gateway,"TEST SHOP",41), key=randomUUID(), command={requestKey:key,context:(await sales.context(staffRequest)).context,lines:[{productId:product.product.id,quantity:"2",unitPricePaisa:"15000",discountPercent:"0"}],cashPaisa:"30000",cashDate:date,customerName:"",customerPhone:""};
    await cash.admit(staffRequest,"SALESPERSON",{kind:"SALE",key,input:command});const receipt=await sales.create(staffRequest,command);
    const { createTestCustody } = await import("../../src/server/backup/crypto"), directory=path.join(f.config.directory,"protected-backup-custody");mkdirSync(directory);const custody=await createTestCustody(directory);
    protectedRestoreFixture={...f,custody,archive:"",originalRequest,staffRequest,saleId:receipt.id,receipt,settingsContext:current.context};
  } catch(error) { await f.gateway.close();await f.runtime.close();throw error; }
});
it("protected backup authenticates a real financial snapshot under CURRENT admission", async () => {
  const f=protectedRestoreFixture;if(!f)throw Error("TEST setup missing");
  const { createProtectedArchive41 } = await import("../../src/server/backup/service"), directory=path.join(f.config.directory,"protected-archive");mkdirSync(directory);
  const result=await createProtectedArchive41(f.custody,f.config.database,directory,f.authorization.protectedAdmission!);f.archive=result.archive;
  expect(result.manifest.schema).toBe(41);expect(result.manifest.fingerprint).toBeDefined();
});
it("protected restore preserves exact financial rows and requires fresh keys known completion and deliberate CURRENT", async () => {
  const f=protectedRestoreFixture;if(!f||!f.archive)throw Error("TEST authenticated archive missing");
  const { randomUUID } = await import("node:crypto"), { withAdminMaintenanceSource } = await import("../../src/server/auth/gateway");
  const { withProtectedRestore41,completeProtectedRestore41,selectProtectedRestore41,bindTrustedProtectedRestoreInteraction } = await import("../../src/server/bootstrap/restore41");
  const { createRestoredCandidateProtectedLocalKeys } = await import("../../src/server/bootstrap/keys"), { bindTrustedCandidateSelectionInteraction } = await import("../../src/server/bootstrap/candidate-selection");
  const operation={operationId:randomUUID(),purpose:"RESTORE41" as const}, directory=path.join(f.config.directory,operation.operationId);mkdirSync(directory);
  const proof=await f.gateway.verifyAdminPassword(f.values.ADMIN), before=f.state();
  try {
    await withAdminMaintenanceSource(f.gateway,proof,f.runtime,operation,async(source,lease)=>{
      await withProtectedRestore41(f.config,f.config,source,lease,f.custody,f.archive,directory,operation.operationId,
        bindTrustedProtectedRestoreInteraction({confirm:async()=>"CONFIRM_SEPARATE_TEST_RESTORE41"}),async(candidate,destination)=>{
          f.destination=destination;
          await expect(selectProtectedRestore41(candidate,bindTrustedCandidateSelectionInteraction({confirm:async()=>"CONFIRM_TEST_WRITER_SELECTION"}))).rejects.toThrow();
          const {X509Certificate,createHash}=await import("node:crypto");
          expect(new X509Certificate(reissuedSourceTls.certificate).fingerprint256).not.toBe(new X509Certificate(tls.certificate).fingerprint256);
          const publicDigest=(certificate:Buffer)=>createHash("sha256").update(new X509Certificate(certificate).publicKey.export({type:"spki",format:"der"})).digest("hex");expect(publicDigest(reissuedSourceTls.certificate)).toBe(publicDigest(tls.certificate));
          await expect(createRestoredCandidateProtectedLocalKeys(destination,reissuedSourceTls,candidate)).rejects.toThrow("Protected setup unavailable.");
          await createRestoredCandidateProtectedLocalKeys(destination,candidateTls,candidate);
          expect(await completeProtectedRestore41(candidate)).toMatchObject({status:"COMMITTED_UNADMITTED"});
          // Deliberately leave known COMMITTED for a separate restart finalizer.
        });
    });expect(f.state()).toBe(before);
  } finally { await f.gateway.close().catch(()=>{});await f.runtime.close(); }
});
it("protected restore known COMMITTED restart finalization resolves a lost CURRENT publication by readback without replay",async()=>{
 const f=protectedRestoreFixture;if(!f?.destination)throw Error("TEST known completion missing");
 const {acquireRuntimeOwnership}=await import("../../src/server/hosting/ownership"),{createProtectedRootRecoveryAdmission,createSelectedWriterAdmission}=await import("../../src/server/bootstrap/writer-admission"),{openAuthorizationGateway,withAdminMaintenanceSource}=await import("../../src/server/auth/gateway");
 const {finalizeProtectedRestore41,quarantineNeverAdmittedRestore41}=await import("../../src/server/bootstrap/restore41"),{bindTrustedCandidateSelectionInteraction}=await import("../../src/server/bootstrap/candidate-selection"),{bindTrustedCandidateRecoveryInteraction}=await import("../../src/server/bootstrap/candidate-recovery8");
 const {inspectLocalVault}=await import("../../src/server/bootstrap/keys"),{readEnrollmentJournal}=await import("../../src/server/bootstrap/journal"),{protectedManifestDigest}=await import("../../src/server/bootstrap/maintenance-journal"),{readProtectedCandidateLedger,classifyCandidateLedger}=await import("../../src/server/bootstrap/candidate-records"),{enrollmentDigest}=await import("../../src/server/bootstrap/database");
 const vault=await inspectLocalVault(f.config),anchor=(await readEnrollmentJournal(vault,protectedManifestDigest(41))).find(r=>r.kind==="ENROLLED")!,ledger=await readProtectedCandidateLedger(vault,enrollmentDigest(anchor)),operation={operationId:ledger.records.at(-1)!.operationId,purpose:"RESTORE41" as const};
 const runtime=await acquireRuntimeOwnership(f.filename);let gateway:Awaited<ReturnType<typeof openAuthorizationGateway>>|undefined;
 try{await expect(createSelectedWriterAdmission(f.config,f.destination,runtime)).rejects.toThrow();
 gateway=await openAuthorizationGateway({...f.authorization,protectedAdmission:await createProtectedRootRecoveryAdmission(f.config,runtime,41)},41);
 const proof=await gateway.verifyAdminPassword(f.values.ADMIN);fault.currentPublications=0;
 await withAdminMaintenanceSource(gateway,proof,runtime,operation,async(source,lease)=>{
  await expect(quarantineNeverAdmittedRestore41(f.config,f.config,source,lease,operation.operationId,bindTrustedCandidateRecoveryInteraction({confirm:async()=>"CONFIRM_PERMANENT_NO_ADMISSION"}))).rejects.toThrow();
  fault.lostCurrent=true;
  await expect(finalizeProtectedRestore41(f.config,f.config,f.destination!,source,lease,operation.operationId,bindTrustedCandidateSelectionInteraction({confirm:async()=>"CONFIRM_TEST_WRITER_SELECTION"}))).rejects.toThrow();
  expect(fault.lostCurrent).toBe(false);expect(fault.currentPublications).toBe(1);
  expect(classifyCandidateLedger(await readProtectedCandidateLedger(vault,enrollmentDigest(anchor)))).toMatchObject({status:"RECORDED_CURRENT",recordedCurrent:{generation:"1"}});
 });
 expect(await createSelectedWriterAdmission(f.config,f.destination,runtime)).toBeDefined();
 }finally{fault.lostCurrent=false;await gateway?.close();await runtime.close();}
});
it("protected restore independent reopen rejects TEST proofs and old sessions while new commands retain historical Settings", async () => {
  const f=protectedRestoreFixture;if(!f?.destination)throw Error("TEST known protected restore missing");
  const { acquireRuntimeOwnership } = await import("../../src/server/hosting/ownership"), { createSelectedWriterAdmission,createProtectedRootWriterAdmission } = await import("../../src/server/bootstrap/writer-admission"), { createProtectedRestoredHistory } = await import("../../src/server/backup/protected-history");
  const { withProtectedLocalKeys } = await import("../../src/server/bootstrap/keys"), { openAuthorizationGateway } = await import("../../src/server/auth/gateway"), { createSettingsService } = await import("../../src/server/settings/service"), { createSalesService } = await import("../../src/server/sales/service");
  const runtime=await acquireRuntimeOwnership(path.join(f.destination.database.directory,f.destination.database.filename));let gateway:Awaited<ReturnType<typeof openAuthorizationGateway>>|undefined;
  try {
    await expect(createProtectedRootWriterAdmission(f.config,runtime,41)).rejects.toThrow();
    const admission=await createSelectedWriterAdmission(f.config,f.destination,runtime),history=createProtectedRestoredHistory(admission,f.destination.database);let secrets!:typeof f.authorization.signingSecrets;
    await withProtectedLocalKeys(f.destination,async keys=>{secrets={...keys.signingSecrets};});
    const config={...f.authorization,database:f.destination.database,protectedAdmission:admission,signingSecrets:secrets};
    await expect(openAuthorizationGateway(config,41)).rejects.toThrow("Access denied.");
    await expect(openAuthorizationGateway({...config,protectedHistory:{} as typeof history},41)).rejects.toThrow();
    gateway=await openAuthorizationGateway({...config,protectedHistory:history},41);
    await expect(gateway.authorizeAdmin(f.originalRequest)).rejects.toThrow("Access denied.");
    const response=await gateway.issueAdminSession(await gateway.verifyAdminPassword(f.values.ADMIN)),request=new Request(f.authorization.origins.ADMIN+"/private",{method:"POST",headers:{origin:f.authorization.origins.ADMIN,cookie:response.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")}});
    const staffResponse=await gateway.issueSalespersonSession(await gateway.verifySalespersonPassword(f.values.SALESPERSON)),staffRequest=new Request(f.authorization.origins.SALESPERSON+"/private",{headers:{cookie:staffResponse.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")}});
    expect(await createSalesService(gateway,"TEST SHOP",41).get(staffRequest,f.saleId)).toEqual(f.receipt);
    const settingsApi=createSettingsService(gateway,"TEST SHOP"),current=await settingsApi.current(request,"ADMIN");if(!("context" in current)||typeof current.context!=="string")throw Error();expect(current.context).not.toBe(f.settingsContext);
    await settingsApi.save(request,f.values.ADMIN,(await import("node:crypto")).randomUUID(),current.context,{expectedRevision:"1",settings:{shopName:"TEST new destination",address:"",phone:"",footer:"",receiptLayout:"ordinary",currency:"PKR",timezone:"Asia/Karachi"},reason:"TEST new context without history rewriting"});
    const {configureProtectedBackups41}=await import("../../src/server/backup/worker"),root=path.join(f.destination.directory,"worker"),offDevice=path.join(f.destination.directory,"test-export");mkdirSync(root);mkdirSync(offDevice);
    f.backupConfiguration=await configureProtectedBackups41(gateway,request,f.values.ADMIN,f.custody,f.destination.database,root,offDevice,admission,history);
  } finally { await gateway?.close();await runtime.close(); }
});


it("protected restored runtime authenticates actual HTTPS and Chromium and rejects unauthorized role and Origin access",async()=>{
 const f=protectedRestoreFixture;if(!f?.destination||!f.backupConfiguration||!process.env.SHOP_POS_INVENTORY_BUILT_APP)throw Error("TEST verified restore and exact built app required");
 const net=await import("node:net"),https=await import("node:https"),{withProtectedLocalKeys}=await import("../../src/server/bootstrap/keys"),{startLocalRuntime}=await import("../../src/server/hosting/runtime");
 const server=net.createServer();await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const port=(server.address() as import("node:net").AddressInfo).port;await new Promise<void>(resolve=>server.close(()=>resolve()));
 let secrets!:typeof f.authorization.signingSecrets;await withProtectedLocalKeys(f.destination,async keys=>{secrets={...keys.signingSecrets};});
 const config:import("../../src/server/hosting/runtime").LocalRuntimeConfiguration={applicationDirectory:process.env.SHOP_POS_INVENTORY_BUILT_APP,port,tls:candidateTls,protectedIdentity:{root:f.config,selected:f.destination},authorization:{...f.authorization,database:f.destination.database,signingSecrets:secrets,protectedAdmission:undefined,origins:{ADMIN:"https://localhost:"+port,SALESPERSON:"https://127.0.0.1:"+port}},testSales:{shopName:"TEST SHOP"},testReturns:true,testExpenses:true,testInvoiceCorrections:true,testReports:true,testCash:true,testSettings:true,testBackups:f.backupConfiguration};f.runtimeConfig=config;
 const wire=(endpoint:string,role:"ADMIN"|"SALESPERSON",cookies:string[]=[],value?:unknown,origin?:string)=>new Promise<{status:number;body:string;cookies:string[]}>((resolve,reject)=>{
  const body=value===undefined?undefined:JSON.stringify(value),request=https.request({hostname:"127.0.0.1",servername:role==="ADMIN"?"localhost":"",port,ca:candidateTls.trustAnchor,agent:false,path:endpoint,method:body?"POST":"GET",headers:{host:new URL(config.authorization.origins[role]).host,origin:origin??config.authorization.origins[role],cookie:cookies.map(c=>c.split(";")[0]).join("; "),...(body?{"content-type":"application/json","content-length":Buffer.byteLength(body)}:{})}},response=>{const chunks:Buffer[]=[];response.on("data",b=>chunks.push(b));response.on("end",()=>resolve({status:response.statusCode!,body:Buffer.concat(chunks).toString(),cookies:response.headers["set-cookie"]??[]}));});request.once("error",reject);request.end(body);
 });
 const runtime=await startLocalRuntime(config);
 try{
  expect(runtime.authenticationEnabled).toBe(true);
  expect((await wire("/api/admin/products","ADMIN")).status).toBe(403);
  const admin=await wire("/api/auth/login","ADMIN",[],{password:f.values.ADMIN}),staff=await wire("/api/auth/login","SALESPERSON",[],{password:f.values.SALESPERSON});expect(admin.status).toBe(200);expect(staff.status).toBe(200);
  expect((await wire("/api/admin/products","SALESPERSON",staff.cookies)).status).toBe(403);
  expect((await wire("/api/admin/products","ADMIN",admin.cookies,undefined,"https://foreign.invalid")).status).toBe(403);
  const receipt=await wire("/api/pos/sales/"+f.saleId,"SALESPERSON",staff.cookies);expect(receipt.status).toBe(200);expect(JSON.parse(receipt.body)).toEqual(f.receipt);
  const {chromium}=await import("playwright"),{createHash,X509Certificate}=await import("node:crypto"),spki=createHash("sha256").update(new X509Certificate(candidateTls.certificate).publicKey.export({type:"spki",format:"der"})).digest("base64");
  const browser=await chromium.launch({headless:true,args:["--ignore-certificate-errors-spki-list="+spki]});
  try{const context=await browser.newContext({ignoreHTTPSErrors:false}),page=await context.newPage();await page.goto(config.authorization.origins.ADMIN+"/login");
   await expect.poll(()=>page.getByRole("button",{name:"Open Shop",exact:true}).isEnabled(),{timeout:60000}).toBe(true);
   expect(await page.locator("#login-password").inputValue()).toBe("");await page.locator("#login-password").fill(f.values.ADMIN);await page.getByRole("button",{name:"Open Shop",exact:true}).click();
   await expect.poll(()=>new URL(page.url()).pathname,{timeout:60000}).toBe("/admin/products");await page.goto(config.authorization.origins.ADMIN+"/admin/settings");
   expect(await page.getByLabel(/shop name/i).inputValue()).toBe("TEST new destination");await context.close();
  }finally{await browser.close();}
 }finally{await runtime.close();}
});
it("protected runtime maintenance drains HTTPS and backup work while pinning the sole writer lease",async()=>{
 const f=protectedRestoreFixture;if(!f?.runtimeConfig||!f.destination)throw Error("TEST runtime missing");
 const {startLocalRuntime,withLocalRuntimeMaintenance}=await import("../../src/server/hosting/runtime"),{adminMaintenanceSourceEvidence}=await import("../../src/server/auth/gateway"),{acquireRuntimeOwnership}=await import("../../src/server/hosting/ownership"),{randomUUID}=await import("node:crypto");
 const runtime=await startLocalRuntime(f.runtimeConfig),operation={operationId:randomUUID(),purpose:"RESTORE41" as const};
 await withLocalRuntimeMaintenance(runtime,f.values.ADMIN,operation,async(source,lease)=>{
  expect(adminMaintenanceSourceEvidence(source,f.destination!.database,lease,operation).schema).toBe(41);
  await expect(runtime.close()).rejects.toThrow("Local service unavailable.");await expect(acquireRuntimeOwnership(f.filename)).rejects.toThrow("Local service unavailable.");
 });
 const acquired=await acquireRuntimeOwnership(f.filename);await acquired.close();
});
it("protected restore receipt tampering invalidates a live admission and independent restart",async()=>{
 const f=protectedRestoreFixture;if(!f?.destination)throw Error("TEST restored target missing");
 const {acquireRuntimeOwnership}=await import("../../src/server/hosting/ownership"),{createSelectedWriterAdmission,assertProtectedWriterAdmission}=await import("../../src/server/bootstrap/writer-admission");
 const runtime=await acquireRuntimeOwnership(path.join(f.destination.database.directory,f.destination.database.filename));
 try{const admission=await createSelectedWriterAdmission(f.config,f.destination,runtime),receipt=path.join(f.destination.directory,"protected-identity","restore41","restore.dpapi"),bytes=readFileSync(receipt);bytes[bytes.length-1]^=1;writeFileSync(receipt,bytes);
 expect(()=>assertProtectedWriterAdmission(admission,f.destination!.database,undefined,true)).toThrow();await expect(createSelectedWriterAdmission(f.config,f.destination,runtime)).rejects.toThrow();
 }finally{await runtime.close();}
});

it("runtime lease rejects release during a borrowed bootstrap callback and releases only after known closure", async () => {
 const directory=mkdtempSync(path.join(run,"pinned-runtime-"));copyFileSync(blank41,path.join(directory,"test.sqlite3"));
 const database={directory,filename:"test.sqlite3",mode:"test" as const,create:false};
 const {acquireRuntimeOwnership}=await import("../../src/server/hosting/ownership"),{withHeldBootstrapOwnership,hasActiveBootstrapLease}=await import("../../src/server/bootstrap/ownership");
 const runtime=await acquireRuntimeOwnership(path.join(directory,"test.sqlite3"));
 try{await withHeldBootstrapOwnership(database,runtime,async(_retain,lease)=>{
   expect(hasActiveBootstrapLease(lease,database)).toBe(true);await expect(runtime.close()).rejects.toThrow("Local service unavailable.");
   runtime.assertHeld();await expect(acquireRuntimeOwnership(path.join(directory,"test.sqlite3"))).rejects.toThrow("Local service unavailable.");
 });runtime.assertHeld();}finally{await runtime.close();}
 const reopened=await acquireRuntimeOwnership(path.join(directory,"test.sqlite3"));await reopened.close();
});


let interruptedRestoreFixture: (Awaited<ReturnType<typeof adminHandoffFixture>> & {custody:import("../../src/server/backup/crypto").BackupCustody;custodyDirectory:string;archive:string;operation:{operationId:string;purpose:"RESTORE41"};target:string;targetState?:string}) | undefined;
it("restore crash prerequisite retains an authenticated archive and untouched enrolled original41", async()=>{
 const f=await adminHandoffFixture(41),{createTestCustody}=await import("../../src/server/backup/crypto"),{createProtectedArchive41}=await import("../../src/server/backup/service"),{randomUUID}=await import("node:crypto");
 try{const custodyDirectory=path.join(f.config.directory,"crash41-custody"),staging=path.join(f.config.directory,"crash41-backup");mkdirSync(custodyDirectory);mkdirSync(staging);const custody=await createTestCustody(custodyDirectory);
 const archived=await createProtectedArchive41(custody,f.config.database,staging,f.authorization.protectedAdmission!);const operation={operationId:randomUUID(),purpose:"RESTORE41" as const},target=path.join(f.config.directory,operation.operationId);mkdirSync(target);
 interruptedRestoreFixture={...f,custody,custodyDirectory,archive:archived.archive,operation,target};
 }finally{await f.gateway.close();await f.runtime.close();}
});
it("actual restore child killed after SQLite backup never grants completion or adoption",async()=>{
 const f=interruptedRestoreFixture;if(!f)throw Error("TEST crash preparation missing");
 const child=fork(path.resolve("tests/helpers/maintenance-runtime-probe.mjs"),[],{cwd:process.cwd(),execArgv:["--experimental-transform-types","--disable-warning=ExperimentalWarning","--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"],env:{...process.env,NODE_ENV:"test"},stdio:["ignore","ignore","pipe","ipc"],windowsHide:true});
 const exited=once(child,"exit");child.stderr!.resume();
 try{const reply=new Promise<{status:string}>((resolve,reject)=>{child.once("message",resolve);child.once("error",reject);child.once("exit",()=>reject(Error("TEST restore child exited before backup pause")));});
 child.send({action:"pause-restore-copy-ack",filename:f.filename,config:f.config,authorization:{...f.authorization,protectedAdmission:undefined},password:f.values.ADMIN,operation:f.operation,target:f.target,custodyDirectory:f.custodyDirectory,archive:f.archive});
 expect((await reply).status).toBe("ACTUAL_RESTORE_COPY_UNACKNOWLEDGED");expect(child.kill("SIGTERM")).toBe(true);await exited;
 // Disposable simulation of a flushed/partial orphan publication. Retain it
 // permanently; a later native quarantine must fence it without deletion.
 const orphan=path.join(f.config.directory,"protected-identity","candidate-authority","000001."+f.operation.operationId+".committed.dpapi."+(await import("node:crypto")).randomUUID()+".pending");writeFileSync(orphan,Buffer.alloc(0),{flag:"wx"});
 const {openProofDatabase,fingerprint}=await import("../../src/server/backup/snapshot"),{enrollmentDigest}=await import("../../src/server/bootstrap/database");const db=openProofDatabase(path.join(f.target,"restored41.sqlite3"));try{expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(BigInt(41));f.targetState=enrollmentDigest(fingerprint(db));}finally{db.close();}
 }finally{if(child.exitCode===null&&child.signalCode===null){child.kill("SIGTERM");await exited;}}
});
it("restore crash recovery requires restricted fresh Admin and permanently quarantines the unacknowledged copy",async()=>{
 const f=interruptedRestoreFixture;if(!f?.targetState)throw Error("TEST interrupted restore missing");
 const {acquireRuntimeOwnership}=await import("../../src/server/hosting/ownership"),{createProtectedRootWriterAdmission,createProtectedRootRecoveryAdmission}=await import("../../src/server/bootstrap/writer-admission"),{openAuthorizationGateway,withAdminMaintenanceSource}=await import("../../src/server/auth/gateway");
 const {quarantineNeverAdmittedRestore41}=await import("../../src/server/bootstrap/restore41"),{bindTrustedCandidateRecoveryInteraction}=await import("../../src/server/bootstrap/candidate-recovery8"),{openProofDatabase,fingerprint}=await import("../../src/server/backup/snapshot"),{enrollmentDigest}=await import("../../src/server/bootstrap/database");
 const runtime=await acquireRuntimeOwnership(f.filename);let gateway:Awaited<ReturnType<typeof openAuthorizationGateway>>|undefined;
 try{await expect(createProtectedRootWriterAdmission(f.config,runtime,41)).rejects.toThrow();
 gateway=await openAuthorizationGateway({...f.authorization,protectedAdmission:await createProtectedRootRecoveryAdmission(f.config,runtime,41)},41);
 await expect(gateway.verifySalespersonPassword(f.values.SALESPERSON)).rejects.toThrow("Access denied.");
 const proof=await gateway.verifyAdminPassword(f.values.ADMIN),before=f.state();
 await withAdminMaintenanceSource(gateway,proof,runtime,f.operation,async(source,lease)=>{
  expect(await quarantineNeverAdmittedRestore41(f.config,f.config,source,lease,f.operation.operationId,bindTrustedCandidateRecoveryInteraction({confirm:async()=>"CONFIRM_PERMANENT_NO_ADMISSION"}))).toMatchObject({status:"QUARANTINED_NO_ADMISSION",sqlOutcome:"UNKNOWN",productionActivation:false});
 });expect(f.state()).toBe(before);
 const db=openProofDatabase(path.join(f.target,"restored41.sqlite3"));try{expect(enrollmentDigest(fingerprint(db))).toBe(f.targetState);}finally{db.close();}
 expect(await createProtectedRootWriterAdmission(f.config,runtime,41)).toBeDefined();
 }finally{await gateway?.close();await runtime.close();}
});


it("unpublished INTENT recovery authenticates orphan bytes and permanently fences the UUID without guessing or deleting its payload",async()=>{
 const f=interruptedRestoreFixture;if(!f)throw Error("TEST original41 recovery prerequisite missing");
 const {randomUUID}=await import("node:crypto"),{storage}=await import("../../src/server/backup/storage"),{decryptSnapshot}=await import("../../src/server/backup/crypto"),{acquireRuntimeOwnership}=await import("../../src/server/hosting/ownership");
 const {createProtectedRootRecoveryAdmission,createProtectedRootWriterAdmission}=await import("../../src/server/bootstrap/writer-admission"),{openAuthorizationGateway,withAdminMaintenanceSource}=await import("../../src/server/auth/gateway"),{quarantineUnpublishedCandidate,bindTrustedCandidateRecoveryInteraction}=await import("../../src/server/bootstrap/candidate-recovery8");
 const operation={operationId:randomUUID(),purpose:"RESTORE41" as const},directory=path.join(f.config.directory,operation.operationId),staging=path.join(f.config.directory,"unpublished-readback");mkdirSync(directory);mkdirSync(staging);await storage(directory,"initialize");await storage(staging,"initialize");copyFileSync(f.filename,path.join(directory,"restored41.sqlite3"));
 const orphan=path.join(f.config.directory,"protected-identity","candidate-authority","000003."+operation.operationId+".intent.dpapi."+randomUUID()+".pending"),orphanBytes=Buffer.from("TEST_PARTIAL_CIPHER_NO_AUTHENTICATED_INTENT");writeFileSync(orphan,orphanBytes,{flag:"wx"});
 const plaintext=path.join(staging,"unpublished.pending"),manifest=await decryptSnapshot(f.custody,f.archive,plaintext),destination:LocalKeyConfiguration={directory,database:{directory,filename:"restored41.sqlite3",mode:"test",create:false},migrationsDirectory:migrations};
 const runtime=await acquireRuntimeOwnership(f.filename);let gateway:Awaited<ReturnType<typeof openAuthorizationGateway>>|undefined;
 try{await expect(createProtectedRootWriterAdmission(f.config,runtime,41)).rejects.toThrow();gateway=await openAuthorizationGateway({...f.authorization,protectedAdmission:await createProtectedRootRecoveryAdmission(f.config,runtime,41)},41);
 const proof=await gateway.verifyAdminPassword(f.values.ADMIN),before=f.state();await withAdminMaintenanceSource(gateway,proof,runtime,operation,async(source,lease)=>{
  await expect(quarantineUnpublishedCandidate(f.config,f.config,destination,source,lease,operation.operationId,bindTrustedCandidateRecoveryInteraction({confirm:async()=>"CONFIRM_PERMANENT_NO_ADMISSION"}),f.custody,{} as typeof manifest,f.archive,plaintext)).rejects.toThrow();
  expect(await quarantineUnpublishedCandidate(f.config,f.config,destination,source,lease,operation.operationId,bindTrustedCandidateRecoveryInteraction({confirm:async()=>"CONFIRM_PERMANENT_NO_ADMISSION"}),f.custody,manifest,f.archive,plaintext)).toMatchObject({status:"QUARANTINED_NO_ADMISSION",unpublishedIntent:true,sqlOutcome:"UNKNOWN",productionActivation:false});
 });expect(f.state()).toBe(before);expect(readFileSync(orphan)).toEqual(orphanBytes);expect(await createProtectedRootWriterAdmission(f.config,runtime,41)).toBeDefined();
 }finally{await gateway?.close();await runtime.close();}
});


it("protected database directory with a foreign ACL is rejected at fresh admission without changing SQL",async()=>{
 const f=await adminHandoffFixture(41),before=f.state();await f.gateway.close();
 try{
  const task=promisify(execFile)(path.join(process.env.SystemRoot!,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoLogo","-NoProfile","-NonInteractive","-Command","$target=[Console]::In.ReadToEnd();$entry=New-Object IO.DirectoryInfo($target);$acl=$entry.GetAccessControl([Security.AccessControl.AccessControlSections]::Access);$principal=New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545');$rule=New-Object Security.AccessControl.FileSystemAccessRule($principal,'Read','Allow');[void]$acl.AddAccessRule($rule);$entry.SetAccessControl($acl)"],{windowsHide:true});task.child.stdin!.end(f.config.database.directory);await task;
  const {createProtectedRootWriterAdmission}=await import("../../src/server/bootstrap/writer-admission");await expect(createProtectedRootWriterAdmission(f.config,f.runtime,41)).rejects.toThrow("Protected setup unavailable.");expect(f.state()).toBe(before);
 }finally{await f.runtime.close();}
});
