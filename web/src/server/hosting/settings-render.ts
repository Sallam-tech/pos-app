import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
const key=Symbol.for("shop-pos.test-settings.render-mode"),state=globalThis as typeof globalThis&{[key:symbol]:AsyncLocalStorage<boolean>|undefined},local=state[key]??=new AsyncLocalStorage<boolean>();
export const isTestSettingsRender=()=>local.getStore()===true;
export const withTestSettingsRender=<T>(enabled:boolean,work:()=>T):T=>local.run(enabled,work);
