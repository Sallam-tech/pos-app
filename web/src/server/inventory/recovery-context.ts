import "server-only";
import { createHash } from "node:crypto";
import { authorizedFileNamespace } from "../auth/database";
import type { Actor, AuthorizedTransaction } from "../auth/types";
// Called only INSIDE the already authenticated, exact-schema35 gateway transaction (immutable18 namespace baseline preserved).
// No session, credential version or bearer enters this stable operational namespace.
// This is not enrollment authority, backup lineage or protection from disk rollback.
export async function inventoryRecoveryContext(tx: AuthorizedTransaction, actor: Actor): Promise<string> {
 if (actor.role !== "ADMIN" || actor.principalId !== "ADMIN") throw Error("Inventory unavailable.");
 const file = authorizedFileNamespace(tx);
 const row = await tx.get("SELECT p.format_version,p.completed_at_ms,a.provisioned_at_ms FROM auth_provisioning p JOIN auth_principals a ON a.id=p.admin_id WHERE p.id=1 AND p.admin_id='ADMIN' AND p.salesperson_id='SALESPERSON' AND a.active=1");
 const migration = await tx.get("SELECT checksum FROM schema_migrations WHERE version=18");
 if (!row || row.format_version !== BigInt(1) || typeof row.completed_at_ms !== "bigint" || row.completed_at_ms <= BigInt(0) ||
     typeof row.provisioned_at_ms !== "bigint" || row.provisioned_at_ms <= BigInt(0) || typeof migration?.checksum !== "string") throw Error("Inventory unavailable.");
 const value = createHash("sha256").update(JSON.stringify(["pos-test-inventory-admin-context-v1", file,
   migration.checksum, row.format_version.toString(), row.completed_at_ms.toString(), row.provisioned_at_ms.toString(), "ADMIN"])).digest("hex");
 authorizedFileNamespace(tx); return value;
}
