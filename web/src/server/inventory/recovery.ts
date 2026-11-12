import "server-only";
import type { Actor, AuthorizedTransaction } from "../auth/types";
import type { Kind, RecoveryOutcome } from "./contracts";
import { inventoryRecoveryContext } from "./recovery-context";
import { load, savedResult } from "./model";
import { canonical, digest, now, object, parseCommand, reject, uuid } from "./validation";
export const inventoryKinds: readonly Kind[] = ["CREATE", "EDIT", "SELLING_PRICE", "STATUS", "ARCHIVE", "REPRICE", "RECEIVE", "ADJUST"];
export function inventoryKind(value: unknown): Kind {
 if (typeof value !== "string" || !inventoryKinds.includes(value as Kind)) return reject(); return value as Kind;
}
// Stored metadata is evidence, never caller authority. Require a consistent full
// canonical command/result/event/movement association before acknowledging history.
export async function committedInventoryResult(tx: AuthorizedTransaction, actor: Actor, key: string, kind: Kind) {
 const row = await tx.get("SELECT id,request_key,product_id,kind,actor_id,payload_hash,payload_json,result_json FROM inventory_operations WHERE request_key=?", [key]);
 if (!row || row.kind !== kind || row.actor_id !== actor.principalId || typeof row.payload_json !== "string") return reject("UNAVAILABLE");
 const parsed: unknown = JSON.parse(row.payload_json);
 if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reject("UNAVAILABLE");
 const { kind: savedKind, ...input } = parsed as Record<string, unknown>;
 const command = parseCommand(kind, input), expected = { kind, ...command };
 if (savedKind !== kind || command.requestKey !== key || row.payload_json !== canonical(expected) || row.payload_hash !== digest(expected)) return reject("UNAVAILABLE");
 const result = savedResult(row.result_json);
 if (result.operationId !== row.id || result.product.id !== row.product_id) return reject("UNAVAILABLE");
 const event = await tx.get("SELECT product_id,after_json FROM product_events WHERE operation_id=?", [result.operationId]);
 if (!event || event.product_id !== result.product.id || event.after_json !== canonical(result.product)) return reject("UNAVAILABLE");
 const movements = await tx.all("SELECT id,product_id FROM stock_movements WHERE operation_id=? LIMIT 2", [result.operationId]);
 if (result.movementId === null ? movements.length !== 0 : movements.length !== 1 || movements[0].id !== result.movementId || movements[0].product_id !== result.product.id) return reject("UNAVAILABLE");
 await load(tx, result.product.id); return result;
}
// Called inside the SAME Admin writer reservation. No HTTP/browser identity or
// supplied SQL/session reference can select the authority recorded here.
export async function recoverInventoryOperation(tx: AuthorizedTransaction, actor: Actor, input: unknown, cancel: boolean): Promise<RecoveryOutcome> {
 const o = object(input, cancel ? ["requestKey", "kind", "context", "action"] : ["requestKey", "kind", "context"]);
 const key = uuid(o.requestKey), kind = inventoryKind(o.kind);
 const context = await inventoryRecoveryContext(tx, actor);
 if (o.context !== context || (cancel && o.action !== "RECONCILE_OR_CANCEL")) return reject("UNAVAILABLE");
 const operation = await tx.get("SELECT kind FROM inventory_operations WHERE request_key=?", [key]);
 const cancellation = await tx.get("SELECT context_fingerprint,kind,actor_id FROM inventory_cancellations WHERE request_key=?", [key]);
 if (operation && cancellation) return reject("UNAVAILABLE");
 if (operation) {
  if (operation.kind !== kind) return reject("UNAVAILABLE");
  return { outcome: "COMMITTED", result: await committedInventoryResult(tx, actor, key, kind) };
 }
 if (cancellation) {
  if (cancellation.context_fingerprint !== context || cancellation.kind !== kind || cancellation.actor_id !== actor.principalId) return reject("UNAVAILABLE");
  return { outcome: "CANCELLED" };
 }
 if (!cancel) return reject("NOT_FOUND"); // UNKNOWN; absence never clears a marker.
 await tx.run("INSERT INTO inventory_cancellations(request_key,context_fingerprint,kind,actor_id,actor_session_ref,recorded_at_ms) VALUES(?,?,?,?,?,?)",
  [key, context, kind, actor.principalId, actor.sessionId, now()]);
 return { outcome: "CANCELLED" }; // Gateway confirms COMMIT before publication.
}
