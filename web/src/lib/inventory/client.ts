"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { acknowledgeMarker, claimMarker, confirmMarker, readMarker, sameMarker, type RecoveryMarker } from "./recovery-store";
import type { Kind,AdminProduct, InventoryTotals, MutationResult, RecoveryOutcome } from "@/server/inventory/contracts";
export type { AdminProduct, MutationResult };
export interface ProductPage { items: AdminProduct[]; nextCursor: string | null; overall: InventoryTotals; filtered: InventoryTotals }
export class InventoryClientError extends Error { constructor(readonly code = "UNAVAILABLE", readonly status = 0) { super("Inventory unavailable."); } }
export async function inventoryRead<T>(path: string, signal?: AbortSignal): Promise<T> {
 const response = await fetch(path, { credentials: "same-origin", cache: "no-store", signal, redirect: "error" });
 if (!response.ok) throw new InventoryClientError("UNAVAILABLE", response.status);
 return response.json();
}
export function money(value: string | null) {
 if (value === null) return "Not set";
 const n = BigInt(value); return "Rs. " + (n / BigInt(100)).toLocaleString("en-PK") + "." + (n % BigInt(100)).toString().padStart(2, "0");
}
export function paisa(value: string) {
 if (!/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,2})?$/.test(value)) throw new InventoryClientError("INVALID_INPUT");
 const [whole, fraction = ""] = value.split("."); const n = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
 if (n <= BigInt(0) || n > BigInt("99999999999999")) throw new InventoryClientError("INVALID_INPUT"); return n.toString();
}
export function whole(value: string) { if (!/^(?:0|[1-9][0-9]{0,11})$/.test(value)) throw new InventoryClientError("INVALID_INPUT"); return value; }
// RAM holds display results only. IndexedDB is the sole cross-tab admission authority.
interface RecoveryView { ready: boolean; marker: RecoveryMarker | null; fault: boolean; result?: MutationResult; outcome?: RecoveryOutcome["outcome"]; busy: boolean }
const initial: RecoveryView = { ready: false, marker: null, fault: false, busy: false };
let view = initial;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;
const publish = (next: RecoveryView) => { view = next; listeners.forEach(fn => fn()); };
const changed = () => { channel?.postMessage("changed"); };
async function refreshMarker() {
 try {
  const marker = await readMarker();
  if (!view.ready || view.fault || !sameMarker(marker, view.marker)) publish({ ready: true, marker, fault: false, busy: view.busy });
 } catch { publish({ ready: true, marker: view.marker, fault: true, busy: false }); }
}
export const hasPendingInventoryMutation = () => !view.ready || view.fault || view.marker !== null || view.busy;
export function useInventoryRecovery() {
 const snapshot = useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => view, () => initial);
 useEffect(() => {
  void refreshMarker();
  if (!channel && typeof BroadcastChannel !== "undefined") { channel = new BroadcastChannel("pos-test-inventory-recovery"); channel.onmessage = () => { void refreshMarker(); }; }
  const focus = () => { void refreshMarker(); }, timer = setInterval(() => { if(document.visibilityState === "visible" && document.hasFocus())focus(); }, 1500);
  window.addEventListener("focus", focus);
  return () => { clearInterval(timer); window.removeEventListener("focus", focus); };
 }, []);
 return { ...snapshot, blocked: !snapshot.ready || snapshot.fault || snapshot.marker !== null || snapshot.busy, resolve: () => resolveRecovery(), cancel: (expected: RecoveryMarker) => resolveRecovery(true, expected), acknowledge: acknowledgeRecovery };
}
async function authenticatedContext() {
 const value = await inventoryRead<{ context: string }>("/api/admin/inventory/recovery-context", AbortSignal.timeout(10000));
 if (!value || typeof value.context !== "string" || !/^[0-9a-f]{64}$/.test(value.context)) throw new InventoryClientError();
 return value.context;
}
async function authoritativeOutcome(marker: RecoveryMarker, cancel = false): Promise<RecoveryOutcome> {
 if (await authenticatedContext() !== marker.context) throw new InventoryClientError();
 const response = await fetch("/api/admin/inventory/operations/" + marker.key + "/recovery", { method: cancel ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error",
  headers: { "X-Inventory-Context": marker.context, "X-Inventory-Operation": marker.kind, ...(cancel ? { "Content-Type": "application/json" } : {}) },
  ...(cancel ? { body: JSON.stringify({ kind: marker.kind, action: "RECONCILE_OR_CANCEL" }) } : {}), signal: AbortSignal.timeout(10000) });
 if (!response.ok || response.headers.get("X-Inventory-Context") !== marker.context || response.headers.get("X-Inventory-Operation") !== marker.kind) throw new InventoryClientError();
 const outcome = await response.json() as RecoveryOutcome;
 if (outcome?.outcome === "CANCELLED" && Object.keys(outcome).length === 1) return outcome;
 if (outcome?.outcome !== "COMMITTED" || Object.keys(outcome).sort().join(",") !== "outcome,result" || !outcome.result || typeof outcome.result.operationId !== "string" ||
     !outcome.result.product || typeof outcome.result.product.id !== "string" || typeof outcome.result.product.name !== "string") throw new InventoryClientError();
 return outcome;
}
export async function resolveRecovery(cancel = false, expected?: RecoveryMarker) {
 if (view.busy) return;
 publish({ ...view, busy: true, result: undefined, outcome: undefined });
 try {
  const marker = await readMarker(); if (!marker || (cancel && (!expected || !sameMarker(marker, expected)))) throw new InventoryClientError();
  const resolved = await authoritativeOutcome(marker, cancel), confirmed = await confirmMarker(marker);
  publish({ ready: true, marker: confirmed, fault: false, busy: false, outcome: resolved.outcome, ...(resolved.outcome === "COMMITTED" ? { result: resolved.result } : {}) }); changed();
 } catch { await refreshMarker(); publish({ ...view, busy: false, result: undefined, outcome: undefined }); }
}
async function acknowledgeRecovery() {
 if (view.busy || !view.outcome || view.marker?.state !== "CONFIRMED") return;
 const expected = view.marker, previousOutcome = view.outcome, operationId = view.result?.operationId;
 publish({ ...view, busy: true });
 try {
  const fresh = await authoritativeOutcome(expected); // Fresh signed-cookie + SQL terminal proof, never cached display.
  if (fresh.outcome !== previousOutcome || (fresh.outcome === "COMMITTED" && fresh.result.operationId !== operationId)) throw new InventoryClientError();
  await acknowledgeMarker(expected);
  publish({ ready: true, marker: null, fault: false, busy: false }); changed();
 } catch { await refreshMarker(); publish({ ...view, busy: false, result: undefined, outcome: undefined }); }
}
export function useInventoryMutation(onSaved: (result: MutationResult) => void) {
 const admitted = useRef(false), ownedKey = useRef<string | null>(null), recovery = useInventoryRecovery();
 const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
 useEffect(() => {
  if (recovery.result && recovery.marker?.key === ownedKey.current) { ownedKey.current = null; setError(null); onSaved(recovery.result); }
 }, [recovery.result, recovery.marker?.key, onSaved]);
 async function submit(path: string, proposal: Record<string, unknown>) {
  if (admitted.current || hasPendingInventoryMutation()) return;
  admitted.current = true; setBusy(true); setError(null); publish({ ...view, busy: true });
  try {
   const context = await authenticatedContext();
   const suffix=/^\/api\/admin\/products\/[0-9a-f-]{36}\/(receive|edit|selling-price|status|archive|reprice|adjust)$/.exec(path)?.[1],kinds:Record<string,Kind>={receive:"RECEIVE",edit:"EDIT","selling-price":"SELLING_PRICE",status:"STATUS",archive:"ARCHIVE",reprice:"REPRICE",adjust:"ADJUST"},kind=path==="/api/admin/products"?"CREATE":suffix?kinds[suffix]:undefined;
   if (!kind) throw new InventoryClientError();
   const marker = await claimMarker({ v: 1, context, key: crypto.randomUUID(), kind, state: "PENDING" });
   ownedKey.current = marker.key;
   publish({ ready: true, marker, fault: false, busy: true }); changed();
   // Awaited durable claim precedes the ONLY POST. Never replay from a recovery lookup.
   const response = await fetch(path, { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
    headers: { "Content-Type": "application/json", "X-Inventory-Context": marker.context }, body: JSON.stringify({ ...proposal, requestKey: marker.key }), signal: AbortSignal.timeout(15000) });
   if (!response.ok) throw new InventoryClientError();
   const outcome = await authoritativeOutcome(marker); if (outcome.outcome !== "COMMITTED") throw new InventoryClientError();
   const result = outcome.result, confirmed = await confirmMarker(marker);
   publish({ ready: true, marker: confirmed, fault: false, busy: false, result, outcome: "COMMITTED" }); changed(); ownedKey.current = null; onSaved(result);
  } catch {
   await refreshMarker(); publish({ ...view, busy: false, result: undefined, outcome: undefined });
   setError("Save unconfirmed or blocked. Use operation recovery; do not enter a replacement operation.");
  } finally { admitted.current = false; setBusy(false); publish({ ...view, busy: false }); }
 }
 return { submit, busy, uncertain: recovery.blocked, error };
}
