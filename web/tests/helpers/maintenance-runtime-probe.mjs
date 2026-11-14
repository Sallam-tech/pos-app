// Readonly disposable runtime probe; no TLS listener, credentials or DB open.
import { createRequire, registerHooks } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return next(new URL("../../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href, context);
  try { return next(specifier, context); } catch (error) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !specifier.endsWith(".ts") && error.code === "ERR_MODULE_NOT_FOUND") return next(specifier + ".ts", context);
    throw error;
  }
} });

// Disposable TEST child: no source access for the fence-only probe.
process.once("message", async message => {
  try {
    const { acquireRuntimeOwnership } = await import("../../src/server/hosting/ownership.ts");
    if (message.action === "pause-restore-copy-ack") {
      const { openAuthorizationGateway, withAdminMaintenanceSource } = await import("../../src/server/auth/gateway.ts");
      const { createProtectedRootWriterAdmission } = await import("../../src/server/bootstrap/writer-admission.ts");
      const { openTestCustody } = await import("../../src/server/backup/crypto.ts");
      const { withProtectedRestore41, bindTrustedProtectedRestoreInteraction } = await import("../../src/server/bootstrap/restore41.ts");
      const runtime = await acquireRuntimeOwnership(message.filename);
      const gateway = await openAuthorizationGateway({ ...message.authorization, protectedAdmission: await createProtectedRootWriterAdmission(message.config,runtime,41) },41);
      const proof=await gateway.verifyAdminPassword(message.password);delete message.password;
      await withAdminMaintenanceSource(gateway,proof,runtime,message.operation,async(source,lease)=>{
        const Driver=createRequire(import.meta.url)("better-sqlite3"),backup=Driver.prototype.backup;
        Driver.prototype.backup=async function(destination,options){const result=await backup.call(this,destination,options);
          if(path.resolve(destination).toLowerCase()===path.join(message.target,"restored41.sqlite3").toLowerCase()){
            process.send?.({status:"ACTUAL_RESTORE_COPY_UNACKNOWLEDGED",productionActivation:false});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000);throw Error("TEST pause deadline");
          }return result;};
        try{await withProtectedRestore41(message.config,message.config,source,lease,await openTestCustody(message.custodyDirectory),message.archive,message.target,message.operation.operationId,
          bindTrustedProtectedRestoreInteraction({confirm:async()=>"CONFIRM_SEPARATE_TEST_RESTORE41"}),async()=>{throw Error("TEST must not reconstruct acknowledged completion");});}
        finally{Driver.prototype.backup=backup;}
      });return;
    }
    if (message.action === "pause-candidate-final-commit") {
      const { openAuthorizationGateway, withAdminMaintenanceSource } = await import("../../src/server/auth/gateway.ts");
      const { createTestCustody } = await import("../../src/server/backup/crypto.ts");
      const { createAuthenticationBackup8 } = await import("../../src/server/bootstrap/authentication-backup.ts");
      const { bindTrustedCandidateCopyInteraction, withUnadmittedCandidateCopy8, migrateUnadmittedCandidate8 } = await import("../../src/server/bootstrap/candidate-copy8.ts");
      const runtime = await acquireRuntimeOwnership(message.filename);
      const { createProtectedRootWriterAdmission } = await import("../../src/server/bootstrap/writer-admission.ts");
      const gateway = await openAuthorizationGateway({ ...message.authorization, protectedAdmission: await createProtectedRootWriterAdmission(message.config, runtime, 8) });
      const timer = setTimeout(() => process.exit(2), 110000);
      try {
        const proof = await gateway.verifyAdminPassword(message.password); delete message.password;
        await withAdminMaintenanceSource(gateway, proof, runtime, message.operation, async (source, lease) => {
          mkdirSync(message.custodyDirectory);
          const custody = await createTestCustody(message.custodyDirectory);
          const backup = await createAuthenticationBackup8(message.config, lease, custody, message.precopy, message.archiveId);
          await withUnadmittedCandidateCopy8(message.config, source, lease, backup, message.target,
            bindTrustedCandidateCopyInteraction({ confirm: async () => "CONFIRM_NEW_UNADMITTED_COPY8" }), async copy => {
              const { fingerprint, openProofDatabase } = await import("../../src/server/backup/snapshot.ts");
              const { enrollmentDigest } = await import("../../src/server/bootstrap/database.ts");
              const sourceDb = openProofDatabase(message.filename); let sourceState;
              try { sourceState = enrollmentDigest(fingerprint(sourceDb)); } finally { sourceDb.close(); }
              const Driver = createRequire(import.meta.url)("better-sqlite3"), exec = Driver.prototype.exec;
              Driver.prototype.exec = function(sql) {
                const result = exec.call(this, sql);
                if (sql === "COMMIT" && this.name.toLowerCase() === path.join(message.target, "candidate8.sqlite3").toLowerCase() && this.prepare("PRAGMA user_version").get().user_version === BigInt(41)) {
                  process.send?.({ status: "ACTUAL_FINAL_COMMIT_UNACKNOWLEDGED", sourceState, productionActivation: false });
                  // Pause inside the native-call wrapper, before it returns to
                  // the production controller. Parent kills this TEST process.
                  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);
                  throw Error("TEST commit pause deadline");
                }
                return result;
              };
              try { await migrateUnadmittedCandidate8(copy); }
              finally { Driver.prototype.exec = exec; }
            });
        });
      } finally { clearTimeout(timer); await gateway.close().catch(() => {}); await runtime.close(); }
      return;
    }
    if (message.action === "pause-maintenance") {
      const { openAuthorizationGateway, withAdminMaintenanceSource, adminMaintenanceSourceEvidence } = await import("../../src/server/auth/gateway.ts");
      const { openProofDatabase, fingerprint } = await import("../../src/server/backup/snapshot.ts");
      const { enrollmentDigest } = await import("../../src/server/bootstrap/database.ts");
      const runtime = await acquireRuntimeOwnership(message.filename);
      const { createProtectedRootWriterAdmission } = await import("../../src/server/bootstrap/writer-admission.ts");
      const gateway = await openAuthorizationGateway({ ...message.authorization, protectedAdmission: await createProtectedRootWriterAdmission(message.config, runtime, 8) });
      const deadline = setTimeout(() => process.exit(2), 45000);
      try {
        const proof = await gateway.verifyAdminPassword(message.password);
        // Password is confined to this disposable IPC test process, never a file,
        // argument, scope or output. Drop the received reference before pausing.
        delete message.password;
        await withAdminMaintenanceSource(gateway, proof, runtime, message.operation, async (scope, lease) => {
          const facts = adminMaintenanceSourceEvidence(scope, message.authorization.database, lease, message.operation);
          const db = openProofDatabase(message.filename); let state;
          try { state = enrollmentDigest(fingerprint(db)); } finally { db.close(); }
          process.send?.({ status: "MAINTENANCE_SOURCE_HELD", state, schema: facts.schema, productionActivation: facts.productionActivation });
          await new Promise(() => {});
        });
      } finally { clearTimeout(deadline); await gateway.close(); await runtime.close(); }
      return;
    }
    if (message.action !== "probe") throw Error();
    let runtime;
    try { runtime = await acquireRuntimeOwnership(message.filename); }
    catch { process.send?.({ status: "FENCE_DENIED" }); process.disconnect?.(); return; }
    await runtime.close(); process.send?.({ status: "FENCE_UNEXPECTEDLY_ACQUIRED" }); process.disconnect?.();
  } catch { process.send?.({ status: "PROBE_ERROR" }); process.disconnect?.(); }
});
