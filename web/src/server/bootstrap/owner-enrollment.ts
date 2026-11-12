import "server-only";

import { randomUUID } from "node:crypto";
import type { SetupPasswords } from "../auth/provision";
import { provisioningFailureOutcome, runTrustedFirstRunSetup } from "../auth/provision";
import { enrollmentDigest, inspectEnrollmentDatabase } from "./database";
import { inspectLocalVault, type LocalKeyConfiguration } from "./keys";
import { withBootstrapOwnership, hasActiveBootstrapLease } from "./ownership";
import { appendEnrollmentRecord, classifyEnrollment, readEnrollmentJournal, recordCommon,
  type AnchorRecord, type CommittedRecord, type IntentRecord } from "./journal";
import { BootstrapRejected, rejectBootstrap } from "./windows";

export type OwnerSetupAction = "FIRST_ENROLLMENT" | "RECONCILE_COMMITTED_ENROLLMENT";
export interface DesktopOwnerAdapter {
  confirm(request: Readonly<{ action: OwnerSetupAction; installationId: string; deviceId: string }>):
    Promise<"CONFIRM_FIRST_ENROLLMENT" | "CONFIRM_MATCHING_COMMITTED_ENROLLMENT" | "CANCELLED">;
  readPasswords(): Promise<SetupPasswords>;
}
export interface TrustedDesktopOwnerInteraction { readonly __trustedOwnerInteraction: unique symbol }
const interactions = new WeakMap<object, Readonly<DesktopOwnerAdapter>>();

// PRIVILEGED construction boundary for the future trusted packaged desktop.
// NOT owner authentication by itself: no production caller/IPC/installer exists
// yet. It must never be constructed from HTTP, a SID or a client confirmation flag.
export function bindTrustedDesktopOwnerInteraction(adapter: DesktopOwnerAdapter): TrustedDesktopOwnerInteraction {
  if (!adapter || Object.keys(adapter).sort().join(",") !== "confirm,readPasswords" ||
      typeof adapter.confirm !== "function" || typeof adapter.readPasswords !== "function") return rejectBootstrap();
  const handle = Object.freeze({}) as TrustedDesktopOwnerInteraction;
  interactions.set(handle, Object.freeze({ confirm: adapter.confirm.bind(adapter), readPasswords: adapter.readPasswords.bind(adapter) }));
  return handle;
}
async function load(config: LocalKeyConfiguration, retain: () => void) {
  const vault = await inspectLocalVault(config), snapshot = await inspectEnrollmentDatabase(config, retain);
  const records = await readEnrollmentJournal(vault, snapshot.schemaDigest);
  return { vault, snapshot, records, state: classifyEnrollment(records, snapshot) };
}
const checkpoint = (value: Awaited<ReturnType<typeof load>>) => enrollmentDigest({
  vault: value.vault, snapshot: value.snapshot,
  records: [...value.records].sort((a, b) => (a.sequence + a.kind).localeCompare(b.sequence + b.kind)),
});
function anchorFor(intent: IntentRecord, committed: CommittedRecord): AnchorRecord {
  return { ...recordCommonFrom(intent), kind: "ENROLLED", intentDigest: enrollmentDigest(intent),
    committedDigest: enrollmentDigest(committed), bindingFingerprint: committed.bindingFingerprint };
}
function recordCommonFrom(intent: IntentRecord) {
  return { format: intent.format, sequence: intent.sequence, intentId: intent.intentId,
    installationId: intent.installationId, deviceId: intent.deviceId, vaultDigest: intent.vaultDigest,
    databaseFingerprint: intent.databaseFingerprint, schemaDigest: intent.schemaDigest };
}
export async function inspectOwnerEnrollment(config: LocalKeyConfiguration) {
  try {
    return await withBootstrapOwnership(config.database, async retain => {
      const current = await load(config, retain);
      return Object.freeze({ status: current.state.status, productionActivation: false as const });
    });
  } catch { return Object.freeze({ status: "RECOVERY_REVIEW_REQUIRED" as const, productionActivation: false as const }); }
}
export function createTrustedOwnerEnrollmentEntry(input: LocalKeyConfiguration, interaction: TrustedDesktopOwnerInteraction) {
  const adapter = interaction && typeof interaction === "object" ? interactions.get(interaction) : undefined;
  if (!adapter || !input || !input.database || input.database.create === true ||
      Object.keys(input).sort().join(",") !== "database,directory,migrationsDirectory") return rejectBootstrap();
  const config = Object.freeze({ directory: input.directory, migrationsDirectory: input.migrationsDirectory,
    database: Object.freeze({ ...input.database, create: false }) });
  const operation = async (action: OwnerSetupAction, inputSignal?: AbortSignal) => {
    try {
      if (inputSignal !== undefined && !(inputSignal instanceof AbortSignal)) return rejectBootstrap();
      const signal = inputSignal ?? new AbortController().signal;
      return await withBootstrapOwnership(config.database, async (retain, lease) => {
        const guard = () => { if (signal.aborted || !hasActiveBootstrapLease(lease, config.database)) rejectBootstrap(); };
        guard();
        const before = await load(config, retain), required = action === "FIRST_ENROLLMENT" ?
          ["UNENROLLED", "RETRY_REQUIRES_OWNER"] : ["RECONCILIATION_REQUIRES_OWNER"];
        if (!required.includes(before.state.status)) return rejectBootstrap();
        const confirmed = await adapter.confirm(Object.freeze({ action, installationId: before.vault.metadata.installationId, deviceId: before.vault.metadata.deviceId }));
        guard();
        if (confirmed !== (action === "FIRST_ENROLLMENT" ? "CONFIRM_FIRST_ENROLLMENT" : "CONFIRM_MATCHING_COMMITTED_ENROLLMENT")) return rejectBootstrap();
        const current = await load(config, retain);
        guard(); if (checkpoint(before) !== checkpoint(current)) return rejectBootstrap();

        if (action === "RECONCILE_COMMITTED_ENROLLMENT") {
          const intent = current.state.lastIntent, committed = current.state.committed;
          if (!intent || !committed || current.snapshot.kind !== "ENROLLED" || !current.snapshot.initial) return rejectBootstrap();
          // NO password reader or account writer on reconciliation.
          await appendEnrollmentRecord(current.vault, anchorFor(intent, committed));
        } else {
          const previous = current.state.lastIntent, sequence = previous ? (BigInt(previous.sequence) + BigInt(1)).toString() : "1";
          const intent: IntentRecord = { ...recordCommon(current.vault, current.snapshot.schemaDigest, sequence, randomUUID()),
            kind: "INTENT", previousAbortDigest: current.state.lastAbort ? enrollmentDigest(current.state.lastAbort) : null };
          // Native flush/publication/readback MUST complete before the sole writer.
          await appendEnrollmentRecord(current.vault, intent);
          guard();
          let read = false;
          try {
            await runTrustedFirstRunSetup(config, async () => {
              guard(); if (read) return rejectBootstrap(); read = true;
              const supplied = await adapter.readPasswords(); guard(); return supplied;
            }, { lease, signal, binding: { installationId: intent.installationId, deviceId: intent.deviceId,
              intentId: intent.intentId, vaultDigest: intent.vaultDigest } });
          } catch (error) {
            const outcome = provisioningFailureOutcome(error);
            if (outcome) {
              const snapshot = await inspectEnrollmentDatabase(config, retain);
              if (snapshot.kind === "PRISTINE") await appendEnrollmentRecord(current.vault, {
                ...recordCommonFrom(intent), kind: "ABORTED", intentDigest: enrollmentDigest(intent), outcome });
            }
            return rejectBootstrap(); // Unknown COMMIT is NEVER marked aborted or automatically adopted.
          }
          const committedState = await inspectEnrollmentDatabase(config, retain);
          if (committedState.kind !== "ENROLLED" || !committedState.initial || committedState.binding.intentId !== intent.intentId ||
              committedState.binding.installationId !== intent.installationId || committedState.binding.deviceId !== intent.deviceId ||
              committedState.binding.vaultDigest !== intent.vaultDigest) return rejectBootstrap();
          const committed: CommittedRecord = { ...recordCommonFrom(intent), kind: "COMMITTED", intentDigest: enrollmentDigest(intent),
            bindingFingerprint: committedState.bindingFingerprint, initialFingerprint: committedState.initialFingerprint };
          // Preserve a confirmed SQL outcome even if the UI cancels after COMMIT.
          await appendEnrollmentRecord(current.vault, committed);
          guard();
          await appendEnrollmentRecord(current.vault, anchorFor(intent, committed));
        }
        guard();
        const final = await load(config, retain);
        if (final.state.status !== "ENROLLED") return rejectBootstrap();
        return Object.freeze({ enrollmentAccepted: true as const, productionActivation: false as const });
      });
    } catch { throw new BootstrapRejected(); }
  };
  return Object.freeze({
    enroll: (signal?: AbortSignal) => operation("FIRST_ENROLLMENT", signal),
    reconcile: (signal?: AbortSignal) => operation("RECONCILE_COMMITTED_ENROLLMENT", signal),
  });
}
