import "server-only";

import { withProtectedLocalKeys, type LocalKeyConfiguration } from "./keys";
import { withBootstrapOwnership } from "./ownership";
import { withPristineBootstrapDatabase } from "./database";
import { BootstrapRejected, rejectBootstrap } from "./windows";

export type EnrollmentPreparation = LocalKeyConfiguration;

// Safe preparation ONLY, never an enrollment grant. There is no password reader,
// provision/accept/repair/restore method or public endpoint. Owner-presence proof,
// R custody acknowledgement and SQL/filesystem crash reconciliation are pending.
// A local caller, missing DB/latch or DPAPI user identity is not owner proof.
export async function prepareOwnerEnrollment(config: EnrollmentPreparation) {
  try {
    if (!config || Object.keys(config).sort().join(",") !== "database,directory,migrationsDirectory") return rejectBootstrap();
    return await withBootstrapOwnership(config.database, async retainOwnership =>
      withPristineBootstrapDatabase(config, retainOwnership, async () => {
        const keys = await withProtectedLocalKeys(config, async () => {});
        return Object.freeze({ installationId: keys.installationId, deviceId: keys.deviceId,
          ownerAuthorizationRequired: true as const, productionActivation: false as const,
          enrollmentAccepted: false as const, status: "OWNER_CEREMONY_AND_RECOVERY_POLICY_REQUIRED" as const });
      }));
  } catch { throw new BootstrapRejected(); }
}
// Future accepted orchestration MUST reuse runTrustedFirstRunSetup from
// ../auth/provision with an approved external anchor/journal. No second writer
// or provisioning implementation is introduced here.
