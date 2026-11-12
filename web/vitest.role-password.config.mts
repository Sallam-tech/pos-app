import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "server-only": fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/integration/password-callbacks.test.ts", "tests/integration/account-provisioning.test.ts", "tests/integration/admin-password-policy.test.ts"],
    fileParallelism: false, testTimeout: 20000, clearMocks: true, restoreMocks: true,
  },
});
