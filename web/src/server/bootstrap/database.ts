import "server-only";

import { createHash } from "node:crypto";
import { openAsyncOwner } from "../auth/database";
import type { ProvisioningConfiguration } from "../auth/provision";
import { loadMigrations, type Migration } from "../db/migrate";
import { BootstrapRejected, rejectBootstrap } from "./windows";

export const enrollmentDigest = (value: unknown): string => createHash("sha256")
  .update(JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)).digest("hex");
type Owner = ReturnType<typeof openAsyncOwner>;
const tables = ["auth_users", "auth_credentials", "auth_principals", "auth_provisioning", "auth_session_authorizations", "auth_login_attempts", "auth_enrollment_binding"];
function checkSchema(owner: Owner, migrations: readonly Migration[]) {
  const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim().replace(/;$/, "");
  const objects = owner.all("SELECT name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'");
  if (objects.length !== migrations.length + 1 || objects.some(row =>
    row.name !== "schema_migrations" && !migrations.some(m => m.objectName === row.name))) return rejectBootstrap();
  for (const m of migrations) {
    const row = objects.find(r => r.name === m.objectName);
    if (typeof row?.sql !== "string" || normalize(row.sql) !== normalize(m.sql)) return rejectBootstrap();
  }
  for (const table of tables) if (owner.get("SELECT strict FROM pragma_table_list WHERE schema='main' AND name=?", [table])?.strict !== BigInt(1)) return rejectBootstrap();
  if (owner.all("SELECT * FROM pragma_foreign_key_check").length) return rejectBootstrap();
}
async function withBootstrapDatabase<T>(config: ProvisioningConfiguration, retain: () => void, work: (owner: Owner, schemaDigest: string) => Promise<T>): Promise<T> {
  const migrations = loadMigrations(config.migrationsDirectory);
  if (migrations.length !== 8 || migrations.at(-1)?.name !== "0008_auth_enrollment_binding.sql") return rejectBootstrap();
  let owner: Owner | undefined;
  try {
    owner = openAsyncOwner(config); const owned = owner;
    return await owned.db.transaction().execute(async () => {
      if (!owned.inTransaction()) return rejectBootstrap();
      owned.run("UPDATE auth_principals SET auth_epoch=auth_epoch"); // Existing writer-reservation idiom, no changed values.
      checkSchema(owned, migrations);
      const result = await work(owned, enrollmentDigest(migrations.map(m => [m.version, m.name, m.checksum])));
      if (!owned.inTransaction()) return rejectBootstrap();
      return result;
    });
  } finally {
    if (owner) try { await owner.close(); } catch { retain(); owner.quarantine(); throw new BootstrapRejected(); }
  }
}
export async function withPristineBootstrapDatabase<T>(config: ProvisioningConfiguration, retain: () => void, work: () => Promise<T>): Promise<T> {
  return withBootstrapDatabase(config, retain, async owner => {
    for (const table of tables) if (owner.get("SELECT count(*) AS n FROM " + table)?.n !== BigInt(0)) return rejectBootstrap();
    return work();
  });
}
export async function inspectEnrollmentDatabase(config: ProvisioningConfiguration, retain: () => void) {
  return withBootstrapDatabase(config, retain, async (owner, schemaDigest) => readEnrollmentSnapshot(owner.scope(() => {
    if (!owner.inTransaction()) return rejectBootstrap();
  }), schemaDigest));
}

// Private READ-ONLY row inspection, not a schema/enrollment/authorization grant.
// Caller must hold the same live owned transaction and verify exact schema first.
// Fingerprint inputs and all valid-state decisions are unchanged from Part3S;
// existence probes and sentinel LIMITs bound reads without counting session history.
export async function readEnrollmentSnapshot(reader: Pick<import("../auth/types").AuthorizedTransaction, "get" | "all">, schemaDigest: string) {
    if ((await reader.get("SELECT user_version FROM pragma_user_version"))?.user_version !== BigInt(8)) return rejectBootstrap();
    const counts: Record<string, bigint> = {};
    for (const table of tables) counts[table] = (await reader.get("SELECT 1 AS present FROM main." + table + " LIMIT 1")) ? BigInt(1) : BigInt(0);
    if (Object.values(counts).every(n => n === BigInt(0))) return Object.freeze({ kind: "PRISTINE" as const, schemaDigest });
    const roles = ["ADMIN", "SALESPERSON"], users = await reader.all("SELECT * FROM main.auth_users ORDER BY id LIMIT 3"),
      credentials = await reader.all("SELECT * FROM main.auth_credentials ORDER BY id LIMIT 3"), principals = await reader.all("SELECT * FROM main.auth_principals ORDER BY id LIMIT 3"),
      latch = await reader.all("SELECT * FROM main.auth_provisioning LIMIT 2"), bindings = await reader.all("SELECT * FROM main.auth_enrollment_binding LIMIT 2");
    if (users.length !== 2 || credentials.length !== 2 || principals.length !== 2 || latch.length !== 1 || bindings.length !== 1) return rejectBootstrap();
    const p = latch[0], b = bindings[0];
    if (p.id !== BigInt(1) || p.format_version !== BigInt(1) || p.admin_id !== "ADMIN" || p.salesperson_id !== "SALESPERSON" ||
        typeof p.completed_at_ms !== "bigint" || p.completed_at_ms <= BigInt(0) || p.completed_at_ms > BigInt("8640000000000000") ||
        b.id !== BigInt(1) || b.format_version !== BigInt(1) || b.provisioning_id !== BigInt(1)) return rejectBootstrap();
    for (let i = 0; i < roles.length; i++) {
      const role = roles[i], u = users[i], c = credentials[i], a = principals[i];
      if (u.id !== role || u.role !== role || c.id !== role || c.userId !== role || c.accountId !== role || c.providerId !== "credential" ||
          a.id !== role || typeof a.credential_version !== "bigint" || a.credential_version < BigInt(1) ||
          typeof a.auth_epoch !== "bigint" || a.auth_epoch < BigInt(1) || a.active !== BigInt(1) || a.provisioned_at_ms !== p.completed_at_ms ||
          u.createdAt !== c.createdAt || u.createdAt !== new Date(Number(p.completed_at_ms)).toISOString()) return rejectBootstrap();
    }
    const attempts = await reader.all("SELECT * FROM main.auth_login_attempts ORDER BY bucket LIMIT 4");
    if (attempts.length !== 3 || attempts.some((a, i) => a.bucket !== ["ADMIN", "GLOBAL", "SALESPERSON"][i])) return rejectBootstrap();
    const initial = counts.auth_session_authorizations === BigInt(0) &&
      principals.every(a => a.credential_version === BigInt(1) && a.auth_epoch === BigInt(1)) &&
      credentials.every(c => c.updatedAt === c.createdAt) && users.every(u => u.updatedAt === u.createdAt) &&
      attempts.every(a => a.format_version === BigInt(1) && Object.entries(a).every(([key, v]) => key === "bucket" || key === "format_version" || v === BigInt(0)));
    const immutable = { binding: b, latch: p,
      users: users.map(u => [u.id, u.role, u.email, u.createdAt]),
      credentials: credentials.map(c => [c.id, c.userId, c.accountId, c.providerId, c.createdAt]) };
    return Object.freeze({ kind: "ENROLLED" as const, schemaDigest, initial,
      binding: Object.freeze({ installationId: String(b.installation_id), deviceId: String(b.device_id), intentId: String(b.intent_id), vaultDigest: String(b.vault_digest) }),
      bindingFingerprint: enrollmentDigest(immutable), initialFingerprint: enrollmentDigest({ users, credentials, principals, latch, bindings, attempts }) });
}
export type EnrollmentSnapshot = Awaited<ReturnType<typeof readEnrollmentSnapshot>>;
