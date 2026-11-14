import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "server-only": fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)) } },
  test: { environment: "node", include: ["tests/integration/backup-security*.test.ts","tests/integration/admin-products-settings-settings-core.test.ts","tests/integration/login-attempt-protection.test.ts"], fileParallelism: false, testTimeout: 180000, hookTimeout: 120000, restoreMocks: true, clearMocks: true },
});
