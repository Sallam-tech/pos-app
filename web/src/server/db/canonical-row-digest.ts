import "server-only";
import {createHash} from "node:crypto";
import type {AuthorizedTransaction} from "../auth/types";
// Exact SHA256(canonical(asStrings(all rows))) without materializing two complete
// books. Every row/column participates, in the original order and same snapshot.
export async function digestSqlRows(page:(after:bigint|null)=>Promise<Awaited<ReturnType<AuthorizedTransaction["all"]>>>,cursorColumn:string){
 const hash=createHash("sha256");hash.update("[");let after:bigint|null=null,first=true;
 // Reuse only the scalar column encoding layout, never data or a verified result.
 // Object.fromEntries retains JSON's numeric-key ordering, including legacy names.
 let shape:string[]=[],columns:string[]=[],prefixes:string[]=[];
 for(;;){const rows=await page(after);if(!rows.length)break;if(rows.length>1000)throw Error("Digest page unavailable.");
  const chunks:string[]=[];
  for(const row of rows){const cursor=row[cursorColumn];if(typeof cursor!=="bigint"||(after!==null&&cursor<=after))throw Error("Digest order unavailable.");after=cursor;
   const keys=Object.keys(row);
   if(keys.length!==shape.length||keys.some((key,i)=>key!==shape[i])){
    shape=keys;columns=Object.keys(Object.fromEntries([...keys].sort().map(key=>[key,null])));prefixes=columns.map(key=>JSON.stringify(key)+":");
   }
   const fields:string[]=[];
   for(let i=0;i<columns.length;i++){
    const value=row[columns[i]];
    if(value!==null&&typeof value!=="string"&&typeof value!=="bigint")throw Error("Digest scalar unavailable.");
    const encoded=value===null?"null":typeof value==="bigint"?'"'+value.toString()+'"':/["\\\u0000-\u001f\ud800-\udfff]/.test(value)?JSON.stringify(value):'"'+value+'"';
    fields.push(prefixes[i]+encoded);
   }
   chunks.push((first?"":",")+"{"+fields.join(",")+"}");first=false;
  }
  hash.update(chunks.join(""));
 }
 return hash.update("]").digest("hex");
}