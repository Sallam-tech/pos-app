import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Next.js handles this poison marker in app builds. Only this Node test
    // project maps it to Next's own server implementation, never client code.
    alias: { "server-only": fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/sqlite-foundation.test.ts"],
    fileParallelism: false,
    testTimeout: 10000,
    clearMocks: true,
    restoreMocks: true,
  },
});
