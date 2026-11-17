import {test,expect} from "vitest";
import {assertCashEvidenceCalendar} from "../../src/server/cash/evidence-calendar";
import {karachiStart,nextDay} from "../../src/server/reports/period";
import {countStillCurrent} from "../../src/server/cash/model";
import {canonical,digest} from "../../src/server/inventory/validation";
import type {AuthorizedTransaction} from "../../src/server/auth/types";
import type {SqlRow} from "../../src/server/db/connection";
test("every evidence endpoint matches independent ICU dates across DST/leaps/eviction and the final corrupt row",()=>{
 const format=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}),days=["2008-06-01","2008-10-31","2009-04-15","2009-11-01","2024-02-29"];
 for(let i=0;i<600;i++)days.push(new Date(Date.UTC(2000,0,1+i*17)).toISOString().slice(0,10));const rows:SqlRow[]=[];
 for(const day of days){const start=karachiStart(day),end=karachiStart(nextDay(day));for(const [a,b]of [[start,start],[start,end-BigInt(1)],[end-BigInt(1),end-BigInt(1)]]){expect(format.format(new Date(Number(a)))).toBe(day);expect(format.format(new Date(Number(b)))).toBe(day);const row={actual_date:day,earliest_at_ms:a,latest_at_ms:b};expect(()=>assertCashEvidenceCalendar([row])).not.toThrow();rows.push(row);}for(const [a,b]of [[start-BigInt(1),start],[start,end]]){expect(format.format(new Date(Number(a)))===day&&format.format(new Date(Number(b)))===day).toBe(false);expect(()=>assertCashEvidenceCalendar([{actual_date:day,earliest_at_ms:a,latest_at_ms:b}])).toThrow();}}
 expect(()=>assertCashEvidenceCalendar(rows)).not.toThrow();expect(()=>assertCashEvidenceCalendar([...rows,{...rows.at(-1)!,latest_at_ms:BigInt("9223372036854775807")}])).toThrow();
});
test.each([BigInt(2),BigInt(3)])("count stability reads exact joined evidence rowid%s without one query per movement",async ordinal=>{
 const original={ordinal:BigInt(1),id:"source",kind:"SALE",cash_date:"2026-11-16",evidence_id:"original",actual_date:"2026-11-16",earliest_at_ms:BigInt(1),latest_at_ms:BigInt(1)},snapshot={cutoffStable:true,calculationCashCutoff:"2",calculationEvidenceCutoff:"2"},asStrings=JSON.parse(JSON.stringify([original],(_,v)=>typeof v==="bigint"?String(v):v));let gets=0;
 const tx:AuthorizedTransaction={get:async sql=>{gets++;if(!sql.includes("AS cash"))throw Error("Unexpected per-movement query");return {cash:BigInt(2),financial:BigInt(0),evidence:BigInt(3)};},all:async(sql,values)=>sql.includes("LIMIT 1000")?(!values||values.length===2?[original]:[]):[{...original,evidence_ordinal:ordinal}],run:async()=>{throw Error("No writes");}};
 const count={cash_cutoff:BigInt(2),evidence_cutoff:BigInt(2),source_digest:digest(asStrings),snapshot_json:canonical(snapshot),snapshot_hash:digest(snapshot)};
 if(ordinal===BigInt(2))await expect(countStillCurrent(tx,count)).resolves.toBeUndefined();else await expect(countStillCurrent(tx,count)).rejects.toThrow();expect(gets).toBe(2);
});