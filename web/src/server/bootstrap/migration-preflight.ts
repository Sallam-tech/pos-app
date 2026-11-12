import "server-only";

import { createHash } from "node:crypto";
import { lstatSync, opendirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AuthorizedTransaction } from "../auth/types";
import { assertBootstrapReadScope } from "../auth/database";
import { rejectRedirectedPath, resolveDatabaseLocation } from "../db/location";
import { reviewedMigrations } from "../db/reviewed-schema";
import { validateReviewedSchema, type ReviewedSchemaVersion } from "../db/validate-schema";
import { enrollmentDigest, readEnrollmentSnapshot } from "./database";
import { classifyEnrollment, readEnrollmentJournal } from "./journal";
import { inspectLocalVault, type LocalKeyConfiguration } from "./keys";
import { hasActiveBootstrapLease, type BootstrapLease } from "./ownership";
import { BootstrapRejected } from "./windows";

export type MigrationPreflightStatus = "SCHEMA8_ENROLLMENT_VERIFIED" | "SCHEMA8_NOT_ENROLLED" |
  "SCHEMA18_MAINTENANCE_PROOF_REQUIRED" | "SCHEMA_INVALID" | "ENROLLMENT_STATE_INVALID" |
  "ENROLLMENT_EVIDENCE_INVALID" | "PROTECTED_RECORDS_REQUIRED" | "LIFECYCLE_UNKNOWN" | "OWNERSHIP_REQUIRED";
export interface MigrationPreflightResult {
  readonly status: MigrationPreflightStatus;
  readonly schema: ReviewedSchemaVersion | null;
  readonly productionActivation: false;
  readonly upgradeAuthorized: false;
  readonly enrollmentAuthorized: false;
}
type ReadScope = Pick<AuthorizedTransaction, "get" | "all">;
const result = (status: MigrationPreflightStatus, schema: ReviewedSchemaVersion | null): MigrationPreflightResult =>
  Object.freeze({ status, schema, productionActivation: false, upgradeAuthorized: false, enrollmentAuthorized: false });
class LeaseExpired {}
const missing = (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";

// Bounded, read-only consistency checkpoint, never a protected-record format or
// stored digest. Reuse actual vault/journal DPAPI+ACL inspectors for trust checks.
function boundedNames(directory: string, maximum: number) {
  const opened = opendirSync(directory), names: string[] = [];
  try {
    for (let entry = opened.readSync(); entry; entry = opened.readSync()) {
      if (names.length >= maximum) throw new Error("Protected tree budget exceeded.");
      names.push(entry.name);
    }
  } finally { opened.closeSync(); }
  return names.sort();
}
function protectedCheckpoint(directory: string): string | undefined {
  try { lstatSync(path.join(directory, "identity.dpapi")); }
  catch (error) { if (missing(error)) return undefined; throw error; }
  rejectRedirectedPath(directory);
  const names = boundedNames(directory, 2);
  if (names.length > 2 || !names.includes("identity.dpapi") || names.some(n => n !== "identity.dpapi" && n !== "enrollment")) throw new Error("Invalid protected tree.");
  const files = ["identity.dpapi"];
  if (names.includes("enrollment")) {
    rejectRedirectedPath(path.join(directory, "enrollment"));
    const records = boundedNames(path.join(directory, "enrollment"), 128);
    if (records.length > 128 || records.some(n => !/^(?:[0-9]{8}\.(?:intent|aborted|committed)|enrolled)\.dpapi$/.test(n))) throw new Error("Invalid protected tree.");
    files.push(...records.map(n => path.join("enrollment", n)));
  }
  return enrollmentDigest(files.map(name => {
    const filename = path.join(directory, name), stat = lstatSync(filename, { bigint: true });
    const maximum = name === "identity.dpapi" ? 131072 : 16384;
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== BigInt(1) || stat.size < BigInt(9) || stat.size > BigInt(maximum)) throw new Error("Invalid protected file.");
    const bytes = readFileSync(filename);
    return [name, stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, createHash("sha256").update(bytes).digest("hex")];
  }));
}

// PRIVATE diagnostic only. The trusted caller supplies its existing consistent
// native-owner-minted read scope AND genuine bootstrap lease; this opens no DB/transaction.
// No caller-provided proof/role/maintenance flag is accepted. No startup/HTTP hook.
export async function preflightEnrollmentToInventory(
  config: LocalKeyConfiguration, lease: BootstrapLease, candidate: unknown,
): Promise<MigrationPreflightResult> {
  let version: ReviewedSchemaVersion | null = null;
  const guard = () => {
    if (!hasActiveBootstrapLease(lease, config.database)) throw new LeaseExpired();
    assertBootstrapReadScope(candidate, lease, config.database);
  };
  try {
    if (!config || Object.keys(config).sort().join(",") !== "database,directory,migrationsDirectory" || config.database.create === true) return result("LIFECYCLE_UNKNOWN", null);
    guard();
    assertBootstrapReadScope(candidate, lease, config.database);
    const reader = candidate;
    const location = resolveDatabaseLocation({ ...config.database, create: false });
    // Same existing path policy; validation with create:true does NOT create files.
    resolveDatabaseLocation({ directory: config.directory, filename: "bootstrap-identity.db", mode: config.database.mode, create: true });
    const bound = async () => {
      guard();
      const actual = await reader.get("SELECT file FROM pragma_database_list WHERE name='main' LIMIT 1");
      if (typeof actual?.file !== "string" || path.resolve(actual.file).toLowerCase() !== location.filename.toLowerCase()) throw new LeaseExpired();
      guard();
    };
    const scope: ReadScope = Object.freeze({
      async get(...args: Parameters<ReadScope["get"]>) { guard(); const row = await reader.get(...args); guard(); return row; },
      async all(...args: Parameters<ReadScope["all"]>) { guard(); const rows = await reader.all(...args); guard(); return rows; },
    });
    await bound();
    const marker = (await scope.get("SELECT user_version FROM pragma_user_version"))?.user_version;
    if (marker !== BigInt(8) && marker !== BigInt(18)) return result("SCHEMA_INVALID", null);
    version = marker === BigInt(8) ? 8 : 18;
    const schema = await validateReviewedSchema(scope, version);
    if (!schema.ok) return result(["READ_FAILED", "AMBIGUOUS_SNAPSHOT", "MANIFEST_UNAVAILABLE"].includes(schema.code) ? "LIFECYCLE_UNKNOWN" : "SCHEMA_INVALID", version);
    await bound();
    // Current protected enrollment inspector is deliberately baseline8-only.
    // There is no reviewed maintenance format/verifier yet. Schema18 alone grants
    // nothing; do not reinterpret/rewrite its original anchor or inspect via v8 setup.
    if (version === 18) return result("SCHEMA18_MAINTENANCE_PROOF_REQUIRED", 18);
    // Preserve the original bootstrap wrapper's FK validation; report only existence.
    if ((await scope.all("SELECT 1 AS invalid FROM pragma_foreign_key_check LIMIT 1")).length) return result("ENROLLMENT_STATE_INVALID", 8);
    const baselineDigest = enrollmentDigest(reviewedMigrations().slice(0, 8).map(m => [m.version, m.name, m.checksum]));
    let snapshot;
    try { snapshot = await readEnrollmentSnapshot(scope, baselineDigest); }
    catch (error) { guard(); return result(error instanceof BootstrapRejected ? "ENROLLMENT_STATE_INVALID" : "LIFECYCLE_UNKNOWN", 8); }
    const directory = path.join(config.directory, "protected-identity");
    let before: string | undefined;
    try { before = protectedCheckpoint(directory); }
    catch { return result("ENROLLMENT_EVIDENCE_INVALID", 8); }
    if (!before) return result("PROTECTED_RECORDS_REQUIRED", 8);
    let state, recordCount;
    try {
      const vault = await inspectLocalVault(config);
      guard();
      const records = await readEnrollmentJournal(vault, baselineDigest);
      guard();
      state = classifyEnrollment(records, snapshot); recordCount = records.length;
      if (protectedCheckpoint(directory) !== before) return result("LIFECYCLE_UNKNOWN", 8);
    } catch (error) {
      guard(); if (error instanceof LeaseExpired) throw error;
      return result("ENROLLMENT_EVIDENCE_INVALID", 8);
    }
    // SQL unavailability after native reads is an unknown lifecycle, not proof
    // that the otherwise verified protected records are corrupt.
    await bound();
    if (state.status === "ENROLLED") return result("SCHEMA8_ENROLLMENT_VERIFIED", 8);
    if (state.status === "UNENROLLED") return result("SCHEMA8_NOT_ENROLLED", 8);
    if (snapshot.kind === "ENROLLED" && (!recordCount || state.status === "RECONCILIATION_REQUIRES_OWNER")) return result("PROTECTED_RECORDS_REQUIRED", 8);
    return result("LIFECYCLE_UNKNOWN", 8);
  } catch (error) {
    return result(error instanceof LeaseExpired ? "OWNERSHIP_REQUIRED" : "LIFECYCLE_UNKNOWN", version);
  }
}
