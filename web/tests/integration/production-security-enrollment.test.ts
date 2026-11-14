import { createPrivateKey, randomBytes } from "node:crypto";
import { execFile, fork } from "node:child_process";
import { promisify } from "node:util";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, expect, it, vi } from "vitest";
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

const fault = vi.hoisted(() => ({ sql: false, lostCommit: false, anchor: false }));
vi.mock("../../src/server/bootstrap/windows", async original => {
  const actual = await original<typeof import("../../src/server/bootstrap/windows")>();
  return { ...actual, windowsProtection: async (message: Readonly<Record<string, string>>) => {
    if (fault.anchor && message.operation === "record-create" && message.name === "enrolled.dpapi") {
      fault.anchor = false; throw new actual.BootstrapRejected();
    }
    return actual.windowsProtection(message);
  } };
});
vi.mock("../../src/server/auth/database", async original => {
  const actual = await original<typeof import("../../src/server/auth/database")>();
  return { ...actual, openAsyncOwner: (config: Parameters<typeof actual.openAsyncOwner>[0]) => {
    const owner = actual.openAsyncOwner(config), run = owner.run;
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

const root = path.resolve("test-results/sqlite-b1b-part1");
mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "production-security41-"));
const migrations = path.resolve("src/server/db/migrations");
let tls: LocalTlsMaterial;
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
  const base = path.join(run, "blank41"); mkdirSync(base);
  const db = openDatabase({ directory: base, filename: "test.sqlite3", mode: "test", create: true });
  try { applyMigrations(db, migrations); applySalesMigration36(db); applyReturnsMigration37(db); applyExpensesMigration38(db); applyInvoicesMigration39(db); applyCashMigration40(db); applySettingsMigration41(db); } finally { db.close(); }
  blank41 = path.join(base, "test.sqlite3");
});

async function fixture(version: 8 | 41 = 41) {
  const directory = mkdtempSync(path.join(run, "case-")), data = path.join(directory, "data"); mkdirSync(data);
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
