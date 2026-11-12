import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
 resolve: { alias: { "server-only": fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js",import.meta.url)) } },
 test: { environment:"node",include:["tests/integration/inventory.test.ts"],fileParallelism:false,testTimeout:30000,hookTimeout:30000,clearMocks:true,restoreMocks:true },
});
