import "server-only";

import type { SqlTransaction } from "../db/connection";
import type { Migration } from "../db/migrate";
import { reviewedMigrations } from "../db/reviewed-schema";
import { assertSalesSchemaSnapshot } from "../db/sales-migrate";
import { rejectBootstrap } from "./windows";

type Reader = Pick<SqlTransaction, "get" | "all">;

// Validation only. Neither an enrollment grant nor production admission.
export function isReviewedSchema41Manifest(migrations: readonly Migration[]): boolean {
  if (migrations.length !== 41) return false;
  const expected = reviewedMigrations();
  return migrations.every((m, i) => m.version === expected[i].version &&
    m.name === expected[i].name && m.checksum === expected[i].checksum);
}

export function assertSchema41Bootstrap(reader: Reader, pristine: boolean): void {
  assertSalesSchemaSnapshot(reader, 41);
  if (!pristine) return;
  const tables = reader.all("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name LIMIT 129");
  if (tables.length > 128) return rejectBootstrap();
  for (const row of tables) {
    const table = row.name;
    if (typeof table !== "string" || !/^[a-z][a-z0-9_]*$/.test(table)) return rejectBootstrap();
    if (table === "schema_migrations") continue;
    if (reader.get("SELECT 1 AS present FROM " + table + " LIMIT 1")) return rejectBootstrap();
  }
}
