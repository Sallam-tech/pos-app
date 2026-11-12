import { createHash, createPrivateKey, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { sql } from "kysely";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/server/db/connection";
import { applyMigrations } from "../../src/server/db/migrate";
import { createInventoryService } from "../../src/server/inventory/service";
import { openAuthorizationGateway } from "../../src/server/auth/gateway";
import { openAsyncOwner } from "../../src/server/auth/database";
import type { AuthorizedTransaction } from "../../src/server/auth/types";
import { createProtectedLocalKeys, type LocalKeyConfiguration } from "../../src/server/bootstrap/keys";
import { bindTrustedDesktopOwnerInteraction, createTrustedOwnerEnrollmentEntry, inspectOwnerEnrollment } from "../../src/server/bootstrap/owner-enrollment";
import { inspectEnrollmentDatabase, readEnrollmentSnapshot } from "../../src/server/bootstrap/database";
import { hasActiveBootstrapLease, withBootstrapOwnership, type BootstrapLease } from "../../src/server/bootstrap/ownership";
import { preflightEnrollmentToInventory, type MigrationPreflightResult } from "../../src/server/bootstrap/migration-preflight";
import type { LocalTlsMaterial } from "../../src/server/hosting/https";
const probe = vi.hoisted(() => ({ afterRecordRead: undefined as undefined | (() => void), recording: false, operations: [] as string[], statements: [] as string[], failSql: false }));
vi.mock("../../src/server/bootstrap/windows", async original => {
 const actual = await original<typeof import("../../src/server/bootstrap/windows")>();
 return { ...actual, windowsProtection: async (message: Readonly<Record<string, string>>) => {
  if (probe.recording) {
   probe.operations.push(message.operation);
   if (!["open", "record-list"].includes(message.operation)) throw new Error("TEST forbidden protected write operation");
  }
  const result = await actual.windowsProtection(message); // All success is real native DPAPI/ACL I/O.
  if (message.operation === "record-list") { const hook = probe.afterRecordRead; probe.afterRecordRead = undefined; hook?.(); }
  return result;
 } };
});
// Observe/inject only the actual native boundary in TEST; never wrap or mint a
// substitute reader. Every successful operation still executes the real driver.
const Driver = createRequire(import.meta.url)("better-sqlite3") as { prototype: { prepare(text: string): unknown } };
const actualPrepare = Driver.prototype.prepare;
beforeEach(() => {
 vi.spyOn(Driver.prototype, "prepare").mockImplementation(function (this: object, text: string) {
  if (probe.recording) {
   probe.statements.push(text);
   if (probe.failSql && text === "SELECT user_version FROM pragma_user_version") return actualPrepare.call(this, "SELECT * FROM test_missing_private_table");
  }
  return actualPrepare.call(this, text);
 });
});
const root = path.resolve("test-results/sqlite-b1b-part1"); mkdirSync(root, { recursive: true });
const run = mkdtempSync(path.join(root, "preflight-b2-")), auth8 = path.join(run, "auth8"), source = path.resolve("src/server/db/migrations");
const stable = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const sensitive = new Set<string>(); const fake = () => { const value = randomBytes(24).toString("base64url"); sensitive.add(value); return value; };
let tls: LocalTlsMaterial, pristine: LocalKeyConfiguration, enrolled: LocalKeyConfiguration, noVault: LocalKeyConfiguration, full18: LocalKeyConfiguration;
let initialSnapshot = "";
const tables8 = ["auth_users", "auth_credentials", "auth_principals", "auth_session_authorizations", "auth_provisioning", "auth_enrollment_binding", "auth_login_attempts", "schema_migrations"];
function fixture(version: 8 | 18 = 8) {
 const directory = mkdtempSync(path.join(run, "case-")), data = path.join(directory, "data"); mkdirSync(data);
 const config: LocalKeyConfiguration = { directory, database: { directory: data, filename: "test.sqlite3", mode: "test", create: false, busyTimeoutMs: 75 }, migrationsDirectory: version === 8 ? auth8 : source };
 const db = openDatabase({ ...config.database, create: true }); try { applyMigrations(db, version === 8 ? auth8 : source); } finally { db.close(); }
 return config;
}
function protectedFiles(config: LocalKeyConfiguration) {
 const directory = path.join(config.directory, "protected-identity");
 if (!existsSync(directory)) return [];
 const files: string[] = [];
 for (const name of readdirSync(directory).sort()) {
  if (name === "enrollment") for (const file of readdirSync(path.join(directory, name)).sort()) files.push(path.join(name, file));
  else files.push(name);
 }
 return files.map(name => [name, digest(path.join(directory, name))]);
}
const journalFile = (name: string) => path.join(enrolled.directory, "protected-identity/enrollment", name);
function deniedGrants(value: MigrationPreflightResult) {
 expect(value.productionActivation).toBe(false); expect(value.upgradeAuthorized).toBe(false); expect(value.enrollmentAuthorized).toBe(false);
 const text = stable(value); expect([...sensitive].some(s => text.includes(s))).toBe(false);
 expect(text).not.toContain(run); expect(text).not.toContain("SELECT"); expect(text).not.toContain("bindingFingerprint");
}
async function inspect(config: LocalKeyConfiguration, options: {
 fault?: (owner: ReturnType<typeof openAsyncOwner>) => Promise<void>;
 signal?: AbortSignal;
 lease?: BootstrapLease;
 readerDatabase?: LocalKeyConfiguration;
 externalProtectedFault?: boolean;
} = {}) {
 let assertionFailure: unknown;
 return withBootstrapOwnership(config.database, async (retain, lease) => {
  const owner = openAsyncOwner(options.readerDatabase ?? config);
  try {
   await options.fault?.(owner);
   return await owner.db.transaction().execute(async () => {

    return owner.withBootstrapReadScope(lease, async scope => {
    const sqlBefore = owner.get("SELECT total_changes() AS n");
    const databaseFile = path.join((options.readerDatabase ?? config).database.directory, "test.sqlite3");
    const files = () => ["", "-wal"].filter(s => existsSync(databaseFile + s)).map(s => [s, digest(databaseFile + s)]);
    const beforeFiles = files(), protectedBefore = protectedFiles(config);
    const names = config === full18 ? [...tables8, "products", "stock_balances", "inventory_operations", "stock_movements", "product_events", "product_identifiers"] : tables8;
    const snapshot = () => stable(names.map(t => owner.all("SELECT * FROM main." + t + " ORDER BY rowid")));
    const beforeRows = snapshot();
    try {
     probe.operations = []; probe.statements = []; probe.recording = true;
     const result = await preflightEnrollmentToInventory(config, options.lease ?? lease, scope);
     probe.recording = false;
     deniedGrants(result); expect(snapshot() === beforeRows).toBe(true); if (!options.externalProtectedFault) expect(protectedFiles(config)).toEqual(protectedBefore);
     expect(probe.operations.every(operation => ["open", "record-list"].includes(operation))).toBe(true);
     expect(owner.get("SELECT total_changes() AS n")).toEqual(sqlBefore); expect(files()).toEqual(beforeFiles);
     expect(probe.statements.every(s => /^SELECT /.test(s))).toBe(true); return result;
    } catch (error) { assertionFailure = error; throw error; }
    finally { probe.recording = false; }
    }, options.signal);
   });
  } finally { try { await owner.close(); } catch { retain(); owner.quarantine(); throw new Error("TEST owner close uncertain"); } }
 }).catch(error => { throw assertionFailure ?? error; });
}
async function replaceForTest(filename: string, action: () => Promise<void>, replacement?: Uint8Array) {
 const saved = path.join(run, "saved-" + randomUUID()); renameSync(filename, saved);
 try { if (replacement) writeFileSync(filename, replacement, { flag: "wx" }); await action(); }
 finally {
  if (replacement) renameSync(filename, path.join(run, "fault-" + randomUUID()));
  renameSync(saved, filename);
 }
}
beforeAll(async () => {
 mkdirSync(auth8); for (const name of readdirSync(source).filter(n => /^000[1-8]_/.test(n))) copyFileSync(path.join(source, name), path.join(auth8, name));
 const cert = path.join(run, "tls"); mkdirSync(cert); const passphrase = fake();
 const execute = promisify(execFile), openssl = (...args: string[]) => {
  const promise = execute("C:\\Program Files\\Git\\usr\\bin\\openssl.exe", args, { cwd: cert, windowsHide: true }); promise.child.stdin!.end(passphrase); return promise;
 };
 await openssl("req", "-x509", "-newkey", "rsa:2048", "-passout", "stdin", "-days", "1", "-subj", "/CN=POS-PREFLIGHT-TEST-CA", "-addext", "basicConstraints=critical,CA:TRUE", "-keyout", "ca.key", "-out", "ca.pem");
 await openssl("req", "-newkey", "rsa:2048", "-passout", "stdin", "-subj", "/CN=localhost", "-keyout", "leaf.key", "-out", "leaf.csr");
 writeFileSync(path.join(cert, "leaf.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n");
 await openssl("x509", "-req", "-in", "leaf.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-passin", "stdin", "-CAcreateserial", "-days", "1", "-sha256", "-extfile", "leaf.ext", "-out", "leaf.pem");
 tls = { key: Buffer.from(createPrivateKey({ key: readFileSync(path.join(cert, "leaf.key")), passphrase }).export({ type: "pkcs8", format: "pem" })), certificate: readFileSync(path.join(cert, "leaf.pem")), trustAnchor: readFileSync(path.join(cert, "ca.pem")) };
 sensitive.add(tls.key.toString()); pristine = fixture(); enrolled = fixture(); noVault = fixture(); full18 = fixture(18);
 await createProtectedLocalKeys(pristine, tls); await createProtectedLocalKeys(enrolled, tls);
 const passwords = { ADMIN: fake(), SALESPERSON: fake() };
 const interaction = bindTrustedDesktopOwnerInteraction({ confirm: async () => "CONFIRM_FIRST_ENROLLMENT", readPasswords: async () => passwords });
 expect(await createTrustedOwnerEnrollmentEntry(enrolled, interaction).enroll()).toEqual({ enrollmentAccepted: true, productionActivation: false });
 initialSnapshot = stable(await withBootstrapOwnership(enrolled.database, retain => inspectEnrollmentDatabase(enrolled, retain)));
 // Fresh schema18 was created from empty, NOT upgraded from8. Clone disposable
 // generic TEST auth rows only; the clone deliberately has no verified enrollment.
 const authRows = await withBootstrapOwnership(enrolled.database, async () => {
  const owner = openAsyncOwner(enrolled);
  try { return tables8.filter(t => t !== "schema_migrations").map(t => ({ table: t, rows: owner.all("SELECT * FROM " + t) })); }
  finally { await owner.close(); }
 });
 const target = openDatabase(full18.database);
 try { target.transaction(tx => { for (const { table, rows } of authRows) for (const row of rows) {
  const columns = Object.keys(row); tx.run("INSERT INTO " + table + "(" + columns.map(c => '"' + c + '"').join(",") + ") VALUES(" + columns.map(() => "?").join(",") + ")", Object.values(row));
 } }); } finally { target.close(); }
 const origins = { ADMIN: "https://localhost:9773", SALESPERSON: "https://127.0.0.1:9773" };
 const signingSecrets = { ADMIN: randomBytes(48).toString("base64url"), SALESPERSON: randomBytes(48).toString("base64url") }; Object.values(signingSecrets).forEach(v => sensitive.add(v));
 const gateway = await openAuthorizationGateway({ database: full18.database, migrationsDirectory: full18.migrationsDirectory, origins, signingSecrets, sessionLifetimeSeconds: 3600 });
 try {
  const response = await gateway.issueAdminSession(await gateway.verifyAdminPassword(passwords.ADMIN));
  const cookie = response.headers.getSetCookie().map(c => c.split(";")[0]).join("; "); sensitive.add(cookie);
  const request = new Request(origins.ADMIN + "/private-test", { headers: { origin: origins.ADMIN, cookie } }), inventory = createInventoryService(gateway);
  const created = await inventory.createProduct(request, { requestKey: randomUUID(), name: "TEST preflight sentinel", unit: "PACK", buyingPricePaisa: "1250", sellingPricePaisa: "1800", sellingActive: true, openingQuantity: "5", lowStockThreshold: "2" });
  await inventory.receiveStock(request, { requestKey: randomUUID(), productId: created.product.id, expectedProductVersion: created.product.productVersion, expectedBalanceVersion: created.product.balanceVersion, quantity: "2", unitBuyingPricePaisa: "1250", reason: "TEST receipt" });
 } finally { await gateway.close(); }
}, 120000);

describe("B2 Part4A real read-only enrollment-to-inventory preflight", () => {
 it("verifies matching schema8 DPAPI/ACL enrollment evidence without writes or a grant", async () => {
  expect(await inspect(enrolled)).toMatchObject({ status: "SCHEMA8_ENROLLMENT_VERIFIED", schema: 8 });
 });
 it("classifies exact schema8 with prepared custody but no completed enrollment", async () => {
  expect(await inspect(pristine)).toMatchObject({ status: "SCHEMA8_NOT_ENROLLED", schema: 8 });
 });
 it("classifies missing required protected custody without creating it", async () => {
  expect(await inspect(noVault)).toMatchObject({ status: "PROTECTED_RECORDS_REQUIRED", schema: 8 });
  expect(existsSync(path.join(noVault.directory, "protected-identity"))).toBe(false);
 });
 it("requires maintenance proof for populated schema18 and never makes it first-run eligible", async () => {
  const result = await inspect(full18); expect(result).toMatchObject({ status: "SCHEMA18_MAINTENANCE_PROOF_REQUIRED", schema: 18 });
 });
 it("denies a missing final anchor without reconciling it", async () => {
  await replaceForTest(journalFile("enrolled.dpapi"), async () => expect(await inspect(enrolled)).toMatchObject({ status: "PROTECTED_RECORDS_REQUIRED" }));
 });
 it("denies a corrupt anchor without repair or disclosure", async () => {
  const bytes = Buffer.from(readFileSync(journalFile("enrolled.dpapi"))); bytes.fill(0, 8);
  await replaceForTest(journalFile("enrolled.dpapi"), async () => expect(await inspect(enrolled)).toMatchObject({ status: "ENROLLMENT_EVIDENCE_INVALID" }), bytes);
 });
 it("denies missing COMMITTED evidence rather than inferring a successful maintenance/enrollment", async () => {
  await replaceForTest(journalFile("00000001.committed.dpapi"), async () => expect((await inspect(enrolled)).status).toBe("LIFECYCLE_UNKNOWN"));
 });
 it("denies a partial pending protected record", async () => {
  const pending = journalFile("00000002.intent.dpapi.pending"); writeFileSync(pending, "TEST-INCOMPLETE", { flag: "wx" });
  try { expect(await inspect(enrolled)).toMatchObject({ status: "ENROLLMENT_EVIDENCE_INVALID" }); }
  finally { renameSync(pending, path.join(run, "pending-evidence-" + randomUUID())); }
 });
 it("denies valid encrypted custody bound to a different database", async () => {
  const foreign = readFileSync(path.join(pristine.directory, "protected-identity/identity.dpapi"));
  await replaceForTest(path.join(enrolled.directory, "protected-identity/identity.dpapi"), async () => expect(await inspect(enrolled)).toMatchObject({ status: "ENROLLMENT_EVIDENCE_INVALID" }), foreign);
 });
 it("denies stale enrollment identity against an unchanged original anchor", async () => {
  // Use the existing enrolled TEST DB itself for an in-transaction mismatch then rollback.
  await withBootstrapOwnership(enrolled.database, async (retain, lease) => {
   const owner = openAsyncOwner(enrolled);
   try {
    await expect(owner.db.transaction().execute(async () => {
     owner.run("UPDATE auth_enrollment_binding SET intent_id=?", [randomUUID()]);
     const result = await owner.withBootstrapReadScope(lease, scope => preflightEnrollmentToInventory(enrolled, lease, scope));
     expect(result.status).toBe("LIFECYCLE_UNKNOWN"); deniedGrants(result); throw new Error("TEST rollback mismatch");
    })).rejects.toThrow("TEST rollback mismatch");
   } finally { try { await owner.close(); } catch { retain(); } }
  });
  expect(await inspect(enrolled)).toMatchObject({ status: "SCHEMA8_ENROLLMENT_VERIFIED" });
 });
 it("denies changed migration history without running the migrator", async () => {
  const f = fixture(); expect(await inspect(f, { fault: async owner => { owner.run("UPDATE schema_migrations SET checksum=? WHERE version=1", ["0".repeat(64)]); } })).toMatchObject({ status: "SCHEMA_INVALID" });
 });
 it("denies actual object drift and newer version markers", async () => {
  const f = fixture(); expect(await inspect(f, { fault: async owner => { await sql.raw("CREATE TABLE test_untracked(v INTEGER) STRICT").execute(owner.db); } })).toMatchObject({ status: "SCHEMA_INVALID" });
  const g = fixture(); expect(await inspect(g, { fault: async owner => { await sql.raw("PRAGMA user_version=19").execute(owner.db); } })).toMatchObject({ status: "SCHEMA_INVALID" });
 });
 it("rejects a forged lease before issuing database reads", async () => {
  const result = await inspect(enrolled, { lease: {} as BootstrapLease });
  expect(result.status).toBe("OWNERSHIP_REQUIRED"); expect(probe.statements).toHaveLength(0);
 });
 it("rejects a genuine lease paired with a different existing DB reader", async () => {
  await expect(inspect(enrolled, { readerDatabase: pristine })).rejects.toMatchObject({ name: "BootstrapRejected", message: "Protected setup unavailable." });
 });
 it("rejects an expired genuine lease and competing ownership", async () => {
  let stale: BootstrapLease | undefined;
  await withBootstrapOwnership(enrolled.database, async (_retain, lease) => { stale = lease;
   await expect(withBootstrapOwnership(enrolled.database, async () => true)).rejects.toMatchObject({ name: "BootstrapRejected" });
  });
  expect(hasActiveBootstrapLease(stale, enrolled.database)).toBe(false); expect(await inspect(enrolled, { lease: stale })).toMatchObject({ status: "OWNERSHIP_REQUIRED" });
 });
 it("fails closed on actual SQLite read errors without internal error leakage", async () => {
  probe.failSql = true;
  try { expect(await inspect(enrolled)).toMatchObject({ status: "LIFECYCLE_UNKNOWN" }); } finally { probe.failSql = false; }
 });
 it("retains the existing schema8-only provisioning/bootstrap gates at schema18", async () => {
  let retained = false; await expect(inspectEnrollmentDatabase(full18, () => { retained = true; })).rejects.toMatchObject({ name: "BootstrapRejected" });
  expect(retained).toBe(false); expect(await inspectOwnerEnrollment(full18)).toEqual({ status: "RECOVERY_REVIEW_REQUIRED", productionActivation: false });
 });
 it("preserves existing Part3S ENROLLED classification and verified fingerprints across reopen", async () => {
  expect(stable(await withBootstrapOwnership(enrolled.database, retain => inspectEnrollmentDatabase(enrolled, retain)))).toBe(initialSnapshot);
  expect(await inspectOwnerEnrollment(enrolled)).toEqual({ status: "ENROLLED", productionActivation: false });
 });
 it("never automatically enrolls on module import and rejects claimed completion flags", async () => {
  await import("../../src/server/bootstrap/migration-preflight"); expect(await inspect(pristine)).toMatchObject({ status: "SCHEMA8_NOT_ENROLLED" });
  const forged = { ...enrolled, maintenanceComplete: true } as LocalKeyConfiguration;
  expect(await inspect(forged)).toMatchObject({ status: "LIFECYCLE_UNKNOWN" });
 });
});

describe("B2 Part4A cancellation, immutable identity and incomplete state", () => {
 it("denies partial SQL enrollment without resetting accounts or writing custody", async () => {
  const f = fixture();
  expect(await inspect(f, { fault: async owner => {
   owner.run("INSERT INTO auth_users VALUES(?,?,?,?,?,?,?,?)", ["ADMIN", "ADMIN", "TEST partial", "admin@shop-pos.invalid", BigInt(0), null, "2026-11-11T00:00:00.000Z", "2026-11-11T00:00:00.000Z"]);
  } })).toMatchObject({ status: "ENROLLMENT_STATE_INVALID" });
 });
 it("rejects a live ownership lease with an expired transaction read scope", async () => {
  await withBootstrapOwnership(enrolled.database, async (retain, lease) => {
   const owner = openAsyncOwner(enrolled); let expired: Pick<AuthorizedTransaction, "get" | "all"> | undefined;
   try {
    await owner.db.transaction().execute(async () => {
     await owner.withBootstrapReadScope(lease, async scope => { expired = scope; });
    });
    const result = await preflightEnrollmentToInventory(enrolled, lease, expired!);
    expect(result.status).toBe("LIFECYCLE_UNKNOWN"); deniedGrants(result);
   } finally { try { await owner.close(); } catch { retain(); } }
  });
 });
 it("detects actual protected-file changes between native verification and return", async () => {
  const file = journalFile("enrolled.dpapi"), original = readFileSync(file);
  probe.afterRecordRead = () => { const corrupt = Buffer.from(original); corrupt[corrupt.length - 1] ^= 1; writeFileSync(file, corrupt); };
  // Existing journal file-stat guards catch this mutation before the outer checkpoint.
  try { expect((await inspect(enrolled, { externalProtectedFault: true })).status).toBe("ENROLLMENT_EVIDENCE_INVALID"); }
  finally { probe.afterRecordRead = undefined; writeFileSync(file, original); }
 });
 it("fails closed if the guarded SQL scope expires during native evidence inspection", async () => {
  const abort = new AbortController(); probe.afterRecordRead = () => { abort.abort(); };
  try {
   await expect(inspect(enrolled, { signal: abort.signal })).rejects.toMatchObject({ name: "BootstrapRejected", message: "Protected setup unavailable." });
  } finally { probe.afterRecordRead = undefined; }
 });
 it("preserves the original anchor after legitimate mutable auth-version/counter changes (rolled back TEST fixture)", async () => {
  const before = protectedFiles(enrolled);
  await withBootstrapOwnership(enrolled.database, async (retain, lease) => {
   const owner = openAsyncOwner(enrolled);
   try {
    await expect(owner.db.transaction().execute(async () => {
     owner.run("UPDATE auth_principals SET credential_version=2,auth_epoch=2");
     owner.run("UPDATE auth_login_attempts SET revision=1,last_seen_ms=1 WHERE bucket='ADMIN'");
     const result = await owner.withBootstrapReadScope(lease, scope => preflightEnrollmentToInventory(enrolled, lease, scope));
     expect(result.status).toBe("SCHEMA8_ENROLLMENT_VERIFIED"); deniedGrants(result); throw new Error("TEST rollback mutable rows");
    })).rejects.toThrow("TEST rollback mutable rows");
   } finally { try { await owner.close(); } catch { retain(); } }
  });
  expect(protectedFiles(enrolled)).toEqual(before);
 });
});

it("keeps the extracted read-only snapshot helper itself baseline8-only", async () => {
 await withBootstrapOwnership(full18.database, async (retain) => {
  const owner = openAsyncOwner(full18);
  try {
   await owner.db.transaction().execute(async () => {
    const before = owner.get("SELECT total_changes() AS n");
    await expect(readEnrollmentSnapshot(owner.scope(() => { if (!owner.inTransaction()) throw new Error("Expired"); }), "0".repeat(64))).rejects.toMatchObject({ name: "BootstrapRejected" });
    expect(owner.get("SELECT total_changes() AS n")).toEqual(before);
   });
  } finally { try { await owner.close(); } catch { retain(); } }
 });
});

it("denies real deferred FK inconsistency without writes, repair or a false verified enrollment", async () => {
 const before = protectedFiles(enrolled);
 await withBootstrapOwnership(enrolled.database, async (retain, lease) => {
  const owner = openAsyncOwner(enrolled);
  try {
   await expect(owner.db.transaction().execute(async transaction => {
    await sql.raw("PRAGMA defer_foreign_keys=ON").execute(transaction); // TEST-only, transaction-local; rolled back below.
    const now = BigInt(Date.now());
    owner.run("INSERT INTO auth_session_authorizations VALUES(?,?,?,?,?,?,?,?)", [randomUUID(), "TEST_UNBOUND", BigInt(1), BigInt(1), randomUUID(), now, now + BigInt(3600000), null]);
    const changes = owner.get("SELECT total_changes() AS n");
    const result = await owner.withBootstrapReadScope(lease, scope => preflightEnrollmentToInventory(enrolled, lease, scope));
    expect(result.status).toBe("ENROLLMENT_STATE_INVALID"); deniedGrants(result); expect(owner.get("SELECT total_changes() AS n")).toEqual(changes);
    throw new Error("TEST rollback inconsistent FK");
   })).rejects.toThrow("TEST rollback inconsistent FK");
  } finally { try { await owner.close(); } catch { retain(); } }
 });
 expect(protectedFiles(enrolled)).toEqual(before);
});
