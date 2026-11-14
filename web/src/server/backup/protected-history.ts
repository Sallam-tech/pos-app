import "server-only";
import { assertProtectedWriterAdmission, protectedWriterHistory, type ProtectedWriterAdmission } from "../bootstrap/writer-admission";
import type { DatabaseOptions } from "../db/location";
import type { HistoricalSettings } from "./service";
import { fail } from "./storage";
declare const historyBrand: unique symbol;
export interface ProtectedRestoredHistory { readonly [historyBrand]: true }
const histories = new WeakMap<object, { admission: ProtectedWriterAdmission; history: readonly HistoricalSettings[] }>();
export function createProtectedRestoredHistory(admission: ProtectedWriterAdmission, database: DatabaseOptions): ProtectedRestoredHistory {
  const history = protectedWriterHistory(admission, database), token = Object.freeze({ toJSON: fail }) as unknown as ProtectedRestoredHistory;
  histories.set(token, { admission, history }); return token;
}
export function protectedRestoredHistory(proof: unknown, database: DatabaseOptions): readonly HistoricalSettings[] {
  if (proof === undefined) return [];
  const state = proof && typeof proof === "object" ? histories.get(proof) : undefined; if (!state) return fail();
  assertProtectedWriterAdmission(state.admission, database, undefined, true); return state.history;
}
