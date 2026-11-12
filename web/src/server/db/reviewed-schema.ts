import "server-only";
import { opendirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadMigrations } from "./migrate";

// Reviewed authority: exact immutable file identities/bytes, NOT a database's claim.
// New versions require separate review of these pins and internal index metadata.
import { PINNED_SCHEMA_MIGRATIONS as PINNED } from "./schema-pins";
export const HISTORY_DEFINITION = "CREATE TABLE schema_migrations (\n  version INTEGER PRIMARY KEY CHECK(version BETWEEN 1 AND 9999),\n  name TEXT NOT NULL UNIQUE,\n  checksum TEXT NOT NULL CHECK(length(checksum) = 64 AND checksum NOT GLOB '*[^0-9a-f]*'),\n  applied_at INTEGER NOT NULL CHECK(applied_at > 0)\n) STRICT";

// PK/UNIQUE auto-index order, origin and key columns from reviewed table DDL.
// INTEGER PRIMARY KEY aliases rowid and does not allocate an auto-index.
export const AUTO_INDEXES = {
  schema_migrations: [["u", "name"]],
  auth_users: [["pk", "id"], ["u", "role"], ["u", "email"]],
  auth_credentials: [["pk", "id"], ["u", "userId"]],
  auth_principals: [["pk", "id"]],
  auth_session_authorizations: [["pk", "session_id"]],
  auth_provisioning: [["u", "admin_id"], ["u", "salesperson_id"]],
  auth_login_attempts: [["pk", "bucket"]],
  auth_enrollment_binding: [["u", "provisioning_id"], ["u", "installation_id"], ["u", "intent_id"]],
  products: [["pk", "id"], ["u", "code"], ["u", "id", "current_cost_m"]],
  inventory_operations: [["pk", "id"], ["u", "request_key"], ["u", "id", "product_id"]],
  stock_balances: [["pk", "product_id"], ["u", "opening_operation_id"]],
  product_identifiers: [["pk", "product_id"], ["u", "value"]],
  stock_movements: [["pk", "id"], ["u", "operation_id"], ["u", "product_id", "balance_version"]],
  product_events: [["pk", "operation_id"]],
  inventory_cancellations: [["pk", "request_key"]],
} as const;

// Optional SQLite ANALYZE metadata is not application/enrollment authority.
export const STATISTICS_DEFINITIONS = {
  sqlite_stat1: "CREATE TABLE sqlite_stat1(tbl,idx,stat)",
  sqlite_stat4: "CREATE TABLE sqlite_stat4(tbl,idx,neq,nlt,ndlt,sample)",
} as const;

export function reviewedMigrations() {
  const directory = fileURLToPath(new URL("./migrations/", import.meta.url));
  // Bound discovery BEFORE the existing loader materializes directory entries.
  const entries = opendirSync(directory);
  let files = 0, count = 0;
  try {
    for (let entry = entries.readSync(); entry; entry = entries.readSync()) {
      if (++count > 64) throw new Error("Manifest discovery budget exceeded.");
      if (/\.sql$/i.test(entry.name) && ++files > PINNED.length) throw new Error("Unknown manifest file.");
    }
  } finally { entries.closeSync(); }
  if (files !== PINNED.length) throw new Error("Incomplete reviewed manifest.");
  const migrations = loadMigrations(directory);
  if (migrations.length !== PINNED.length || migrations.some((m, i) =>
    m.version !== BigInt(i + 1) || m.name !== PINNED[i][0] || m.checksum !== PINNED[i][1])) {
    throw new Error("Reviewed schema manifest unavailable.");
  }
  return migrations;
}

export const EXPLICIT_INDEXES: Readonly<Record<string, { table: string; columns: readonly string[]; unique: bigint; partial: bigint }>> = {
  auth_session_principal_index: { table: "auth_session_authorizations", columns: ["principal_id", "revoked_at_ms"], unique: BigInt(0), partial: BigInt(0) },
  stock_opening_unique: { table: "stock_movements", columns: ["product_id"], unique: BigInt(1), partial: BigInt(1) },
  product_events_product: { table: "product_events", columns: ["product_id", "recorded_at_ms", "operation_id"], unique: BigInt(0), partial: BigInt(0) },
  inventory_operations_product: { table: "inventory_operations", columns: ["product_id", "recorded_at_ms", "id"], unique: BigInt(0), partial: BigInt(0) },
  products_search: { table: "products", columns: ["name_key", "id"], unique: BigInt(0), partial: BigInt(0) },
};
