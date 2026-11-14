import "server-only";

import { createHash } from "node:crypto";
import { existsSync, lstatSync, opendirSync, readFileSync } from "node:fs";
import path from "node:path";
import { rejectRedirectedPath } from "../db/location";
import type { VaultInspection } from "./journal";
import { rejectBootstrap, windowsProtection } from "./windows";

// Authenticated storage facts ONLY. No reader/classifier issues SQL, login,
// enrollment, maintenance, restore, selection or runtime-admission authority.
interface Common {
  readonly format: "POS_CANDIDATE_LEDGER_V1";
  readonly sequence: string; readonly previousDigest: string | null;
  readonly operationId: string; readonly purpose: "UPGRADE8" | "RESTORE41";
  readonly installationId: string; readonly deviceId: string; readonly vaultDigest: string;
  readonly originalAnchorDigest: string; readonly rootDatabaseFingerprint: string;
  readonly sourceFileIdentity: string; readonly destinationFileIdentity: string;
  readonly sourceSchema: "8" | "41"; readonly sourceStateDigest: string;
  readonly targetSpecificationDigest: string; readonly backupArchiveId: string;
  readonly backupCiphertextSha256: string; readonly createdAtMs: string;
}
export type CandidateRecord = Common & (
  | { readonly kind: "INTENT"; readonly intentDigest: null; readonly targetStateDigest: null; readonly targetVaultDigest: null; readonly generation: null }
  | { readonly kind: "COMMITTED"; readonly intentDigest: string; readonly targetStateDigest: string; readonly targetVaultDigest: string; readonly generation: null }
  | { readonly kind: "CURRENT"; readonly intentDigest: string; readonly targetStateDigest: string; readonly targetVaultDigest: string; readonly generation: string }
  | { readonly kind: "QUARANTINED_NO_ADMISSION"; readonly intentDigest: string | null; readonly targetStateDigest: null; readonly targetVaultDigest: null; readonly generation: null }
);
export interface CandidatePendingFile { readonly name: string; readonly bytes: string; readonly sha256: string }
export interface CandidateLedgerFacts {
  readonly records: readonly CandidateRecord[]; readonly pending: readonly CandidatePendingFile[];
  readonly abandonedMutexObserved: boolean;
}
const keys = ["format", "kind", "sequence", "previousDigest", "operationId", "purpose", "installationId", "deviceId", "vaultDigest", "originalAnchorDigest", "rootDatabaseFingerprint", "sourceFileIdentity", "destinationFileIdentity", "sourceSchema", "sourceStateDigest", "targetSpecificationDigest", "backupArchiveId", "backupCiphertextSha256", "createdAtMs", "intentDigest", "targetStateDigest", "targetVaultDigest", "generation"].sort();
const uuidSource = "[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][0-9a-f]{3}-[a-f0-9]{12}";
const uuid = (v: unknown): v is string => typeof v === "string" && new RegExp("^" + uuidSource + "$").test(v);
const hex = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const decimal = (v: unknown): v is string => typeof v === "string" && /^[1-9][0-9]{0,15}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const publishedName = new RegExp("^[0-9]{6}\\." + uuidSource + "\\.(?:intent|committed|current|quarantined)\\.dpapi$");
const pendingName = new RegExp("^[0-9]{6}\\.(" + uuidSource + ")\\.(?:intent|committed|current|quarantined)\\.dpapi\\." + uuidSource + "\\.pending$");
export function candidateRecordBytes(record: CandidateRecord): Buffer {
  return Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(record).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))));
}
export const candidateRecordDigest = (record: CandidateRecord): string => createHash("sha256").update(candidateRecordBytes(record)).digest("hex");
const filename = (r: CandidateRecord) => r.sequence.padStart(6, "0") + "." + r.operationId + "." + (r.kind === "QUARANTINED_NO_ADMISSION" ? "quarantined" : r.kind.toLowerCase()) + ".dpapi";
function parse(value: unknown, vault: VaultInspection, anchor: string): CandidateRecord {
  if (!object(value) || Object.keys(value).sort().join(",") !== keys.join(",")) return rejectBootstrap();
  const v = value;
  if (v.format !== "POS_CANDIDATE_LEDGER_V1" || !decimal(v.sequence) || BigInt(v.sequence) > BigInt(64) || !uuid(v.operationId) || !uuid(v.backupArchiveId) ||
    !uuid(v.installationId) || !uuid(v.deviceId) || v.installationId !== vault.metadata.installationId || v.deviceId !== vault.metadata.deviceId || v.vaultDigest !== vault.vaultDigest ||
    !hex(anchor) || v.originalAnchorDigest !== anchor || v.rootDatabaseFingerprint !== vault.databaseFingerprint ||
    !decimal(v.createdAtMs) || BigInt(v.createdAtMs) > BigInt("8640000000000000") ||
    ["vaultDigest", "originalAnchorDigest", "rootDatabaseFingerprint", "sourceFileIdentity", "destinationFileIdentity", "sourceStateDigest", "targetSpecificationDigest", "backupCiphertextSha256"].some(k => !hex(v[k])) ||
    (v.previousDigest !== null && !hex(v.previousDigest)) || v.sourceFileIdentity === v.destinationFileIdentity ||
    !((v.purpose === "UPGRADE8" && v.sourceSchema === "8") || (v.purpose === "RESTORE41" && v.sourceSchema === "41"))) return rejectBootstrap();
  if (v.kind === "INTENT") {
    if (v.intentDigest !== null || v.targetStateDigest !== null || v.targetVaultDigest !== null || v.generation !== null) return rejectBootstrap();
  } else if (v.kind === "QUARANTINED_NO_ADMISSION") {
    if ((v.intentDigest !== null && !hex(v.intentDigest)) || v.targetStateDigest !== null || v.targetVaultDigest !== null || v.generation !== null) return rejectBootstrap();
  } else if (v.kind === "COMMITTED" || v.kind === "CURRENT") {
    if (!hex(v.intentDigest) || !hex(v.targetStateDigest) || !hex(v.targetVaultDigest) ||
      (v.kind === "CURRENT" ? !decimal(v.generation) || BigInt(v.generation) > BigInt(64) : v.generation !== null)) return rejectBootstrap();
  } else return rejectBootstrap();
  return Object.freeze({ ...v }) as unknown as CandidateRecord;
}
type Operation = { status: CandidateRecord["kind"]; intent?: CandidateRecord; committed?: CandidateRecord };
const variableKeys = new Set(["kind", "sequence", "previousDigest", "createdAtMs", "intentDigest", "targetStateDigest", "targetVaultDigest", "generation"]);
function sameOperation(record: CandidateRecord, intent: CandidateRecord) {
  for (const key of keys) if (!variableKeys.has(key) && record[key as keyof CandidateRecord] !== intent[key as keyof CandidateRecord]) return rejectBootstrap();
}
export function classifyCandidateLedger(facts: CandidateLedgerFacts) {
  if (!facts || !Array.isArray(facts.records) || !Array.isArray(facts.pending) || facts.records.length > 64 || facts.records.length + facts.pending.length > 96) return rejectBootstrap();
  const operations = new Map<string, Operation>(); let current: Extract<CandidateRecord, { kind: "CURRENT" }> | undefined;
  let previous: CandidateRecord | undefined;
  for (const r of facts.records) {
    if (r.sequence !== String((previous ? Number(previous.sequence) : 0) + 1) || r.previousDigest !== (previous ? candidateRecordDigest(previous) : null) || (previous && BigInt(r.createdAtMs) < BigInt(previous.createdAtMs))) return rejectBootstrap();
    const state = operations.get(r.operationId);
    if (r.kind === "INTENT") {
      if (state || [...operations.values()].some(s => s.status === "INTENT" || s.status === "COMMITTED") || r.sourceFileIdentity !== (current?.destinationFileIdentity ?? r.rootDatabaseFingerprint) || (current && r.sourceSchema !== "41")) return rejectBootstrap();
      operations.set(r.operationId, { status: r.kind, intent: r });
    } else if (r.kind === "QUARANTINED_NO_ADMISSION") {
      if (state) { if (state.status !== "INTENT" || !state.intent || r.intentDigest !== candidateRecordDigest(state.intent)) return rejectBootstrap(); sameOperation(r, state.intent); }
      else if (r.intentDigest !== null) return rejectBootstrap();
      operations.set(r.operationId, { status: r.kind });
    } else {
      if (!state?.intent || r.intentDigest !== candidateRecordDigest(state.intent)) return rejectBootstrap(); sameOperation(r, state.intent);
      if (r.kind === "COMMITTED") {
        if (state.status !== "INTENT") return rejectBootstrap(); state.status = r.kind; state.committed = r;
      } else {
        if (state.status !== "COMMITTED" || !state.committed || r.targetStateDigest !== state.committed.targetStateDigest || r.targetVaultDigest !== state.committed.targetVaultDigest || r.generation !== String(current ? Number(current.generation) + 1 : 1)) return rejectBootstrap();
        state.status = r.kind; current = r;
      }
    }
    previous = r;
  }
  let unresolvedPending = false;
  for (const p of facts.pending) {
    const found = pendingName.exec(p.name); if (!found || !hex(p.sha256) || !/^(?:0|[1-9][0-9]{0,4})$/.test(p.bytes) || BigInt(p.bytes) > BigInt(16384)) return rejectBootstrap();
    const state = operations.get(found[1]); if (!state || (state.status !== "QUARANTINED_NO_ADMISSION" && state.status !== "CURRENT")) unresolvedPending = true;
  }
  const unresolved = unresolvedPending || [...operations.values()].some(s => s.status === "INTENT" || s.status === "COMMITTED");
  return Object.freeze({ status: unresolved ? "RECOVERY_REVIEW_REQUIRED" as const : current ? "RECORDED_CURRENT" as const : facts.records.length ? "QUARANTINED_ONLY" as const : facts.pending.length ? "RECOVERY_REVIEW_REQUIRED" as const : "ABSENT" as const,
    recordedCurrent: current ?? null, quarantinedOperations: Object.freeze([...operations].filter(([, s]) => s.status === "QUARANTINED_NO_ADMISSION").map(([id]) => id)) });
}
// Retain every orphan. Native terminal CURRENT/quarantine fences its helper;
// an authenticated COMMITTED may be deliberately finalized for that same op.
// Unbound or INTENT-only pending files never permit ordinary admission.
export function candidatePendingCompatible(facts: CandidateLedgerFacts, completingOperation?: string): boolean {
  classifyCandidateLedger(facts);
  return facts.pending.every(p => { const match = pendingName.exec(p.name); if (!match) return false;
    const last = facts.records.filter(r => r.operationId === match[1]).at(-1);
    return last?.kind === "QUARANTINED_NO_ADMISSION" || last?.kind === "CURRENT" || (last?.kind === "COMMITTED" && last.operationId === completingOperation);
  });
}
function entries(directory: string): string[] {
  const handle = opendirSync(directory), names: string[] = [];
  try { for (let item = handle.readSync(); item; item = handle.readSync()) { if (names.length >= 96 || !item.isFile() || (!publishedName.test(item.name) && !pendingName.test(item.name))) return rejectBootstrap(); names.push(item.name); } } finally { handle.closeSync(); }
  return names.sort();
}
function checkpoint(directory: string, name: string) {
  const file = path.join(directory, name), s = lstatSync(file, { bigint: true });
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== BigInt(1) || s.size > BigInt(16384) || (!pendingName.test(name) && s.size < BigInt(9))) return rejectBootstrap();
  const bytes = readFileSync(file); if (BigInt(bytes.length) !== s.size) return rejectBootstrap();
  return Object.freeze({ stat: [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].map(String).join(":"), sha256: createHash("sha256").update(bytes).digest("hex"), bytes: String(s.size) });
}
export function candidateLedgerContext(vault: VaultInspection, originalAnchorDigest: string): Readonly<Record<string, string>> {
  if (!hex(originalAnchorDigest)) return rejectBootstrap();
  return Object.freeze({ directory: path.join(vault.directory, "candidate-authority"), installationId: vault.metadata.installationId, deviceId: vault.metadata.deviceId,
    vaultDigest: vault.vaultDigest, originalAnchorDigest, rootDatabaseFingerprint: vault.databaseFingerprint });
}
export async function readProtectedCandidateLedger(vault: VaultInspection, originalAnchorDigest: string): Promise<CandidateLedgerFacts> {
  const context = candidateLedgerContext(vault, originalAnchorDigest), directory = context.directory;
  if (!existsSync(directory)) return Object.freeze({ records: Object.freeze([]), pending: Object.freeze([]), abandonedMutexObserved: false });
  rejectRedirectedPath(directory);
  const rootBefore = lstatSync(directory, { bigint: true });
  if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink()) return rejectBootstrap();
  const names = entries(directory), before = new Map(names.map(n => [n, checkpoint(directory, n)]));
  const opened = await windowsProtection({ ...context, operation: "candidate-list" });
  if (!object(opened) || Object.keys(opened).sort().join(",") !== "abandoned,pending,records,sid" || !Array.isArray(opened.records) || !Array.isArray(opened.pending) || typeof opened.abandoned !== "boolean" || typeof opened.sid !== "string" || !/^S-1-5-[0-9-]+$/.test(opened.sid) || opened.sid === "S-1-5-18" || opened.records.length + opened.pending.length !== names.length) return rejectBootstrap();
  const records: CandidateRecord[] = [], pending: CandidatePendingFile[] = [], seen = new Set<string>(); let total = 0;
  for (const row of opened.records) {
    if (!object(row) || Object.keys(row).sort().join(",") !== "ciphertextSha256,name,payload" || typeof row.name !== "string" || !publishedName.test(row.name) || seen.has(row.name) || typeof row.payload !== "string" || row.payload.length > 12000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(row.payload) || !before.has(row.name) || row.ciphertextSha256 !== before.get(row.name)!.sha256) return rejectBootstrap();
    const bytes = Buffer.from(row.payload, "base64");
    try {
      total += bytes.length; if (!bytes.length || bytes.length > 8192 || total > 98304 || bytes.toString("base64") !== row.payload) return rejectBootstrap();
      const record = parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), vault, originalAnchorDigest);
      if (filename(record) !== row.name || !candidateRecordBytes(record).equals(bytes)) return rejectBootstrap();
      records.push(record); seen.add(row.name);
    } finally { bytes.fill(0); }
  }
  for (const row of opened.pending) {
    if (!object(row) || Object.keys(row).sort().join(",") !== "bytes,name,sha256" || typeof row.name !== "string" || !pendingName.test(row.name) || seen.has(row.name) || !before.has(row.name) || row.bytes !== before.get(row.name)!.bytes || row.sha256 !== before.get(row.name)!.sha256) return rejectBootstrap();
    pending.push(Object.freeze({ name: row.name, bytes: String(row.bytes), sha256: String(row.sha256) })); seen.add(row.name);
  }
  if (entries(directory).join("|") !== names.join("|") || seen.size !== names.length) return rejectBootstrap();
  const rootAfter = lstatSync(directory, { bigint: true });
  if (!rootAfter.isDirectory() || rootAfter.isSymbolicLink() || rootBefore.dev !== rootAfter.dev || rootBefore.ino !== rootAfter.ino) return rejectBootstrap();
  for (const name of names) { const a = checkpoint(directory, name), b = before.get(name)!; if (a.stat !== b.stat || a.sha256 !== b.sha256) return rejectBootstrap(); }
  records.sort((a, b) => Number(a.sequence) - Number(b.sequence));
  const facts = Object.freeze({ records: Object.freeze(records), pending: Object.freeze(pending), abandonedMutexObserved: opened.abandoned });
  classifyCandidateLedger(facts); return facts;
}
