import {beforeAll,afterAll,test,expect} from "vitest";
import {seed,gateway} from "../helpers/admin-products-settings-fixture";
import {validateReviewedSchema} from "../../src/server/db/validate-schema";
import type {SqlRow} from "../../src/server/db/connection";
let f:Awaited<ReturnType<typeof gateway>>;
beforeAll(async()=>{await seed();f=await gateway();});
afterAll(async()=>{await f?.g.close();});
const batchPrefix='SELECT seqno,cid,name,"desc",coll,key FROM pragma_index_xinfo';
test("schema41 checks every real index column in the same admitted snapshot with zero SQL mutations",async()=>{
 await f.g.withAdminTransaction(f.admin,async tx=>{
  const before=await tx.get("SELECT total_changes() AS n"),observed=new Set<string>();let batches=0;
  const result=await validateReviewedSchema({...tx,async all(sql,values){
   const rows=await tx.all(sql,values);
   if(sql.startsWith(batchPrefix)){batches++;observed.add(String(values?.[0]));expect(rows.length).toBeLessThanOrEqual(49);}
   return rows;
  }},41);
  expect(result.ok).toBe(true);
  const actual=await tx.all("SELECT name FROM main.sqlite_schema WHERE type='index'");
  expect(observed).toEqual(new Set(actual.map(v=>String(v.name))));
  expect(batches).toBe(actual.length);
  expect(await tx.get("SELECT total_changes() AS n")).toEqual(before);
 });
});
const mutations:Record<string,(rows:SqlRow[])=>SqlRow[]>={
 missing:rows=>rows.slice(0,-1),
 duplicate:rows=>[...rows,rows.at(-1)!],
 sequence:rows=>rows.map((r,i)=>i===rows.length-1?{...r,seqno:BigInt(99)}:r),
 rowid:rows=>rows.map((r,i)=>i===rows.length-1?{...r,cid:BigInt(99)}:r),
 name:rows=>rows.map((r,i)=>i===rows.length-1?{...r,name:"forged_column"}:r),
 descending:rows=>rows.map((r,i)=>i===rows.length-1?{...r,desc:BigInt(1)}:r),
 collation:rows=>rows.map((r,i)=>i===rows.length-1?{...r,coll:"NOCASE"}:r),
 key:rows=>rows.map((r,i)=>i===rows.length-1?{...r,key:r.key===BigInt(1)?BigInt(0):BigInt(1)}:r),
 oversized:rows=>Array.from({length:1057},()=>rows[0]),
};
test.each(Object.keys(mutations))("schema41 rejects %s in actual index metadata, including the last row",async kind=>{
 await f.g.withAdminTransaction(f.admin,async tx=>{
  // Warm validation cannot confer authority on subsequent reads.
  expect((await validateReviewedSchema(tx,41)).ok).toBe(true);let hit=false;
  const result=await validateReviewedSchema({...tx,async all(sql,values){const rows=await tx.all(sql,values);if(!hit&&sql.startsWith(batchPrefix)){hit=true;return mutations[kind](rows);}return rows;}},41);
  expect(hit).toBe(true);expect(result).toEqual({ok:false,code:"METADATA_MISMATCH"});
 });
});