// Disposable source harness only. No deployed loader or recovery bypass.
import {registerHooks} from "node:module";
registerHooks({resolve(specifier,context,next){if(specifier==="server-only")return next(new URL("../../node_modules/next/dist/compiled/server-only/empty.js",import.meta.url).href,context);try{return next(specifier,context);}catch(error){if((specifier.startsWith("./")||specifier.startsWith("../"))&&!specifier.endsWith(".ts")&&error.code==="ERR_MODULE_NOT_FOUND")return next(specifier+".ts",context);throw error;}}});
await import("../../src/server/desktop/test-entry.ts");
process.send?.({type:"source-probe-ready"});
