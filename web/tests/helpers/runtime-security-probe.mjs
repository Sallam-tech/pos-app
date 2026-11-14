// Readonly disposable runtime probe; no TLS listener, credentials or DB open.
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return next(new URL("../../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href, context);
  try { return next(specifier, context); } catch (error) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !specifier.endsWith(".ts") && error.code === "ERR_MODULE_NOT_FOUND") return next(specifier + ".ts", context);
    throw error;
  }
} });
const { assertPatchedLocalRuntime } = await import("../../src/server/hosting/runtime-policy.ts");
let allowed = false;
try { assertPatchedLocalRuntime(); allowed = true; } catch { /* Expected for affected releases. */ }
process.stdout.write(JSON.stringify({ version: process.versions.node, allowed }));
