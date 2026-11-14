import "server-only";
import { reviewedMigrations } from "../db/reviewed-schema";

import { existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { rejectRedirectedPath } from "../db/location";
import { enrollmentDigest, type EnrollmentSnapshot } from "./database";
import type { inspectLocalVault } from "./keys";
import { rejectBootstrap, windowsProtection } from "./windows";

export type VaultInspection = Awaited<ReturnType<typeof inspectLocalVault>>;
interface Common {
  format: "POS_ENROLL_V1" | "POS_ENROLL_SCHEMA41_V2"; kind: "INTENT" | "ABORTED" | "COMMITTED" | "ENROLLED";
  sequence: string; intentId: string; installationId: string; deviceId: string;
  vaultDigest: string; databaseFingerprint: string; schemaDigest: string;
}
export type IntentRecord = Common & { kind: "INTENT"; previousAbortDigest: string | null };
export type AbortedRecord = Common & { kind: "ABORTED"; intentDigest: string; outcome: "NO_SQL_WRITES" | "ROLLBACK_CONFIRMED" };
export type CommittedRecord = Common & { kind: "COMMITTED"; intentDigest: string; bindingFingerprint: string; initialFingerprint: string };
export type AnchorRecord = Common & { kind: "ENROLLED"; intentDigest: string; committedDigest: string; bindingFingerprint: string };
export type EnrollmentRecord = IntentRecord | AbortedRecord | CommittedRecord | AnchorRecord;
const commonKeys = ["format", "kind", "sequence", "intentId", "installationId", "deviceId", "vaultDigest", "databaseFingerprint", "schemaDigest"];
const hex = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
export function recordName(record: EnrollmentRecord) {
  return record.kind === "ENROLLED" ? "enrolled.dpapi" : record.sequence.padStart(8, "0") + "." + record.kind.toLowerCase() + ".dpapi";
}
function formatFor(schemaDigest: string): Common["format"] {
  const current = enrollmentDigest(reviewedMigrations().map(m => [m.version, m.name, m.checksum]));
  return schemaDigest === current ? "POS_ENROLL_SCHEMA41_V2" : "POS_ENROLL_V1";
}
function parse(value: unknown, vault: VaultInspection, schemaDigest: string): EnrollmentRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return rejectBootstrap();
  const v = value as Record<string, unknown>, extras = v.kind === "INTENT" ? ["previousAbortDigest"] :
    v.kind === "ABORTED" ? ["intentDigest", "outcome"] : v.kind === "COMMITTED" ? ["intentDigest", "bindingFingerprint", "initialFingerprint"] :
    v.kind === "ENROLLED" ? ["intentDigest", "committedDigest", "bindingFingerprint"] : undefined;
  if (!extras || Object.keys(v).sort().join(",") !== [...commonKeys, ...extras].sort().join(",") ||
      v.format !== formatFor(schemaDigest) || typeof v.sequence !== "string" || !/^[1-9][0-9]{0,7}$/.test(v.sequence) ||
      !uuid(v.intentId) || v.installationId !== vault.metadata.installationId || v.deviceId !== vault.metadata.deviceId ||
      v.vaultDigest !== vault.vaultDigest || v.databaseFingerprint !== vault.databaseFingerprint || v.schemaDigest !== schemaDigest ||
      (v.kind === "INTENT" ? v.previousAbortDigest !== null && !hex(v.previousAbortDigest) : !hex(v.intentDigest)) ||
      (v.kind === "ABORTED" && !["NO_SQL_WRITES", "ROLLBACK_CONFIRMED"].includes(String(v.outcome))) ||
      (v.kind === "COMMITTED" && (!hex(v.bindingFingerprint) || !hex(v.initialFingerprint))) ||
      (v.kind === "ENROLLED" && (!hex(v.bindingFingerprint) || !hex(v.committedDigest)))) return rejectBootstrap();
  return v as unknown as EnrollmentRecord;
}
export function recordCommon(vault: VaultInspection, schemaDigest: string, sequence: string, intentId: string): Omit<Common, "kind"> {
  return { format: formatFor(schemaDigest), sequence, intentId, installationId: vault.metadata.installationId,
    deviceId: vault.metadata.deviceId, vaultDigest: vault.vaultDigest, databaseFingerprint: vault.databaseFingerprint, schemaDigest };
}
function verifyFile(directory: string, name: string) {
  if (!/^(?:[0-9]{8}\.(?:intent|aborted|committed)|enrolled)\.dpapi$/.test(name)) return rejectBootstrap();
  const stat = lstatSync(path.join(directory, name), { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== BigInt(1) || stat.size < BigInt(9) || stat.size > BigInt(16384)) return rejectBootstrap();
  return stat;
}
export async function readEnrollmentJournal(vault: VaultInspection, schemaDigest: string): Promise<readonly EnrollmentRecord[]> {
  const directory = path.join(vault.directory, "enrollment");
  if (!existsSync(directory)) return [];
  rejectRedirectedPath(directory);
  const names = readdirSync(directory).sort();
  if (names.length < 1 || names.length > 128) return rejectBootstrap();
  const before = names.map(name => verifyFile(directory, name));
  const opened = await windowsProtection({ operation: "record-list", directory });
  if (!opened || typeof opened !== "object" || !Array.isArray((opened as { records?: unknown }).records)) return rejectBootstrap();
  const records = (opened as { records: { name: string; payload: string }[] }).records;
  if (records.length !== names.length || readdirSync(directory).sort().join(",") !== names.join(",")) return rejectBootstrap();
  const byName = new Map<string, EnrollmentRecord>();
  for (const r of records) {
    if (!r || typeof r.name !== "string" || typeof r.payload !== "string" || !names.includes(r.name) || byName.has(r.name) ||
        r.payload.length > 12000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(r.payload)) return rejectBootstrap();
    const bytes = Buffer.from(r.payload, "base64");
    try {
      const value = parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), vault, schemaDigest);
      if (recordName(value) !== r.name) return rejectBootstrap();
      byName.set(r.name, value);
    } finally { bytes.fill(0); }
  }
  for (let i = 0; i < names.length; i++) {
    const after = verifyFile(directory, names[i]), b = before[i];
    if (b.ino !== after.ino || b.dev !== after.dev || b.size !== after.size || b.mtimeNs !== after.mtimeNs || b.ctimeNs !== after.ctimeNs) return rejectBootstrap();
  }
  return [...byName.values()];
}
export async function appendEnrollmentRecord(vault: VaultInspection, record: EnrollmentRecord): Promise<void> {
  parse(record, vault, record.schemaDigest);
  const directory = path.join(vault.directory, "enrollment"), initialize = !existsSync(directory);
  if (initialize) mkdirSync(directory);
  rejectRedirectedPath(directory);
  const name = recordName(record);
  if (existsSync(path.join(directory, name))) return rejectBootstrap();
  const payload = Buffer.from(JSON.stringify(record));
  try {
    if (await windowsProtection({ operation: "record-create", directory, name, initialize: String(initialize), payload: payload.toString("base64") }) !== true) return rejectBootstrap();
    const records = await readEnrollmentJournal(vault, record.schemaDigest);
    if (!records.some(r => recordName(r) === name && enrollmentDigest(r) === enrollmentDigest(record))) return rejectBootstrap();
  } finally { payload.fill(0); }
}
export type JournalState = {
  status: "UNENROLLED" | "RETRY_REQUIRES_OWNER" | "RECONCILIATION_REQUIRES_OWNER" | "ENROLLED" | "RECOVERY_REVIEW_REQUIRED";
  lastIntent?: IntentRecord; lastAbort?: AbortedRecord; committed?: CommittedRecord; anchor?: AnchorRecord;
};
export function classifyEnrollment(records: readonly EnrollmentRecord[], snapshot: EnrollmentSnapshot): JournalState {
  if (!records.length) return { status: snapshot.kind === "PRISTINE" ? "UNENROLLED" : "RECOVERY_REVIEW_REQUIRED" };
  const intents = records.filter((r): r is IntentRecord => r.kind === "INTENT").sort((a, b) => Number(a.sequence) - Number(b.sequence));
  if (!intents.length) return rejectBootstrap();
  const used = new Set<EnrollmentRecord>(), anchors = records.filter((r): r is AnchorRecord => r.kind === "ENROLLED");
  if (anchors.length > 1) return rejectBootstrap();
  let lastAbort: AbortedRecord | undefined, lastIntent: IntentRecord | undefined, committed: CommittedRecord | undefined;
  for (let i = 0; i < intents.length; i++) {
    const intent = intents[i]; used.add(intent);
    if (intent.sequence !== String(i + 1) || intent.previousAbortDigest !== (lastAbort ? enrollmentDigest(lastAbort) : null)) return rejectBootstrap();
    const linked = records.filter(r => r.kind !== "INTENT" && r.kind !== "ENROLLED" && r.sequence === intent.sequence);
    if (linked.length > 1) return rejectBootstrap();
    const next = linked[0];
    if (next) {
      used.add(next);
      if (next.intentId !== intent.intentId || ("intentDigest" in next && next.intentDigest !== enrollmentDigest(intent))) return rejectBootstrap();
    }
    if (i < intents.length - 1 && next?.kind !== "ABORTED") return rejectBootstrap();
    lastIntent = intent; lastAbort = next?.kind === "ABORTED" ? next : undefined;
    committed = next?.kind === "COMMITTED" ? next : undefined;
  }
  const anchor = anchors[0]; if (anchor) used.add(anchor);
  if (used.size !== records.length || !lastIntent) return rejectBootstrap();
  if (snapshot.kind === "PRISTINE") {
    if (anchor || committed) return { status: "RECOVERY_REVIEW_REQUIRED" };
    // Reserve intent + committed + final anchor BEFORE another account write.
    if (lastAbort && records.length + 3 > 128) return { status: "RECOVERY_REVIEW_REQUIRED" };
    return { status: lastAbort ? "RETRY_REQUIRES_OWNER" : "RECOVERY_REVIEW_REQUIRED", lastIntent, lastAbort };
  }
  if (lastAbort || !committed || snapshot.binding.intentId !== lastIntent.intentId ||
      snapshot.binding.installationId !== lastIntent.installationId || snapshot.binding.deviceId !== lastIntent.deviceId ||
      snapshot.binding.vaultDigest !== lastIntent.vaultDigest || snapshot.bindingFingerprint !== committed.bindingFingerprint) return { status: "RECOVERY_REVIEW_REQUIRED" };
  if (anchor) {
    if (anchor.sequence !== lastIntent.sequence || anchor.intentId !== lastIntent.intentId || anchor.intentDigest !== enrollmentDigest(lastIntent) ||
        anchor.committedDigest !== enrollmentDigest(committed) || anchor.bindingFingerprint !== snapshot.bindingFingerprint) return rejectBootstrap();
    return { status: "ENROLLED", lastIntent, committed, anchor };
  }
  return { status: snapshot.initial && snapshot.initialFingerprint === committed.initialFingerprint ? "RECONCILIATION_REQUIRES_OWNER" : "RECOVERY_REVIEW_REQUIRED",
    lastIntent, committed };
}
