import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
const key=Symbol.for("shop-pos.test-returns-render");
const state=globalThis as typeof globalThis & {[key]?:AsyncLocalStorage<boolean>};
const local=state[key]??=new AsyncLocalStorage<boolean>();
// Display metadata only. Signed-session + authoritative SQL checks happen BEFORE rendering and in every API.
export const withTestReturnsRender=<T>(enabled:boolean,work:()=>T)=>local.run(enabled,work);
export const readTestReturnsRender=()=>local.getStore()===true;
