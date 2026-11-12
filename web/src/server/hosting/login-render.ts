import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Role } from "../auth/types";
// Render metadata only, never authorization. Minted exclusively by the validated
// TEST host for its fixed role origin; not derived from headers, URL or UI state.
const key = Symbol.for("shop-pos.test-login.render-role");
const state = globalThis as typeof globalThis & { [key: symbol]: AsyncLocalStorage<Role> | undefined };
const local = state[key] ??= new AsyncLocalStorage<Role>();
export const testLoginRole = () => local.getStore();
export const withTestLoginRender = <T>(role: Role, work: () => T): T => local.run(role,work);
