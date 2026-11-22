"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useInventoryRecovery } from "@/lib/inventory/client";
import { sameMarker, type RecoveryMarker } from "@/lib/inventory/recovery-store";
export function TestInventoryRecovery() {
 const recovery = useInventoryRecovery(), [confirmation, setConfirmation] = useState<RecoveryMarker | null>(null);
 if (recovery.ready && !recovery.blocked) return null;
 const confirm = confirmation !== null && sameMarker(confirmation, recovery.marker);
 return <section aria-label="Operation recovery" className="mb-4 rounded-lg border bg-card p-4 text-sm">
  <p role="status">{!recovery.ready ? "Checking recovery storage before enabling saves..." : recovery.fault ?
   "Recovery storage unavailable. Product and stock saves are blocked; no replacement operation will be sent." : recovery.outcome === "COMMITTED" ?
   "Saved operation confirmed from SQLite. Acknowledge it before another save." : recovery.outcome === "CANCELLED" ?
   "Cancelled operation confirmed from SQLite. This request key can never execute. Acknowledge it before another save." :
   "UNKNOWN: a previous operation is unresolved. New saves are blocked. Sign in as Admin and resolve it; a missing result does not mean it failed."}</p>
  {recovery.result && <p className="mt-2">Saved <strong>{recovery.result.product.name}</strong>. No repeat mutation was sent during recovery.</p>}
  {recovery.marker && !recovery.fault && <div className="mt-3 flex flex-wrap gap-3">
   <Button type="button" variant="outline" disabled={recovery.busy} onClick={() => { setConfirmation(null); void recovery.resolve(); }}>Finish the previous step</Button>
   {!recovery.outcome && !confirm && <Button type="button" variant="outline" disabled={recovery.busy} onClick={() => { setConfirmation(recovery.marker); }}>Review Cancellation</Button>}
   {!recovery.outcome && confirm && <>
    <p>Admin confirmation: if this operation was saved, its result will be returned. Otherwise permanently block this request key. Nothing is automatically re-entered.</p>
    <Button type="button" disabled={recovery.busy} onClick={() => { const expected = confirmation; setConfirmation(null); if (expected) void recovery.cancel(expected); }}>Confirm Resolve or Cancel</Button>
    <Button type="button" variant="outline" disabled={recovery.busy} onClick={() => setConfirmation(null)}>Keep Blocked</Button>
   </>}
   {recovery.outcome && <Button type="button" disabled={recovery.busy} onClick={() => { setConfirmation(null); void recovery.acknowledge(); }}>{recovery.outcome === "COMMITTED" ? "Acknowledge Saved Operation" : "Acknowledge Cancelled Operation"}</Button>}
  </div>}
 </section>;
}
