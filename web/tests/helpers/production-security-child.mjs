// Disposable TEST harness only; never a packaged owner entry.
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return next(new URL("../../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href, context);
  try { return next(specifier, context); } catch (error) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !specifier.endsWith(".ts") && error.code === "ERR_MODULE_NOT_FOUND") return next(specifier + ".ts", context);
    throw error;
  }
} });
process.once("message", async message => {
  try {
    const api = await import("../../src/server/bootstrap/owner-enrollment.ts");
    if (message.action === "inspect") { process.send?.(await api.inspectOwnerEnrollment(message.config)); process.disconnect?.(); }
    else if (message.action === "pause-at-password") {
      const interaction = api.bindTrustedDesktopOwnerInteraction({ confirm: async () => "CONFIRM_FIRST_ENROLLMENT", readPasswords: async () => {
        process.send?.({ status: "DURABLE_INTENT_PASSWORD_PENDING" });
        return await new Promise(() => {});
      } });
      await api.createTrustedOwnerEnrollmentEntry(message.config, interaction).enroll();
    } else throw Error();
  } catch { process.send?.({ status: "DENIED" }); process.disconnect?.(); }
});
