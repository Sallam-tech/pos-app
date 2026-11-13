import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";
export default defineConfig({resolve:{alias:{"server-only":fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js",import.meta.url))}},test:{environment:"node",include:["tests/integration/admin-products-settings*.test.ts"],fileParallelism:false,testTimeout:180000,hookTimeout:120000,restoreMocks:true,clearMocks:true}});
