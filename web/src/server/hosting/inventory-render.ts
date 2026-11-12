import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
// Share the request-local render mode with Next's compiled server bundle in this
// SAME process. It carries no identity, DB or authorization capability. Only the
// validated TEST host enters it AFTER real Admin authorization. No header/env flag.
const key = Symbol.for("shop-pos.test-inventory.render-mode");
const state = globalThis as typeof globalThis & { [key: symbol]: AsyncLocalStorage<boolean> | undefined };
const local = state[key] ??= new AsyncLocalStorage<boolean>();
export const isTestInventoryRender = () => local.getStore() === true;
export const withTestInventoryRender = <T>(work: () => T): T => local.run(true, work);
