"use client";
import {desktopRecovery,desktopMarkerAccess} from "../desktop/recovery-store";
type Kind="CORRECT";
// The ONLY persisted business-operation data is this <=512-byte, non-bearer marker.
export interface RecoveryMarker { v: 1; context: string; key: string; kind: Kind; state: "PENDING" | "ATTEMPTED" | "CONFIRMED" }
const database = "pos-test-invoices-recovery-v1", storeName = "marker", slot = "active";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail = () => new Error("Recovery storage unavailable. Mutations blocked.");
export function validateMarker(value: unknown): RecoveryMarker {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw fail();
 const m = value as RecoveryMarker;
 if (Object.keys(m).sort().join(",") !== "context,key,kind,state,v" || m.v !== 1 ||
     typeof m.context !== "string" || !/^[0-9a-f]{64}$/.test(m.context) || typeof m.key !== "string" || !uuid.test(m.key) ||
     (!["CORRECT"].includes(m.kind)) || (m.state !== "PENDING" && m.state !== "ATTEMPTED" && m.state !== "CONFIRMED") ||
     new TextEncoder().encode(JSON.stringify(m)).length > 512) throw fail();
 return m;
}
export const sameMarker = (a: RecoveryMarker | null, b: RecoveryMarker | null) =>
 a === null ? b === null : b !== null && a.v === b.v && a.context === b.context && a.key === b.key && a.kind === b.kind && a.state === b.state;
function open(): Promise<IDBDatabase> {
 return new Promise((resolve, reject) => {
  let done = false; const timer = setTimeout(() => finish(), 3000);
  const finish = (db?: IDBDatabase) => { if (done) { db?.close(); return; } done = true; clearTimeout(timer); if (db) resolve(db); else reject(fail()); };
  try {
   if (!window.isSecureContext || !window.indexedDB) throw fail();
   const request = indexedDB.open(database, 1);
   request.onupgradeneeded = () => { const db = request.result; if (db.objectStoreNames.length) { request.transaction?.abort(); return; } db.createObjectStore(storeName); };
   request.onerror = () => finish(); request.onblocked = () => finish();
   request.onsuccess = () => { const db = request.result; if (db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains(storeName)) { db.close(); finish(); return; } finish(db); };
  } catch { finish(); }
 });
}
// Network awaits NEVER occur in an IDB transaction. Admission/deletion uses one
// strict-durability read/compare/write transaction, not a tab-local busy flag.
async function access<T>(write: boolean, work: (marker: RecoveryMarker | null) => { value: T; next?: RecoveryMarker | null }): Promise<T> {
 if(desktopRecovery())return desktopMarkerAccess("invoices",write,validateMarker,work);
 const db = await open();
 try {
  return await new Promise<T>((resolve, reject) => {
   let tx: IDBTransaction, result: T;
   try { tx = db.transaction(storeName, write ? "readwrite" : "readonly", write ? { durability: "strict" } : undefined); if (write && tx.durability !== "strict") { tx.abort(); throw fail(); } }
   catch { reject(fail()); return; }
   const timer = setTimeout(() => { try { tx.abort(); } catch { /* Already finished; rejection is still safe. */ } reject(fail()); }, 3000);
   db.onversionchange = () => { try { tx.abort(); } catch {} db.close(); };
   tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(fail()); };
   tx.oncomplete = () => { clearTimeout(timer); resolve(result); };
   const store = tx.objectStore(storeName), count = store.count(), read = store.get(slot);
   read.onsuccess = () => {
    try {
     if (count.result > 1 || (count.result === 1 && read.result === undefined)) throw fail();
     const current = read.result === undefined ? null : validateMarker(read.result), changed = work(current); result = changed.value;
     if (changed.next !== undefined) {
      if (!write) throw fail();
      if (changed.next === null) store.delete(slot); else store.put(validateMarker(changed.next), slot);
     }
    } catch { tx.abort(); }
   };
  });
 } finally { db.close(); }
}
export const readMarker = () => access(false, marker => ({ value: marker }));
export const claimMarker = (marker: RecoveryMarker) => access(true, current => {
 validateMarker(marker); if (current !== null || marker.state !== "PENDING") throw fail(); return { value: marker, next: marker };
});
export const confirmMarker = (expected: RecoveryMarker) => access(true, current => {
 if (!sameMarker(current, expected)) throw fail(); const next = { ...expected, state: "CONFIRMED" as const }; return { value: next, next };
});
// Caller must first obtain a FRESH authenticated authoritative terminal outcome, and may
// call this only in response to the explicit acknowledgement button.
export const acknowledgeMarker = (expected: RecoveryMarker) => access(true, current => {
 if (expected.state !== "CONFIRMED" || !sameMarker(current, expected)) throw fail(); return { value: undefined, next: null };
});

export const armMarker=(expected:RecoveryMarker)=>access(true,current=>{if(expected.state!=="PENDING"||!sameMarker(current,expected))throw fail();const next={...expected,state:"ATTEMPTED" as const};return {value:next,next};});
