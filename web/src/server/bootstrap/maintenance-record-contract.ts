import "server-only";

import { createHash } from "node:crypto";
import { enrollmentDigest } from "./database";
import { reviewedMigrations } from "../db/reviewed-schema";

// Candidate FORMAT validation only. No protected-record reader/writer, owner proof,
// backup verification, SQL operation or authorization capability exists here.
// Fixed-position JSON tuples avoid duplicate-property/unknown-field interpretation.
export interface MaintenanceRecordBinding {
  readonly installationId: string;
  readonly deviceId: string;
  readonly enrollmentIntentId: string;
  readonly vaultDigest: string;
  readonly databaseFingerprint: string;
  readonly anchorDigest: string;
  readonly enrollmentCommittedDigest: string;
}
export type MaintenanceCandidateStatus = "RECORDS_REQUIRED" | "INVALID_RECORDS" |
  "INTENT_REQUIRES_RECOVERY_REVIEW" | "PREREQUISITES_UNVERIFIED" | "MANIFEST_UNAVAILABLE";
export interface MaintenanceCandidateInspection {
  readonly status: MaintenanceCandidateStatus;
  readonly productionActivation: false;
  readonly upgradeAuthorized: false;
  readonly protectedStorageVerified: false;
  readonly recoveryVerified: false;
  readonly ownerAuthorized: false;
}
const result = (status: MaintenanceCandidateStatus): MaintenanceCandidateInspection => Object.freeze({
  status, productionActivation: false, upgradeAuthorized: false,
  protectedStorageVerified: false, recoveryVerified: false, ownerAuthorized: false,
});
const keys = ["installationId", "deviceId", "enrollmentIntentId", "vaultDigest", "databaseFingerprint", "anchorDigest", "enrollmentCommittedDigest"] as const;
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const hex = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
function timestamp(value: unknown): bigint {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,15}$/.test(value)) throw new Error("Invalid record.");
  const number = BigInt(value);
  if (number > BigInt("8640000000000000")) throw new Error("Invalid record.");
  return number;
}
function decode(bytes: unknown): string[] {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > 8192) throw new Error("Invalid record.");
  const v: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(v) || ![19, 23].includes(v.length) || v.some(field => typeof field !== "string") ||
      v[0] !== "POS_MAINTENANCE_V1" || (v[1] === "INTENT" ? v.length !== 19 : v[1] !== "COMPLETION" || v.length !== 23)) throw new Error("Invalid record.");
  for (const i of [2, 3, 4, 5, 13, 16]) if (!uuid(v[i])) throw new Error("Invalid record.");
  for (const i of [6, 7, 8, 9, 10, 11, 12, 14, 15, 17]) if (!hex(v[i])) throw new Error("Invalid record.");
  timestamp(v[18]);
  if (v[1] === "COMPLETION" && (!hex(v[19]) || v[20] !== "COMMIT_CONFIRMED" || !hex(v[21]) || timestamp(v[22]) < timestamp(v[18]))) throw new Error("Invalid record.");
  return v;
}

// Only one operation's ordered pair is supported. Whole-journal enumeration,
// authenticated DPAPI loading, verified recovery/owner receipts, retry/ABORTED
// chains and live coordination remain separate gates. Even a matching pair does
// NOT prove its asserted COMMIT, portable restore, owner authority or freshness.
export function inspectMaintenanceRecordCandidates(input: unknown, expected: MaintenanceRecordBinding): MaintenanceCandidateInspection {
  try {
    if (!Array.isArray(input) || input.length > 2 || !expected || typeof expected !== "object" ||
        Object.keys(expected).sort().join(",") !== [...keys].sort().join(",") ||
        !keys.every((key, i) => (i < 3 ? uuid : hex)(expected[key]))) return result("INVALID_RECORDS");
    if (!input.length) return result("RECORDS_REQUIRED");
    const records = input.map(decode);
    if (records[0][1] !== "INTENT" || (records[1] && records[1][1] !== "COMPLETION")) return result("INVALID_RECORDS");
    for (const record of records) if (keys.some((key, i) => record[i + 3] !== expected[key])) return result("INVALID_RECORDS");
    let migrations;
    try { migrations = reviewedMigrations(); } catch { return result("MANIFEST_UNAVAILABLE"); }
    const manifest = (count: number) => enrollmentDigest(migrations.slice(0, count).map(m => [m.version, m.name, m.checksum]));
    if (records.some(record => record[10] !== manifest(8) || record[11] !== manifest(18))) return result("INVALID_RECORDS");
    if (records.length === 1) return result("INTENT_REQUIRES_RECOVERY_REVIEW");
    const [intent, completion] = records;
    const digest = createHash("sha256").update(JSON.stringify(intent)).digest("hex");
    if (completion.slice(2, 19).some((field, i) => field !== intent[i + 2]) ||
        completion[19] !== digest || completion[21] !== intent[12]) return result("INVALID_RECORDS");
    return result("PREREQUISITES_UNVERIFIED");
  } catch { return result("INVALID_RECORDS"); }
}
