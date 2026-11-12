import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
const key=Symbol.for("shop-pos.test-invoices-render");
const state=globalThis as typeof globalThis & {[key]?:AsyncLocalStorage<boolean>};
const local=state[key]??=new AsyncLocalStorage<boolean>();
export const withTestInvoicesRender=<T>(enabled:boolean,work:()=>T)=>local.run(enabled,work);
export const readTestInvoicesRender=()=>local.getStore()===true;
