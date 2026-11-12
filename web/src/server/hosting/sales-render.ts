import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
const key=Symbol.for("shop-pos.test-sales.render");const state=globalThis as typeof globalThis&{[key:symbol]:AsyncLocalStorage<boolean>|undefined};const local=state[key]??=new AsyncLocalStorage<boolean>();
// TEST display metadata only. Every protected render/API independently checks SQL.
export const isTestSalesRender=()=>local.getStore()===true;
export const withTestSalesRender=<T>(enabled:boolean,work:()=>T):T=>local.run(enabled,work);
