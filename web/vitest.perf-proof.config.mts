import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
 resolve: { alias: { "server-only": fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)) } },
 test: {
  environment: "node",
  include: ["tests/integration/perf-*.test.ts"],
  fileParallelism: false,
  testTimeout: 180000,
  hookTimeout: 180000,
  clearMocks: true,
  restoreMocks: true,
 },
});
