import "server-only";
import {createHash} from "node:crypto";
import type {AuthorizedTransaction} from "../auth/types";
import {canonical} from "../inventory/validation";
// Exact SHA256(canonical(asStrings(all rows))) without materializing two complete
// books. Every row/column participates, in the original order and same snapshot.
export async function digestSqlRows(page:(after:bigint)=>Promise<Awaited<ReturnType<AuthorizedTransaction["all"]>>>,cursorColumn:string){
 const hash=createHash("sha256");hash.update("[");let after=BigInt(0),first=true;
 for(;;){const rows=await page(after);if(!rows.length)break;if(rows.length>1000)throw Error("Digest page unavailable.");
  for(const row of rows){const cursor=row[cursorColumn];if(typeof cursor!=="bigint"||cursor<=after)throw Error("Digest order unavailable.");after=cursor;
   const value=Object.fromEntries(Object.entries(row).map(([key,v])=>{if(v!==null&&typeof v!=="string"&&typeof v!=="bigint")throw Error("Digest scalar unavailable.");return [key,typeof v==="bigint"?v.toString():v];}));
   if(!first)hash.update(",");first=false;hash.update(canonical(value));
  }
 }
 return hash.update("]").digest("hex");
}
