import "server-only";

import { existsSync, lstatSync, mkdirSync, opendirSync } from "node:fs";
import path from "node:path";
import { rejectRedirectedPath } from "../db/location";
import { reviewedMigrations } from "../db/reviewed-schema";
import { enrollmentDigest } from "./database";
import { inspectLocalVault, type LocalKeyConfiguration } from "./keys";
import { readEnrollmentJournal, type VaultInspection } from "./journal";
import { hasActiveBootstrapLease, type BootstrapLease } from "./ownership";
import { rejectBootstrap, windowsProtection } from "./windows";

interface Common {
  readonly format: "POS_SCHEMA41_MAINTENANCE_V1";
  readonly sequence: string;
  readonly operationId: string;
  readonly purpose: "SCHEMA8_TO_41" | "RESTORE41" | "RETIRE41";
  readonly installationId: string;
  readonly deviceId: string;
  readonly vaultDigest: string;
  readonly databaseFingerprint: string;
  readonly anchorSchema: "8" | "41";
  readonly anchorDigest: string;
  readonly sourceSchema: "8" | "41";
  readonly targetSchema: "41";
  readonly sourceManifestDigest: string;
  readonly targetManifestDigest: string;
  readonly backupArchiveId: string;
  readonly backupCiphertextSha256: string;
  readonly sourceStateDigest: string;
  readonly expectedTargetStateDigest: string;
  readonly destinationFingerprint: string;
  readonly createdAtMs: string;
}
export type MaintenanceIntent = Common & { readonly kind: "INTENT"; readonly previousOutcomeDigest: string | null };
export type MaintenanceOutcome = Common & {
  readonly kind: "ABORTED" | "COMMITTED";
  readonly intentDigest: string;
  readonly observedStateDigest: string;
};
export type ProtectedMaintenanceRecord = MaintenanceIntent | MaintenanceOutcome;
const commonKeys = ["format", "sequence", "operationId", "purpose", "installationId", "deviceId", "vaultDigest", "databaseFingerprint", "anchorSchema", "anchorDigest", "sourceSchema", "targetSchema", "sourceManifestDigest", "targetManifestDigest", "backupArchiveId", "backupCiphertextSha256", "sourceStateDigest", "expectedTargetStateDigest", "destinationFingerprint", "createdAtMs"];
const hex = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const filename = (r: ProtectedMaintenanceRecord) => r.sequence.padStart(8, "0") + "." + r.kind.toLowerCase() + ".dpapi";
export function protectedManifestDigest(version: 8 | 41): string {
  return enrollmentDigest(reviewedMigrations().slice(0, version).map(m => [m.version, m.name, m.checksum]));
}
function parse(value: unknown, vault: VaultInspection): ProtectedMaintenanceRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return rejectBootstrap();
  const v = value as Record<string, unknown>;
  const extras = v.kind === "INTENT" ? ["previousOutcomeDigest"] : v.kind === "ABORTED" || v.kind === "COMMITTED" ? ["intentDigest", "observedStateDigest"] : undefined;
  if (!extras || Object.keys(v).sort().join(",") !== [...commonKeys, "kind", ...extras].sort().join(",") ||
      v.format !== "POS_SCHEMA41_MAINTENANCE_V1" || typeof v.sequence !== "string" || !/^[1-9][0-9]{0,7}$/.test(v.sequence) ||
      !uuid(v.operationId) || !uuid(v.backupArchiveId) || v.installationId !== vault.metadata.installationId || v.deviceId !== vault.metadata.deviceId ||
      v.vaultDigest !== vault.vaultDigest || v.databaseFingerprint !== vault.databaseFingerprint ||
      (v.anchorSchema !== "8" && v.anchorSchema !== "41") || (v.sourceSchema !== "8" && v.sourceSchema !== "41") || v.targetSchema !== "41" ||
      !["SCHEMA8_TO_41", "RESTORE41", "RETIRE41"].includes(String(v.purpose)) ||
      (v.purpose === "SCHEMA8_TO_41" ? v.sourceSchema !== "8" : v.sourceSchema !== "41") ||
      ["anchorDigest", "backupCiphertextSha256", "sourceStateDigest", "expectedTargetStateDigest", "destinationFingerprint"].some(k => !hex(v[k])) ||
      v.sourceManifestDigest !== protectedManifestDigest(v.sourceSchema === "8" ? 8 : 41) || v.targetManifestDigest !== protectedManifestDigest(41) ||
      typeof v.createdAtMs !== "string" || !/^[1-9][0-9]{0,15}$/.test(v.createdAtMs) || BigInt(v.createdAtMs) > BigInt("8640000000000000") ||
      (v.kind === "INTENT" ? v.previousOutcomeDigest !== null && !hex(v.previousOutcomeDigest) : !hex(v.intentDigest) || !hex(v.observedStateDigest))) return rejectBootstrap();
  return Object.freeze({ ...v }) as unknown as ProtectedMaintenanceRecord;
}
function names(directory: string): string[] {
  const handle = opendirSync(directory), result: string[] = [];
  try { for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
    if (result.length >= 128 || !entry.isFile() || !/^[0-9]{8}\.(?:intent|aborted|committed)\.dpapi$/.test(entry.name)) return rejectBootstrap();
    result.push(entry.name);
  } } finally { handle.closeSync(); }
  return result.sort();
}
function stat(directory: string, name: string) {
  const result = lstatSync(path.join(directory, name), { bigint: true });
  if (!result.isFile() || result.isSymbolicLink() || result.nlink !== BigInt(1) || result.size < BigInt(9) || result.size > BigInt(16384)) return rejectBootstrap();
  return result;
}

// Protected storage facts only. This reader/classifier issues no SQL, migration,
// credential, restore, retirement or runtime-admission capability.
export async function readProtectedMaintenance(vault: VaultInspection): Promise<readonly ProtectedMaintenanceRecord[]> {
  const directory = path.join(vault.directory, "maintenance");
  if (!existsSync(directory)) return Object.freeze([]);
  rejectRedirectedPath(directory);
  const beforeNames = names(directory);
  if (!beforeNames.length) return rejectBootstrap();
  const before = beforeNames.map(name => stat(directory, name));
  const opened = await windowsProtection({ operation: "maintenance-list", directory });
  if (!opened || typeof opened !== "object" || !Array.isArray((opened as { records?: unknown }).records)) return rejectBootstrap();
  const records = (opened as { records: { name: string; payload: string }[] }).records;
  if (records.length !== beforeNames.length || names(directory).join(",") !== beforeNames.join(",")) return rejectBootstrap();
  const result = new Map<string, ProtectedMaintenanceRecord>();
  for (const row of records) {
    if (!row || typeof row.name !== "string" || !beforeNames.includes(row.name) || result.has(row.name) ||
        typeof row.payload !== "string" || row.payload.length > 12000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(row.payload)) return rejectBootstrap();
    const bytes = Buffer.from(row.payload, "base64");
    try {
      const record = parse(JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes)), vault);
      if (filename(record) !== row.name) return rejectBootstrap();
      result.set(row.name, record);
    } finally { bytes.fill(0); }
  }
  for (let i = 0; i < beforeNames.length; i++) {
    const b = before[i], a = stat(directory, beforeNames[i]);
    if (a.dev !== b.dev || a.ino !== b.ino || a.size !== b.size || a.mtimeNs !== b.mtimeNs || a.ctimeNs !== b.ctimeNs) return rejectBootstrap();
  }
  const validated = Object.freeze([...result.values()]); classifyProtectedMaintenance(validated); return validated;
}

export function classifyProtectedMaintenance(records: readonly ProtectedMaintenanceRecord[]) {
  if (records.length > 128) return rejectBootstrap();
  if (!records.length) return Object.freeze({ status: "EMPTY" as const });
  const intents = records.filter((r): r is MaintenanceIntent => r.kind === "INTENT").sort((a, b) => Number(a.sequence) - Number(b.sequence));
  const used = new Set<ProtectedMaintenanceRecord>(), ids = new Set<string>();
  let previous: MaintenanceOutcome | undefined, last: MaintenanceIntent | undefined;
  for (let i = 0; i < intents.length; i++) {
    const intent = intents[i];
    if (intent.sequence !== String(i + 1) || ids.has(intent.operationId) || intent.previousOutcomeDigest !== (previous ? enrollmentDigest(previous) : null) || previous?.purpose === "RETIRE41" && previous.kind === "COMMITTED") return rejectBootstrap();
    ids.add(intent.operationId); used.add(intent); last = intent;
    const outcomes = records.filter((r): r is MaintenanceOutcome => r.kind !== "INTENT" && r.sequence === intent.sequence);
    if (outcomes.length > 1 || (i < intents.length - 1 && outcomes.length !== 1)) return rejectBootstrap();
    previous = outcomes[0];
    if (previous) {
      const { kind: _kind, previousOutcomeDigest: _prior, ...common } = intent;
      void _kind; void _prior;
      if (commonKeys.some(k => (previous as unknown as Record<string, unknown>)[k] !== (common as unknown as Record<string, unknown>)[k]) ||
          previous.intentDigest !== enrollmentDigest(intent) || previous.observedStateDigest !== (previous.kind === "ABORTED" ? intent.sourceStateDigest : intent.expectedTargetStateDigest)) return rejectBootstrap();
      used.add(previous);
    }
  }
  if (!last || used.size !== records.length) return rejectBootstrap();
  return Object.freeze({ status: previous ? previous.kind === "COMMITTED" && previous.purpose === "RETIRE41" ? "RETIRED" as const : previous.kind : "RECOVERY_REVIEW_REQUIRED" as const, intent: last, outcome: previous });
}

// Internal durable publication primitive. The trusted controller must obtain
// deliberate owner authorization and verify the real source/backup/SQL outcome
// BEFORE asking to append. Possessing this storage record never grants writes.
export async function appendProtectedMaintenance(config: LocalKeyConfiguration, lease: BootstrapLease, record: ProtectedMaintenanceRecord): Promise<void> {
  const guard = () => { if (!hasActiveBootstrapLease(lease, config.database)) return rejectBootstrap(); };
  guard();
  const vault = await inspectLocalVault(config); guard();
  const value = parse(record, vault);
  const anchors = await readEnrollmentJournal(vault, protectedManifestDigest(value.anchorSchema === "8" ? 8 : 41)); guard();
  const anchor = anchors.find(r => r.kind === "ENROLLED");
  if (!anchor || enrollmentDigest(anchor) !== value.anchorDigest) return rejectBootstrap();
  const current = await readProtectedMaintenance(vault); guard();
  if (current.length >= 128) return rejectBootstrap();
  classifyProtectedMaintenance([...current, value]);
  const directory = path.join(vault.directory, "maintenance"), initialize = !existsSync(directory);
  if (initialize) mkdirSync(directory);
  rejectRedirectedPath(directory);
  const name = filename(value);
  if (existsSync(path.join(directory, name))) return rejectBootstrap();
  const payload = Buffer.from(JSON.stringify(value));
  try {
    guard();
    if (await windowsProtection({ operation: "maintenance-create", directory, name, initialize: String(initialize), payload: payload.toString("base64") }) !== true) return rejectBootstrap();
    guard();
    const after = await readProtectedMaintenance(vault); guard();
    if (!after.some(r => filename(r) === name && enrollmentDigest(r) === enrollmentDigest(value))) return rejectBootstrap();
  } finally { payload.fill(0); }
}
