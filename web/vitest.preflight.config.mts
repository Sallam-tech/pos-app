import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
 resolve: { alias: { "server-only": fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)) } },
 test: { environment: "node", include: ["tests/integration/migration-preflight.test.ts", "tests/integration/bootstrap-read-scope.test.ts", "tests/unit/maintenance-record-contract.test.ts"], fileParallelism: false,
 testTimeout: 120000, hookTimeout: 30000, clearMocks: true, restoreMocks: true },
});
