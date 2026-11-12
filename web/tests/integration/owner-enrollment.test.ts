import { createPrivateKey, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { execFile, fork } from "node:child_process";
import { promisify } from "node:util";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openDatabase, type SqliteConnection } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { classifyEnrollment, type EnrollmentRecord } from "../../src/server/bootstrap/journal";
import { enrollmentDigest } from "../../src/server/bootstrap/database";
import { passwordCallbacks } from "../../src/server/auth/password";
import { createProtectedLocalKeys, type LocalKeyConfiguration } from "../../src/server/bootstrap/keys";
import { bindTrustedDesktopOwnerInteraction, createTrustedOwnerEnrollmentEntry, inspectOwnerEnrollment,
  type DesktopOwnerAdapter, type TrustedDesktopOwnerInteraction } from "../../src/server/bootstrap/owner-enrollment";
import { BootstrapRejected } from "../../src/server/bootstrap/windows";
import type { LocalTlsMaterial } from "../../src/server/hosting/https";

const probe = vi.hoisted(() => ({
  beforeRecord: "", afterRecord: "", pendingRecord: "", sqlFailure: false, lostCommitAck: false,
  beforeWrite: undefined as undefined | (() => Promise<void>), commitFault: false, commitFaults: 0,
}));
vi.mock("../../src/server/bootstrap/windows", async original => {
  const actual = await original<typeof import("../../src/server/bootstrap/windows")>();
  return { ...actual, windowsProtection: async (m: Readonly<Record<string, string>>) => {
    if (m.operation === "seal") {
      const p = JSON.parse(Buffer.from(m.payload, "base64").toString()) as { signingSecrets: Record<string, string> };
      for (const s of Object.values(p.signingSecrets)) sensitive.add(s);
    }
    if (m.operation === "record-create") {
      if (m.name === probe.beforeRecord) throw new actual.BootstrapRejected();
      if (m.name === probe.pendingRecord) {
        writeFileSync(path.join(m.directory, m.name + ".pending"), "TEST-INCOMPLETE", { flag: "wx" });
        throw new actual.BootstrapRejected();
      }
    }
    const value = await actual.windowsProtection(m); // ALL successful writes/reads are real DPAPI/NTFS.
    if (m.operation === "record-create" && m.name === probe.afterRecord) throw new actual.BootstrapRejected();
    return value;
  } };
});
vi.mock("../../src/server/auth/database", async original => {
  const actual = await original<typeof import("../../src/server/auth/database")>();
  return { ...actual, openAsyncOwner: (c: Parameters<typeof actual.openAsyncOwner>[0]) => {
    const owner = actual.openAsyncOwner(c), run = owner.run;
    owner.run = (sql, values) => {
      const value = run(sql, values);
      if (probe.sqlFailure && sql.startsWith("INSERT INTO auth_principals")) {
        probe.sqlFailure = false; throw new Error("TEST fail after actual first account writes");
      }
      return value;
    };
    return owner;
  } };
});
vi.mock("../../src/server/auth/provision", async original => {
  const actual = await original<typeof import("../../src/server/auth/provision")>();
  return { ...actual, runTrustedFirstRunSetup: async (...args: Parameters<typeof actual.runTrustedFirstRunSetup>) => {
    await probe.beforeWrite?.();
    const value = await actual.runTrustedFirstRunSetup(...args); // NEVER fake successful provisioning/COMMIT.
    if (probe.lostCommitAck) throw new Error("TEST lost acknowledgement after actual COMMIT");
    return value;
  } };
});
const execute = promisify(execFile), migrationsDirectory = path.resolve("src/server/db/migrations");
const root = path.resolve("test-results/sqlite-b1b-part1"); mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "enrollment3s-")), certDirectory = path.join(run, "tls"), baseDirectory = path.join(run, "base");
const sensitive = new Set<string>(), readers: SqliteConnection[] = [], audits: (() => void)[] = [];
const stable = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
const contains = (s: string) => [...sensitive].some(v => s.includes(v));
const fake = (n = 12) => { const s = randomBytes(n).toString("base64url"); sensitive.add(s); return s; };
const passwords = () => ({ ADMIN: fake(), SALESPERSON: fake() });
let tls: LocalTlsMaterial;
const tables = ["auth_users", "auth_credentials", "auth_principals", "auth_session_authorizations", "auth_provisioning", "auth_login_attempts", "auth_enrollment_binding"];
function fixture() {
  const directory = mkdtempSync(path.join(run, "case-")), data = path.join(directory, "data"); mkdirSync(data);
  copyFileSync(path.join(baseDirectory, "test.sqlite3"), path.join(data, "test.sqlite3"));
  const database = { directory: data, filename: "test.sqlite3", mode: "test" as const, create: false, busyTimeoutMs: 75 };
  const config: LocalKeyConfiguration = { directory, database, migrationsDirectory };
  const db = openDatabase(database); readers.push(db);
  const snapshot = () => stable({ history: db.all("SELECT * FROM schema_migrations ORDER BY version"),
    objects: db.all("SELECT name,sql FROM sqlite_schema ORDER BY name"), version: db.get("SELECT user_version FROM pragma_user_version"),
    data: tables.map(t => db.all("SELECT * FROM " + t)) });
  const history = stable(db.all("SELECT * FROM schema_migrations ORDER BY version")), before = snapshot();
  const keyDirectory = path.join(directory, "protected-identity"), keyFile = path.join(keyDirectory, "identity.dpapi"), journal = path.join(keyDirectory, "enrollment");
  const empty = () => { for (const t of tables) expect(db.get("SELECT count(*) AS n FROM " + t)?.n).toBe(BigInt(0)); };
  const files = () => existsSync(journal) ? readdirSync(journal).sort() : [];
  audits.push(() => {
    for (const file of [keyFile, ...["", "-wal", "-shm"].map(s => path.join(data, "test.sqlite3") + s),
      ...files().map(n => path.join(journal, n))]) if (existsSync(file)) {
      const bytes = readFileSync(file); expect([...sensitive].some(s => bytes.includes(Buffer.from(s)))).toBe(false);
    }
  });
  return { config, db, snapshot, before, history, keyDirectory, keyFile, journal, empty, files };
}
function interaction(values = passwords(), confirm: DesktopOwnerAdapter["confirm"] = async r =>
  r.action === "FIRST_ENROLLMENT" ? "CONFIRM_FIRST_ENROLLMENT" : "CONFIRM_MATCHING_COMMITTED_ENROLLMENT") {
  const read = vi.fn(async () => values), confirmation = vi.fn(confirm);
  return { handle: bindTrustedDesktopOwnerInteraction({ confirm: confirmation, readPasswords: read }), read, confirmation, values };
}
async function prepared() { const f = fixture(); await createProtectedLocalKeys(f.config, tls); return f; }
function entry(f: ReturnType<typeof fixture>, i = interaction()) { return { i, api: createTrustedOwnerEnrollmentEntry(f.config, i.handle) }; }
async function denied(operation: Promise<unknown>) {
  let caught: unknown; try { await operation; } catch (e) { caught = e; }
  expect(caught instanceof BootstrapRejected).toBe(true);
  const e = caught as Error;
  expect({ name: e.name, message: e.message, cause: e.cause }).toEqual({ name: "BootstrapRejected", message: "Protected setup unavailable.", cause: undefined });
  expect(contains(stable({ message: e.message, stack: e.stack }))).toBe(false);
}
async function status(f: ReturnType<typeof fixture>) { return (await inspectOwnerEnrollment(f.config)).status; }

beforeAll(async () => {
  mkdirSync(certDirectory); mkdirSync(baseDirectory);
  const passphrase = fake(48);
  const openssl = (...args: string[]) => {
    const p = execute("C:\\Program Files\\Git\\usr\\bin\\openssl.exe", args, { cwd: certDirectory, windowsHide: true });
    p.child.stdin!.end(passphrase); return p;
  };
  await openssl("req", "-x509", "-newkey", "rsa:2048", "-passout", "stdin", "-days", "1", "-subj", "/CN=POS-ENROLLMENT-TEST-CA", "-addext", "basicConstraints=critical,CA:TRUE", "-keyout", "ca.key", "-out", "ca.pem");
  await openssl("req", "-newkey", "rsa:2048", "-passout", "stdin", "-subj", "/CN=localhost", "-keyout", "leaf.key", "-out", "leaf.csr");
  writeFileSync(path.join(certDirectory, "leaf.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n");
  await openssl("x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-passin", "stdin", "-CAcreateserial", "-days", "1", "-sha256", "-extfile", "leaf.ext", "-out", "leaf.pem");
  tls = { key: Buffer.from(createPrivateKey({ key: readFileSync(path.join(certDirectory, "leaf.key")), passphrase }).export({ type: "pkcs8", format: "pem" })),
    certificate: readFileSync(path.join(certDirectory, "leaf.pem")), trustAnchor: readFileSync(path.join(certDirectory, "ca.pem")) };
  sensitive.add(tls.key.toString());
  const db = openDatabase({ directory: baseDirectory, filename: "test.sqlite3", mode: "test", create: true });
  applyMigrations(db, migrationsDirectory); db.close();
});
afterEach(() => {
  probe.beforeRecord = probe.afterRecord = probe.pendingRecord = ""; probe.sqlFailure = probe.lostCommitAck = probe.commitFault = false;
  probe.beforeWrite = undefined; probe.commitFaults = 0;
  vi.restoreAllMocks();
  for (const db of readers.splice(0)) db.close();
  for (const audit of audits.splice(0)) audit();
});

describe("Part3S actual owner enrollment and protected journal", () => {
  it("creates exactly two bound accounts with real native crypto, SQL COMMIT and durable DPAPI anchor", async () => {
    const f = await prepared(), { i, api } = entry(f);
    const result = await api.enroll();
    expect(result).toEqual({ enrollmentAccepted: true, productionActivation: false });
    expect(i.confirmation.mock.calls[0][0].action).toBe("FIRST_ENROLLMENT"); expect(i.read).toHaveBeenCalledTimes(1);
    expect(f.db.all("SELECT id,role FROM auth_users ORDER BY id")).toEqual([{ id: "ADMIN", role: "ADMIN" }, { id: "SALESPERSON", role: "SALESPERSON" }]);
    for (const role of ["ADMIN", "SALESPERSON"] as const) {
      const row = f.db.get("SELECT password FROM auth_credentials WHERE id=?", [role]);
      expect(await passwordCallbacks.verify({ hash: String(row?.password), password: i.values[role] })).toBe(true);
    }
    expect(f.db.get("SELECT count(*) AS n FROM auth_enrollment_binding")?.n).toBe(BigInt(1));
    expect(f.db.get("SELECT count(*) AS n FROM auth_provisioning")?.n).toBe(BigInt(1));
    expect(f.db.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n).toBe(BigInt(0));
    expect(f.files()).toEqual(["00000001.committed.dpapi", "00000001.intent.dpapi", "enrolled.dpapi"]);
    for (const file of f.files()) expect(readFileSync(path.join(f.journal, file)).subarray(0, 8).toString()).toBe("POSENR01");
    expect(stable(f.db.all("SELECT * FROM schema_migrations ORDER BY version")) === f.history).toBe(true);
    expect(await status(f)).toBe("ENROLLED"); expect(contains(stable(result))).toBe(false);
  });
});

describe("Part3S authorization, policy and one-time account writer", () => {
 it("rejects forged interaction handles and never enrolls through ordinary import", async () => {
  const f = fixture();
  expect(() => createTrustedOwnerEnrollmentEntry(f.config, {} as TrustedDesktopOwnerInteraction)).toThrow(BootstrapRejected);
  expect(() => createTrustedOwnerEnrollmentEntry({ ...f.config, database: { ...f.config.database, create: true } }, interaction().handle)).toThrow(BootstrapRejected);
  expect(() => bindTrustedDesktopOwnerInteraction({ confirm: true } as unknown as DesktopOwnerAdapter)).toThrow(BootstrapRejected);
  const provision = await import("../../src/server/auth/provision"), read = vi.fn(async () => passwords());
  await expect(provision.runTrustedFirstRunSetup({ ...f.config, database: { ...f.config.database, mode: "persistent" } }, read)).rejects.toBeInstanceOf(provision.ProvisioningRejected);
  expect(read).not.toHaveBeenCalled();
  await import("../../src/server/bootstrap/owner-enrollment"); expect(f.snapshot() === f.before).toBe(true);
  expect(existsSync(f.keyDirectory)).toBe(false);
 });
 it("requires deliberate purpose-specific confirmation before an intent or password read", async () => {
  const f = await prepared(), i = interaction(passwords(), async () => "CANCELLED"), { api } = entry(f, i);
  await denied(api.enroll()); expect(i.read).not.toHaveBeenCalled(); expect(f.files()).toEqual([]); f.empty();
  const wrong = interaction(passwords(), async () => "CONFIRM_MATCHING_COMMITTED_ENROLLMENT");
  await denied(entry(f, wrong).api.enroll()); expect(wrong.read).not.toHaveBeenCalled(); expect(f.files()).toEqual([]);
 });
 it.each(["short", "weak", "same", "malformed", "long"] as const)("rejects %s credentials atomically and records a verified pre-write outcome", async kind => {
  const f = await prepared(), values = passwords();
  if (kind === "short") values.ADMIN = fake().slice(0, 7);
  if (kind === "weak") values.ADMIN = String.fromCharCode(49,50,51,52,53,54,55,56);
  if (kind === "same") values.SALESPERSON = values.ADMIN;
  if (kind === "malformed") values.ADMIN = fake() + String.fromCharCode(0xd800);
  if (kind === "long") values.SALESPERSON = fake() + "x".repeat(129);
  sensitive.add(values.ADMIN); sensitive.add(values.SALESPERSON);
  const { api, i } = entry(f, interaction(values)); await denied(api.enroll()); f.empty();
  expect(i.read).toHaveBeenCalledTimes(1); expect(await status(f)).toBe("RETRY_REQUIRES_OWNER");
  expect(f.files()).toEqual(["00000001.aborted.dpapi", "00000001.intent.dpapi"]);
 });
 it("accepts exact eight-scalar Unicode credentials without normalization or silent defaults", async () => {
  const f = await prepared(), values = { ADMIN: fake(6).slice(0, 7) + "\u00e9", SALESPERSON: fake(6).slice(0, 7) + "\u00f1" };
  sensitive.add(values.ADMIN); sensitive.add(values.SALESPERSON);
  await entry(f, interaction(values)).api.enroll();
  const hash = String(f.db.get("SELECT password FROM auth_credentials WHERE id='ADMIN'")?.password);
  expect(await passwordCallbacks.verify({ hash, password: values.ADMIN })).toBe(true);
  expect(await passwordCallbacks.verify({ hash, password: values.ADMIN.normalize("NFD") })).toBe(false);
  expect(await status(f)).toBe("ENROLLED");
 });
 it("rejects repeated and concurrent enrollment without another confirmation or account write", async () => {
  const f = await prepared(); let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
  const i = interaction(passwords(), async () => { entered(); await gate; return "CONFIRM_FIRST_ENROLLMENT"; }), { api } = entry(f, i);
  const first = api.enroll(); await ready;
  try { await denied(api.enroll()); expect(i.confirmation).toHaveBeenCalledTimes(1); } finally { release(); }
  await first; const before = f.snapshot();
  await denied(api.enroll()); await denied(api.reconcile()); expect(f.snapshot() === before).toBe(true);
  expect(i.confirmation).toHaveBeenCalledTimes(1); expect(i.read).toHaveBeenCalledTimes(1);
 });
 it("rolls back a real partial-write failure and requires fresh confirmation for a linked retry", async () => {
  const f = await prepared(), { api, i } = entry(f); probe.sqlFailure = true;
  await denied(api.enroll()); f.empty(); expect(await status(f)).toBe("RETRY_REQUIRES_OWNER");
  await api.enroll(); expect(i.confirmation).toHaveBeenCalledTimes(2); expect(i.read).toHaveBeenCalledTimes(2);
  expect(f.files()).toEqual(["00000001.aborted.dpapi", "00000001.intent.dpapi", "00000002.committed.dpapi", "00000002.intent.dpapi", "enrolled.dpapi"]);
  expect(f.db.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(BigInt(2));
 });
 it("cancels before account writes and never treats an abort signal as authorization", async () => {
  const f = await prepared(), controller = new AbortController(), i = interaction();
  controller.abort(); await denied(entry(f, i).api.enroll(controller.signal));
  expect(i.confirmation).not.toHaveBeenCalled(); expect(f.files()).toEqual([]); f.empty();
  const after = new AbortController(), handle = bindTrustedDesktopOwnerInteraction({
   async confirm() { return "CONFIRM_FIRST_ENROLLMENT"; },
   async readPasswords() { after.abort(); return passwords(); },
  });
  await denied(createTrustedOwnerEnrollmentEntry(f.config, handle).enroll(after.signal));
  f.empty(); expect(await status(f)).toBe("RETRY_REQUIRES_OWNER");
 });
});

describe("Part3S real durable-write and SQL failure boundaries", () => {
 it.each(["before", "pending", "after"] as const)("fails closed on %s intent publication, before calling the account writer", async kind => {
  const f = await prepared(), { api, i } = entry(f);
  if (kind === "before") probe.beforeRecord = "00000001.intent.dpapi";
  if (kind === "pending") probe.pendingRecord = "00000001.intent.dpapi";
  if (kind === "after") probe.afterRecord = "00000001.intent.dpapi";
  await denied(api.enroll()); f.empty(); expect(i.read).not.toHaveBeenCalled();
  probe.beforeRecord = probe.pendingRecord = probe.afterRecord = "";
  expect(await status(f)).toBe("RECOVERY_REVIEW_REQUIRED"); await denied(api.enroll()); await denied(api.reconcile());
  expect(i.confirmation).toHaveBeenCalledTimes(1);
 });
 it("halts on a real deferred-FK COMMIT failure, even when SQLite rolls back to pristine", async () => {
  const f = await prepared(), { api } = entry(f);
  interface Statement { get(): { n: number }; run(): unknown }
  interface Native { inTransaction: boolean; prepare(sql: string): Statement; pragma(sql: string): unknown }
  const Native = createRequire(import.meta.url)("better-sqlite3") as { prototype: Native };
  const prepare = Native.prototype.prepare;
  vi.spyOn(Native.prototype, "prepare").mockImplementation(function(this: Native, sql: string) {
   if (probe.commitFault && /^commit$/i.test(sql.trim()) && this.inTransaction &&
       prepare.call(this, "SELECT count(*) AS n FROM auth_users").get().n === 2) {
    probe.commitFault = false; probe.commitFaults++;
    this.pragma("defer_foreign_keys=ON");
    prepare.call(this, "UPDATE auth_credentials SET id='TEST_MISSING',userId='TEST_MISSING',accountId='TEST_MISSING' WHERE id='ADMIN'").run();
   }
   return prepare.call(this, sql); // The REAL COMMIT statement fails its native FK check.
  });
  probe.commitFault = true; await denied(api.enroll()); expect(probe.commitFaults).toBe(1);
  f.empty(); expect(f.files()).toEqual(["00000001.intent.dpapi"]);
  expect(await status(f)).toBe("RECOVERY_REVIEW_REQUIRED"); await denied(api.reconcile()); await denied(api.enroll());
 });
 it.each(["lost-commit-ack", "before-commit-record"] as const)("preserves accounts but refuses to infer an unrecorded COMMIT: %s", async kind => {
  const f = await prepared(), { api } = entry(f);
  if (kind === "lost-commit-ack") probe.lostCommitAck = true; else probe.beforeRecord = "00000001.committed.dpapi";
  await denied(api.enroll()); probe.lostCommitAck = false; probe.beforeRecord = "";
  const before = f.snapshot(); expect(f.db.get("SELECT count(*) AS n FROM auth_users")?.n).toBe(BigInt(2));
  expect(f.files()).toEqual(["00000001.intent.dpapi"]); expect(await status(f)).toBe("RECOVERY_REVIEW_REQUIRED");
  await denied(api.enroll()); await denied(api.reconcile()); expect(f.snapshot() === before).toBe(true);
 });
 it("reconciles only a matching confirmed COMMIT, after a new purpose-specific owner confirmation", async () => {
  const f = await prepared(), { api, i } = entry(f); probe.beforeRecord = "enrolled.dpapi";
  await denied(api.enroll()); probe.beforeRecord = ""; const before = f.snapshot();
  expect(await status(f)).toBe("RECONCILIATION_REQUIRES_OWNER"); await denied(api.enroll());
  const result = await api.reconcile();
  expect(result).toEqual({ enrollmentAccepted: true, productionActivation: false });
  expect(i.confirmation).toHaveBeenCalledTimes(2); expect(i.confirmation.mock.calls[1][0].action).toBe("RECONCILE_COMMITTED_ENROLLMENT");
  expect(i.read).toHaveBeenCalledTimes(1); expect(f.snapshot() === before).toBe(true); expect(await status(f)).toBe("ENROLLED");
 });
 it("reconciles the real protected journal in a fresh Node/DPAPI process without reading passwords", async () => {
  const f = await prepared(); probe.beforeRecord = "enrolled.dpapi"; await denied(entry(f).api.enroll()); probe.beforeRecord = "";
  const before = f.snapshot(), child = fork(path.resolve("tests/helpers/owner-enrollment-child.mjs"), [], {
   silent: true, windowsHide: true, execArgv: ["--experimental-transform-types", "--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"], env: { ...process.env, NODE_ENV: "test" },
  });
  let output = ""; child.stdout?.on("data", b => { output += b.toString(); }); child.stderr?.on("data", b => { output += b.toString(); });
  const exit = new Promise<number | null>(r => child.once("exit", r));
  const result = new Promise<Record<string, unknown>>((resolve, reject) => {
   child.once("message", m => resolve(m as Record<string, unknown>)); child.once("error", () => reject(new Error("TEST child unavailable")));
   child.once("exit", () => reject(new Error("TEST child ended")));
  });
  const timer = setTimeout(() => child.kill(), 30000);
  try {
   child.send({ config: f.config });
   const value = await result; expect(value).toEqual({ status: "reconciled", result: { enrollmentAccepted: true, productionActivation: false }, confirmations: 1, passwordReads: 0 });
   expect(await exit).toBe(0); expect(output).toBe(""); expect(f.snapshot() === before).toBe(true);
   expect(await status(f)).toBe("ENROLLED");
  } finally { clearTimeout(timer); if (child.exitCode === null) child.kill(); }
 });
 it("never finalizes a cancelled reconciliation or changed post-COMMIT authorization state", async () => {
  const f = await prepared(); probe.beforeRecord = "enrolled.dpapi"; await denied(entry(f).api.enroll()); probe.beforeRecord = "";
  const i = interaction(passwords(), async () => "CANCELLED"); await denied(entry(f, i).api.reconcile());
  expect(i.read).not.toHaveBeenCalled(); expect(f.files()).not.toContain("enrolled.dpapi");
  f.db.transaction(tx => { tx.run("UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='ADMIN'"); });
  expect(await status(f)).toBe("RECOVERY_REVIEW_REQUIRED"); await denied(entry(f).api.reconcile());
 });
 it("recognizes a final anchor even if acknowledgement was lost, without provisioning again", async () => {
  const f = await prepared(), { api } = entry(f); probe.afterRecord = "enrolled.dpapi"; await denied(api.enroll()); probe.afterRecord = "";
  const before = f.snapshot(); expect(await status(f)).toBe("ENROLLED");
  await denied(api.enroll()); await denied(api.reconcile()); expect(f.snapshot() === before).toBe(true);
 });
});

describe("Part3S restore mismatch, corruption and non-disclosure", () => {
 it("rejects an in-place pre-enrollment database rollback with the external anchor retained", async () => {
  const f = await prepared(); await entry(f).api.enroll();
  f.db.transaction(tx => {
   for (const table of ["auth_enrollment_binding", "auth_provisioning", "auth_login_attempts", "auth_principals", "auth_credentials", "auth_users"]) tx.run("DELETE FROM " + table);
  });
  const before = f.snapshot(); expect(await status(f)).toBe("RECOVERY_REVIEW_REQUIRED");
  await denied(entry(f).api.enroll()); await denied(entry(f).api.reconcile()); expect(f.snapshot() === before).toBe(true);
 });
 it("rejects a replaced SQLite file and another vault without resetting existing records", async () => {
  const f = await prepared(); await entry(f).api.enroll(); f.db.close();
  const name = path.join(f.config.database.directory, "test.sqlite3"); renameSync(name, path.join(f.config.database.directory, "preserved-enrolled.sqlite3"));
  copyFileSync(path.join(baseDirectory, "test.sqlite3"), name);
  expect(await status(f)).toBe("RECOVERY_REVIEW_REQUIRED"); await denied(entry(f).api.enroll());
  const other = await prepared(), vault = readFileSync(other.keyFile);
  copyFileSync(f.keyFile, other.keyFile); expect(await status(other)).toBe("RECOVERY_REVIEW_REQUIRED");
  await denied(entry(other).api.enroll()); other.empty(); expect(readFileSync(other.keyFile).equals(vault)).toBe(false);
 });
 it.each(["missing-vault", "corrupt-anchor", "missing-commit-record", "unrecognized-file"] as const)("halts on %s without rewriting evidence or accounts", async kind => {
  const f = await prepared(); await entry(f).api.enroll(); const before = f.snapshot();
  if (kind === "missing-vault") renameSync(f.keyFile, path.join(f.keyDirectory, "preserved-identity.dpapi"));
  if (kind === "corrupt-anchor") { const bytes = readFileSync(path.join(f.journal, "enrolled.dpapi")); bytes[bytes.length - 1] ^= 1; writeFileSync(path.join(f.journal, "enrolled.dpapi"), bytes); }
  if (kind === "missing-commit-record") renameSync(path.join(f.journal, "00000001.committed.dpapi"), path.join(f.config.directory, "preserved-committed.dpapi"));
  if (kind === "unrecognized-file") writeFileSync(path.join(f.journal, "unknown.dpapi"), "TEST");
  expect(await status(f)).toBe("RECOVERY_REVIEW_REQUIRED"); await denied(entry(f).api.enroll()); await denied(entry(f).api.reconcile());
  expect(f.snapshot() === before).toBe(true);
 });
 it("treats a missing final anchor as owner-only reconciliation, never automatic activation", async () => {
  const f = await prepared(); await entry(f).api.enroll(); const before = f.snapshot();
  renameSync(path.join(f.journal, "enrolled.dpapi"), path.join(f.config.directory, "preserved-anchor.dpapi"));
  expect(await status(f)).toBe("RECONCILIATION_REQUIRES_OWNER"); await denied(entry(f).api.enroll());
  const i = interaction(passwords(), async () => "CANCELLED"); await denied(entry(f, i).api.reconcile());
  expect(f.snapshot() === before).toBe(true); expect(f.files()).not.toContain("enrolled.dpapi");
 });
 it("preserves unknown preexisting records and changed migration history rather than adopting them", async () => {
  const f = await prepared(); f.db.transaction(tx => { tx.run("CREATE TABLE TEST_existing(id INTEGER PRIMARY KEY,value TEXT) STRICT"); tx.run("INSERT INTO TEST_existing(id,value) VALUES(?,?)", [BigInt(1), "TEST-SENTINEL"]); });
  const before = f.snapshot(), i = interaction(); await denied(entry(f, i).api.enroll());
  expect(i.read).not.toHaveBeenCalled(); expect(f.snapshot() === before).toBe(true);
  expect(f.db.get("SELECT value FROM TEST_existing")?.value).toBe("TEST-SENTINEL");
  const other = await prepared(); other.db.transaction(tx => { tx.run("UPDATE schema_migrations SET checksum=? WHERE version=?", ["0".repeat(64), BigInt(1)]); });
  await denied(entry(other).api.enroll()); other.empty();
 });
 it("returns generic errors and no credentials, signing keys or private SQL in logs/results", async () => {
  const f = await prepared(), logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")], secret = fake();
  const handle = bindTrustedDesktopOwnerInteraction({ async confirm() { return "CONFIRM_FIRST_ENROLLMENT"; }, async readPasswords() { throw new Error(secret); } });
  await denied(createTrustedOwnerEnrollmentEntry(f.config, handle).enroll());
  const state = await inspectOwnerEnrollment(f.config);
  expect(contains(stable({ state, calls: logs.map(s => s.mock.calls) }))).toBe(false); f.empty();
  expect(state.productionActivation).toBe(false);
 });
});

describe("Part3S bounded journal admission", () => {
 it("reserves durable outcome and final-anchor capacity before another provisioning attempt", () => {
  const records: EnrollmentRecord[] = [], installationId = randomUUID(), deviceId = randomUUID();
  let previousAbortDigest: string | null = null;
  for (let i = 1; i <= 63; i++) {
   const common = { format: "POS_ENROLL_V1" as const, sequence: String(i), intentId: randomUUID(), installationId, deviceId,
    vaultDigest: "0".repeat(64), databaseFingerprint: "1".repeat(64), schemaDigest: "2".repeat(64) };
   const intent = { ...common, kind: "INTENT" as const, previousAbortDigest };
   const aborted = { ...common, kind: "ABORTED" as const, intentDigest: enrollmentDigest(intent), outcome: "NO_SQL_WRITES" as const };
   records.push(intent, aborted); previousAbortDigest = enrollmentDigest(aborted);
   const status = classifyEnrollment(records, { kind: "PRISTINE", schemaDigest: common.schemaDigest }).status;
   expect(status).toBe(i === 63 ? "RECOVERY_REVIEW_REQUIRED" : "RETRY_REQUIRES_OWNER");
  }
 });
});
