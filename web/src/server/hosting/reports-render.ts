import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
const key=Symbol.for("shop-pos.test-reports-render"),state=globalThis as typeof globalThis & {[key]?:AsyncLocalStorage<boolean>},local=state[key]??=new AsyncLocalStorage<boolean>();
export const withTestReportsRender=<T>(enabled:boolean,work:()=>T)=>local.run(enabled,work);
export const readTestReportsRender=()=>local.getStore()===true;
