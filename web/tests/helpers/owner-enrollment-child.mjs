// TEST-only source loader and owner-confirmation stand-in, never a deployed entry.
import { registerHooks } from "node:module";
registerHooks({
 resolve(specifier, context, next) {
  if (specifier === "server-only") return next(new URL("../../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href, context);
  try { return next(specifier, context); }
  catch (error) {
   if ((specifier.startsWith("./") || specifier.startsWith("../")) && !specifier.endsWith(".ts") && error.code === "ERR_MODULE_NOT_FOUND")
    return next(specifier + ".ts", context);
   throw error;
  }
 },
});
process.once("message", async message => {
 try {
  const m = await import("../../src/server/bootstrap/owner-enrollment.ts");
  let confirmations = 0, passwordReads = 0;
  const handle = m.bindTrustedDesktopOwnerInteraction({
   async confirm(request) {
    if (request.action !== "RECONCILE_COMMITTED_ENROLLMENT") return "CANCELLED";
    confirmations++; return "CONFIRM_MATCHING_COMMITTED_ENROLLMENT";
   },
   async readPasswords() { passwordReads++; throw Error("TEST reconciliation must not read credentials"); },
  });
  const result = await m.createTrustedOwnerEnrollmentEntry(message.config, handle).reconcile();
  process.send?.({ status: "reconciled", result, confirmations, passwordReads });
 } catch { process.send?.({ status: "denied" }); }
 finally { process.disconnect?.(); }
});
