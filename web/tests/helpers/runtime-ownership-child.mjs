// TEST ONLY: actual Node24 production TS, with the usual server-only poison alias.
// No auth/SQLite/OS ownership behavior is mocked.
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: new URL("../../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href, shortCircuit: true };
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return nextResolve(specifier + ".ts", context);
      throw error;
    }
  },
});
const { acquireRuntimeOwnership } = await import("../../src/server/hosting/ownership.ts");
try {
  let guard;
  if (process.argv[3] === "runtime") {
    const { readFileSync } = await import("node:fs");
    const { randomBytes } = await import("node:crypto");
    const path = await import("node:path");
    const { startLocalRuntime } = await import("../../src/server/hosting/runtime.ts");
    const [filename, , applicationDirectory, certificates, portText, migrationsDirectory] = process.argv.slice(2);
    const port = Number(portText);
    guard = await startLocalRuntime({ applicationDirectory, port, tls: {
      key: readFileSync(path.join(certificates,"leaf.key")), certificate: readFileSync(path.join(certificates,"leaf.pem")),
      trustAnchor: readFileSync(path.join(certificates,"ca.pem")),
    }, authorization: { database: {directory:path.dirname(filename),filename:path.basename(filename),mode:"test",create:false},
      migrationsDirectory, origins:{ADMIN:"https://localhost:"+port,SALESPERSON:"https://127.0.0.1:"+port},
      signingSecrets:{ADMIN:randomBytes(48).toString("base64url"),SALESPERSON:randomBytes(48).toString("base64url")},sessionLifetimeSeconds:120 } });
  } else guard = await acquireRuntimeOwnership(process.argv[2]);
  process.on("message", async message => {
    if (message === "crash") process.exit(0); // Owned TEST process: demonstrate OS cleanup.
    if (message === "release") { await guard.close(); process.exit(0); }
  });
  process.send?.("owned");
} catch { process.send?.("denied"); process.disconnect?.(); }
