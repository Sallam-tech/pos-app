import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({resolve:{alias:{"server-only":fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js",import.meta.url))}},test:{environment:"node",include:["tests/integration/expenses*.test.ts"],fileParallelism:false,testTimeout:90000,hookTimeout:90000,clearMocks:true,restoreMocks:true}});
