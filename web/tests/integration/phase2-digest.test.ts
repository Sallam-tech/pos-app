import {test,expect} from "vitest";
import {createHash} from "node:crypto";
import {writeFileSync} from "node:fs";
import {digestSqlRows} from "../../src/server/db/canonical-row-digest";
import {canonical} from "../../src/server/inventory/validation";
import type {SqlRow} from "../../src/server/db/connection";
const oracle=(rows:SqlRow[])=>createHash("sha256").update(canonical(JSON.parse(JSON.stringify(rows,(_,v)=>typeof v==="bigint"?v.toString():v)))).digest("hex");
const pages=(rows:SqlRow[])=>async(after:bigint|null)=>rows.filter(row=>after===null||(row.ordinal as bigint)>after).slice(0,1000);
test("flat encoder preserves exact historical JSON/SHA across changing shapes, numeric keys, null, Unicode and int64 limits",async()=>{
 const rows:SqlRow[]=[];
 for(let i=1;i<=2501;i++)rows.push(i%2?{ordinal:BigInt(i),z:null,amount:BigInt("-9223372036854775808"),text:'quote "\\\n 💰 اردو',["__proto__"]:"safe","10":"ten","2":"two","01":"leading"}:{amount:BigInt("9223372036854775807"),ordinal:BigInt(i),text:"ÄPFEL",extra:"column",["4294967295"]:"large"});
 expect(await digestSqlRows(pages(rows),"ordinal")).toBe(oracle(rows));
 expect(await digestSqlRows(async()=>[],"ordinal")).toBe(oracle([]));
 const changed=rows.map((r,i)=>i===rows.length-1?{...r,text:"tampered last row"}:r);
 expect(await digestSqlRows(pages(changed),"ordinal")).not.toBe(oracle(rows));
});
test("encoder rejects REAL/blob/undefined scalars, non-increasing rows and oversized pages",async()=>{
 for(const value of [1,NaN,undefined,new Uint8Array([1])])await expect(digestSqlRows(async()=>[{ordinal:BigInt(1),value} as unknown as SqlRow],"ordinal")).rejects.toThrow();
 await expect(digestSqlRows(async()=>[{ordinal:BigInt(2)},{ordinal:BigInt(1)}],"ordinal")).rejects.toThrow();
 await expect(digestSqlRows(async()=>Array.from({length:1001},(_,i)=>({ordinal:BigInt(i+1)})),"ordinal")).rejects.toThrow();
});
async function referenceDigest(page:ReturnType<typeof pages>){
 const hash=createHash("sha256");hash.update("[");let after=BigInt(0),first=true;
 for(;;){const rows=await page(after);if(!rows.length)break;
  for(const row of rows){after=row.ordinal as bigint;const value=Object.fromEntries(Object.entries(row).map(([key,v])=>[key,typeof v==="bigint"?v.toString():v]));if(!first)hash.update(",");first=false;hash.update(canonical(value));}
 }
 return hash.update("]").digest("hex");
}
test("same-input 50k encoder measurement verifies every byte against the original serializer",async()=>{
 const rows:SqlRow[]=Array.from({length:50000},(_,i)=>({ordinal:BigInt(i+1),id:"test-"+i,kind:"EXPENSE",amount_m:BigInt(10000),cash_date:"2026-11-15",recorded_at_ms:BigInt(1794700000000+i),provenance:"TEST",expense_revision_id:"revision-"+i,sale_payment_id:null,refund_payment_id:null,correction_adjustment_id:null}));
 const t=performance.now(),expected=await referenceDigest(pages(rows)),beforeMs=performance.now()-t;
 const p=performance.now(),actual=await digestSqlRows(pages(rows),"ordinal"),afterMs=performance.now()-p;
 expect(actual).toBe(expected);
 writeFileSync("test-results/phase2-integration-20261115/digest-comparison.json",JSON.stringify({records:rows.length,beforeMs,afterMs,identicalHash:true,syntheticEncoderOnly:true,targetHardwareAcceptance:false}));
},90000);
