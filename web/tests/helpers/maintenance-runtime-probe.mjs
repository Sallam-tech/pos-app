// Readonly disposable runtime probe; no TLS listener, credentials or DB open.
import { registerHooks } from "node:module";
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
    if (message.action === "pause-maintenance") {
      const { openAuthorizationGateway, withAdminMaintenanceSource, adminMaintenanceSourceEvidence } = await import("../../src/server/auth/gateway.ts");
      const { openProofDatabase, fingerprint } = await import("../../src/server/backup/snapshot.ts");
      const { enrollmentDigest } = await import("../../src/server/bootstrap/database.ts");
      const runtime = await acquireRuntimeOwnership(message.filename), gateway = await openAuthorizationGateway(message.authorization);
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
