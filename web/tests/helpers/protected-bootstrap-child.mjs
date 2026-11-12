// TEST-only source loader; not a deployed bootstrap or activation path.
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
    if (message.action === "hold") {
      const { withBootstrapOwnership } = await import("../../src/server/bootstrap/ownership.ts");
      await withBootstrapOwnership(message.config.database, async () => {
        process.send?.({ status: "held" });
        await new Promise(resolve => process.once("message", resolve));
      });
      process.send?.({ status: "released" });
    } else {
      const { withProtectedLocalKeys } = await import("../../src/server/bootstrap/keys.ts");
      const metadata = await withProtectedLocalKeys(message.config, async keys => {
        if (keys.signingSecrets.ADMIN.length !== 64 || keys.signingSecrets.SALESPERSON.length !== 64 ||
            keys.signingSecrets.ADMIN === keys.signingSecrets.SALESPERSON) throw new Error("Denied");
      });
      process.send?.({ status: "read", metadata });
    }
  } catch { process.send?.({ status: "denied" }); }
  finally { process.disconnect?.(); }
});
