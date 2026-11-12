// TEST ONLY: load actual production TS using Node24's installed type transformer.
// The resolve hook supplies .ts for relative imports and the usual TEST server-only
// marker alias. It does not simulate authentication, SQLite or transaction behavior.
import { registerHooks } from "node:module";
import { performance } from "node:perf_hooks";
let monotonic = 0;
Object.defineProperty(performance, "now", { configurable: true, value: () => monotonic });

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
const [directory, migrationsDirectory, wallText, role] = process.argv.slice(2);
if (role !== "ADMIN" && role !== "SALESPERSON") throw new Error("Invalid TEST role.");
const wall = Number(wallText);
if (!Number.isSafeInteger(wall) || wall <= 0) throw new Error("Invalid TEST clock.");
Date.now = () => wall;
const { openAsyncOwner } = await import("../../src/server/auth/database.ts");
const { createLoginAttemptProtection, loginAttemptPolicy } = await import("../../src/server/auth/login-attempts.ts");
const { createVolatileStorage } = await import("../../src/server/auth/storage.ts");
const { kyselyAdapter } = await import("@better-auth/kysely-adapter");
const { runWithTransaction } = await import("@better-auth/core/context");
const owner = openAsyncOwner({ database: { directory, filename: "test.sqlite3", create: false, mode: "test", busyTimeoutMs: 75 }, migrationsDirectory });
try {
  const adapter = kyselyAdapter(owner.db, { type: "sqlite", transaction: true })({
    database: { db: owner.db, type: "sqlite", transaction: true }, secondaryStorage: createVolatileStorage().storage,
    user: { modelName: "auth_users", additionalFields: { role: { type: "string", required: true, input: false } } },
    account: { modelName: "auth_credentials" },
    session: { storeSessionInDatabase: false, preserveSessionInDatabase: false, cookieCache: { enabled: false } },
    emailAndPassword: { enabled: false, disableSignUp: true }, logger: { disabled: true }, telemetry: { enabled: false },
  });
  if (loginAttemptPolicy.cooldownMs !== 30_000) throw new Error("Unexpected TEST policy.");
  const until = owner.get("SELECT cooldown_until_ms FROM auth_login_attempts WHERE bucket=?", [role])?.cooldown_until_ms;
  if (typeof until !== "bigint" || until - BigInt(wall) !== BigInt(20_000)) throw new Error("Unexpected TEST remaining cooldown.");
  let verifierCalls = 0, blocked = false, blockedAt29999 = false;
  const api = createLoginAttemptProtection({ owner, withOwnerTransaction: work => runWithTransaction(adapter, work),
    verifyCredential: async () => { verifierCalls++; return true; } });
  const verify = role === "ADMIN" ? api.verifyAdminPassword : api.verifySalespersonPassword;
  try { await verify(undefined); } catch { blocked = true; }
  monotonic = 19_999;
  try { await verify(undefined); } catch { blockedAt29999 = true; }
  const verifierCallsBeforeExpiry = verifierCalls;
  monotonic++;
  let allowedAfterExpiry = false;
  try { await verify(undefined); allowedAfterExpiry = true; } catch { /* Explicit TEST outcome only. */ }
  process.stdout.write(JSON.stringify({ remainingMs: 20_000, blocked, blockedAt29999, verifierCallsBeforeExpiry, allowedAfterExpiry, verifierCallsAfterExpiry: verifierCalls }) + "\n");
} finally { await owner.close(); }
// No test credential or bearer is received through CLI/env.
