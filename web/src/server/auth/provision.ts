import "server-only";

import { hasActiveBootstrapLease, retainBootstrapLease, type BootstrapLease } from "../bootstrap/ownership";

import { timingSafeEqual } from "node:crypto";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { getCurrentAdapter, runWithTransaction } from "@better-auth/core/context";
import type { BetterAuthOptions } from "@better-auth/core";
import { openAsyncOwner } from "./database";
import { createVolatileStorage } from "./storage";
import { passwordCallbacks, passwordPolicy } from "./password";
import { assertOfflinePassword } from "./offline-password";
import { int64 } from "../db/integers";
import { loadMigrations } from "../db/migrate";
import type { AuthorizationConfiguration } from "./types";

export type ProvisioningConfiguration = Pick<AuthorizationConfiguration, "database" | "migrationsDirectory">;
// Independently chosen exact strings for BOTH roles; no PIN/default credential path.
export interface SetupPasswords { readonly ADMIN: string; readonly SALESPERSON: string }
export class ProvisioningRejected extends Error {
  constructor() { super("Account setup was rejected."); this.name = "ProvisioningRejected"; }
}

export interface EnrollmentBinding {
  readonly installationId: string; readonly deviceId: string; readonly intentId: string; readonly vaultDigest: string;
}
export interface EnrollmentProvisioningContext { readonly lease: BootstrapLease; readonly binding: EnrollmentBinding; readonly signal: AbortSignal }
const failureOutcomes = new WeakMap<object, "NO_SQL_WRITES" | "ROLLBACK_CONFIRMED">();
export function provisioningFailureOutcome(error: unknown) {
  return error && typeof error === "object" ? failureOutcomes.get(error) : undefined;
}
function validBinding(value: EnrollmentBinding) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  return !!value && Object.keys(value).sort().join(",") === "deviceId,installationId,intentId,vaultDigest" &&
    [value.installationId, value.deviceId, value.intentId].every(v => typeof v === "string" && uuid.test(v)) &&
    typeof value.vaultDigest === "string" && /^[0-9a-f]{64}$/.test(value.vaultDigest);
}

const reject = (): never => { throw new ProvisioningRejected(); };
// Deliberately the SAME process fence as gateway.ts: setup and live auth cannot
// own separate connections concurrently. SQLite also serializes external writers.
const ownerKey = Symbol.for("shop-pos.authorization.single-process-owner");
const processState = globalThis as typeof globalThis & { [key: symbol]: boolean | undefined };
const roles = ["ADMIN", "SALESPERSON"] as const;
const expectedNames = ["0001_auth_users.sql", "0002_auth_credentials.sql", "0003_auth_principals.sql",
  "0004_auth_session_authorizations.sql", "0005_auth_session_principal_index.sql", "0006_auth_provisioning.sql", "0007_auth_login_attempts.sql", "0008_auth_enrollment_binding.sql"];

// Constant-time equality of bounded exact UTF-8 values. Length is included in a
// fixed-size buffer: independently salted hashes are NEVER used to infer distinctness.
function sameCredential(left: string, right: string): boolean {
  const a = Buffer.alloc(passwordPolicy.maxUtf8Bytes + 4), b = Buffer.alloc(a.length);
  try {
    const leftBytes = a.write(left, 4, passwordPolicy.maxUtf8Bytes, "utf8");
    const rightBytes = b.write(right, 4, passwordPolicy.maxUtf8Bytes, "utf8");
    a.writeUInt32BE(leftBytes, 0); b.writeUInt32BE(rightBytes, 0);
    return timingSafeEqual(a, b);
  } finally { a.fill(0); b.fill(0); }
}

// PRIVATE trusted-server entry, never an endpoint. A future owner-authorized,
// local first-run lifecycle must explicitly call it and supply a one-shot RAM
// password reader. A function parameter is NOT proof of owner identity; that
// trusted setup ceremony/transport remains a production gate.
export async function runTrustedFirstRunSetup(
  config: ProvisioningConfiguration,
  readPasswords: () => Promise<SetupPasswords>,
  enrollment?: EnrollmentProvisioningContext,
): Promise<void> {
  const leased = !!enrollment && hasActiveBootstrapLease(enrollment.lease, config.database);
  if (typeof readPasswords !== "function" || (enrollment && (!leased || !validBinding(enrollment.binding) ||
      !(enrollment.signal instanceof AbortSignal))) || (processState[ownerKey] && !leased) ||
      (!enrollment && config.database.mode !== "test")) return reject();
  if (!leased) processState[ownerKey] = true;
  const guard = () => { if (enrollment && (!hasActiveBootstrapLease(enrollment.lease, config.database) || enrollment.signal.aborted)) reject(); };
  let pristineCheck: (() => void) | undefined, transactionAttempted = false, callbackFailed = false;
  let owner: ReturnType<typeof openAsyncOwner> | undefined;
  let admin: string | undefined, salesperson: string | undefined;
  const volatile = createVolatileStorage();
  try {
    // Maintenance must explicitly apply the reviewed migration first. No create,
    // migration, secret generation, data adoption or account reset happens here.
    const migrations = loadMigrations(config.migrationsDirectory);
    if (migrations.length !== expectedNames.length ||
        migrations.some((m, i) => m.name !== expectedNames[i])) return reject();
    owner = openAsyncOwner(config);
    const owned = owner;
    const pristine = () => {
      if (owned.get("SELECT user_version FROM pragma_user_version")?.user_version !== BigInt(8)) return reject();
      const history = owned.all("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      if (history.length !== migrations.length || history.some((row, i) =>
        row.version !== migrations[i].version || row.name !== migrations[i].name || row.checksum !== migrations[i].checksum)) return reject();
      const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim().replace(/;$/, "");
      const objects = owned.all("SELECT name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'");
      if (objects.length !== migrations.length + 1 || objects.some(object =>
        object.name !== "schema_migrations" && !migrations.some(m => m.objectName === object.name))) return reject();
      for (const migration of migrations) {
        const object = objects.find(object => object.name === migration.objectName);
        if (typeof object?.sql !== "string" || normalize(object.sql) !== normalize(migration.sql)) return reject();
      }
      for (const table of ["auth_users", "auth_credentials", "auth_principals", "auth_session_authorizations", "auth_provisioning", "auth_login_attempts", "auth_enrollment_binding"]) {
        if (owned.get("SELECT strict FROM pragma_table_list WHERE schema='main' AND name=?", [table])?.strict !== BigInt(1)) return reject();
        if (owned.get("SELECT count(*) AS n FROM " + table)?.n !== BigInt(0)) return reject();
      }
      // First-run may not adopt an unrelated/previous shop database. Unknown
      // schema objects require review; no existing rows are cleared or repaired.
      const names = owned.all("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*'").map(row => row.name);
      if (names.length !== 8 || names.some(name =>
        !["schema_migrations", "auth_users", "auth_credentials", "auth_principals", "auth_session_authorizations", "auth_provisioning", "auth_login_attempts", "auth_enrollment_binding"].includes(String(name)))) return reject();
    };
    pristineCheck = pristine;
    guard(); pristine(); // Reject completed/partial/unknown state before asking for secrets.
    const supplied: unknown = await readPasswords();
    guard();
    if (!supplied || typeof supplied !== "object" || Array.isArray(supplied) ||
        Object.keys(supplied).sort().join(",") !== "ADMIN,SALESPERSON") return reject();
    const input = supplied as SetupPasswords;
    const first: unknown = input.ADMIN, second: unknown = input.SALESPERSON;
    // One reviewed 8..128-scalar screen for BOTH roles, before equivalence/KDF work.
    assertOfflinePassword(first); assertOfflinePassword(second);
    admin = first; salesperson = second;
    if (sameCredential(admin, salesperson)) return reject();
    // Native hashing and all password work are OUTSIDE the SQLite writer lock.
    const hashes = { ADMIN: await passwordCallbacks.hash(admin), SALESPERSON: await passwordCallbacks.hash(salesperson) };
    if (!await passwordCallbacks.verify({ hash: hashes.ADMIN, password: admin }) ||
        !await passwordCallbacks.verify({ hash: hashes.SALESPERSON, password: salesperson })) return reject();
    admin = salesperson = undefined;
    const options: BetterAuthOptions = {
      database: { db: owned.db, type: "sqlite", transaction: true },
      secondaryStorage: volatile.storage,
      user: { modelName: "auth_users", additionalFields: { role: { type: "string", required: true, input: false } } },
      account: { modelName: "auth_credentials" },
      session: { storeSessionInDatabase: false, preserveSessionInDatabase: false, cookieCache: { enabled: false } },
      emailAndPassword: { enabled: false, disableSignUp: true, password: passwordCallbacks,
        minPasswordLength: passwordPolicy.minCharacters, maxPasswordLength: passwordPolicy.maxCharacters * 2 },
      telemetry: { enabled: false }, logger: { disabled: true },
    };
    // Official supported adapter only: no Better Auth handler/API/session or
    // signing key is needed to create its schema-compatible credential records.
    const adapter = kyselyAdapter(owned.db, { type: "sqlite", transaction: true })(options);
    if (typeof adapter.options?.adapterConfig.transaction !== "function") return reject();
    guard(); transactionAttempted = true;
    await runWithTransaction(adapter, async () => {
      try {
      guard(); if (!owned.inTransaction()) return reject();
      // Supported Kysely BEGIN is deferred. Reserve the writer BEFORE rechecking
      // pristine state, excluding concurrent bootstrap from check through COMMIT.
      owned.run("UPDATE auth_principals SET auth_epoch=auth_epoch");
      pristine();
      const transaction = await getCurrentAdapter(adapter);
      if (transaction === adapter) return reject(); // Never escape the real tx adapter.
      const milliseconds = Date.now();
      if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) return reject();
      const now = int64(BigInt(milliseconds)), date = new Date(milliseconds);
      for (const role of roles) {
        guard(); await transaction.create({ model: "user", forceAllowId: true, data: {
          id: role, role, name: role === "ADMIN" ? "Admin" : "Shared Salesperson",
          email: role.toLowerCase() + "@shop-pos.invalid", emailVerified: false, createdAt: date, updatedAt: date,
        } });
        await transaction.create({ model: "account", forceAllowId: true, data: {
          id: role, userId: role, accountId: role, providerId: "credential",
          password: hashes[role], createdAt: date, updatedAt: date,
        } });
        owned.run("INSERT INTO auth_principals(id,credential_version,auth_epoch,active,provisioned_at_ms) VALUES(?,?,?,?,?)",
          [role, BigInt(1), BigInt(1), BigInt(1), now]);
      }
      // Security counters initialize ONLY with trusted atomic first provisioning.
      // No startup/login path recreates missing rows or resets prior failures.
      for (const bucket of ["ADMIN", "GLOBAL", "SALESPERSON"]) {
        owned.run("INSERT INTO auth_login_attempts(bucket) VALUES(?)", [bucket]);
      }
      owned.run("INSERT INTO auth_provisioning(id,format_version,admin_id,salesperson_id,completed_at_ms) VALUES(?,?,?,?,?)",
        [BigInt(1), BigInt(1), "ADMIN", "SALESPERSON", now]);
      if (enrollment) {
        const b = enrollment.binding;
        owned.run("INSERT INTO auth_enrollment_binding(id,format_version,provisioning_id,installation_id,device_id,intent_id,vault_digest) VALUES(?,?,?,?,?,?,?)",
          [BigInt(1), BigInt(1), BigInt(1), b.installationId, b.deviceId, b.intentId, b.vaultDigest]);
      }
      const rows = owned.all(`SELECT u.id,u.role,c.id AS credential_id,c.userId,c.accountId,c.providerId,
        p.credential_version,p.auth_epoch,p.active,p.provisioned_at_ms
        FROM auth_users u JOIN auth_credentials c ON c.userId=u.id JOIN auth_principals p ON p.id=u.id ORDER BY u.id`);
      if (rows.length !== 2 || rows.some((row, i) => row.id !== roles[i] || row.role !== roles[i] ||
          row.credential_id !== roles[i] || row.userId !== roles[i] || row.accountId !== roles[i] ||
          row.providerId !== "credential" || row.credential_version !== BigInt(1) || row.auth_epoch !== BigInt(1) ||
          row.active !== BigInt(1) || row.provisioned_at_ms !== now) ||
          owned.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n !== BigInt(0) ||
          owned.get("SELECT count(*) AS n FROM auth_login_attempts")?.n !== BigInt(3) ||
          owned.all("SELECT * FROM pragma_foreign_key_check").length !== 0 || !owned.inTransaction() ||
          owned.get("SELECT count(*) AS n FROM auth_enrollment_binding")?.n !== BigInt(enrollment ? 1 : 0)) return reject();
      guard();
      } catch (error) { callbackFailed = true; throw error; }
    });
    // Only acknowledge after actual COMMIT. No password/hash/account JSON result.
  } catch {
    const error = new ProvisioningRejected();
    // Only callback failure with observed pristine state after driver rollback,
    // or a verified pre-write rejection, is retryable. A failed COMMIT is UNKNOWN.
    if (owner && !owner.inTransaction() && pristineCheck && (!transactionAttempted || callbackFailed)) {
      try { pristineCheck(); failureOutcomes.set(error, transactionAttempted ? "ROLLBACK_CONFIRMED" : "NO_SQL_WRITES"); } catch { /* Unknown: recovery review. */ }
    }
    throw error;
  } finally {
    admin = salesperson = undefined; volatile.clear();
    if (owner) {
      try { await owner.close(); }
      catch { if (enrollment) retainBootstrapLease(enrollment.lease); owner.quarantine(); /* Keep the process fenced after uncertain close. */ throw new ProvisioningRejected(); }
    }
    if (!leased) delete processState[ownerKey];
  }
}
