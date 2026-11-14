import "server-only";
import { createHash } from "node:crypto";
import type { SqlValue } from "../db/connection";
export type TableProof = Readonly<{ name: string; count: string; maxRowid: string; digest: string }>;
export const SETTINGS_HISTORY_TABLES = ["shop_settings_revisions", "shop_settings_operations", "shop_settings_cancellations", "shop_password_operations", "invoice_shop_snapshots"] as const;
export function rowHasher() {
 const hash=createHash("sha256");let count=BigInt(0),maxRowid=BigInt(0);
 return {
  add(row:Readonly<Record<string,SqlValue>>) {
   const id=row.__proof_rowid;
   if(typeof id!=="bigint"||id<=maxRowid)throw Error("Snapshot row order unavailable.");
   maxRowid=id;
   const encoded=JSON.stringify(Object.entries(row).map(([k,v])=>[k,v===null?["null"]:typeof v==="bigint"?["integer",v.toString()]:typeof v==="string"?["text",v]:v instanceof Uint8Array?["blob",Buffer.from(v).toString("hex")]:(()=>{throw Error("Snapshot scalar unavailable.");})()]));
   hash.update(String(Buffer.byteLength(encoded))).update(":").update(encoded);count++;
  },
  result(name:string):TableProof{return Object.freeze({name,count:count.toString(),maxRowid:maxRowid.toString(),digest:hash.digest("hex")});}
 };
}
