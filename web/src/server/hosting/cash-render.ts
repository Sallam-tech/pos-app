import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
const key=Symbol.for("shop-pos.test-cash-render"),state=globalThis as typeof globalThis & {[key]?:AsyncLocalStorage<boolean>},local=state[key]??=new AsyncLocalStorage<boolean>();
export const withTestCashRender=<T>(enabled:boolean,work:()=>T)=>local.run(enabled,work);
export const readTestCashRender=()=>local.getStore()===true;
