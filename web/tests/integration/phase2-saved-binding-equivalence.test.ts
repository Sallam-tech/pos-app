import {test,expect} from "vitest";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
import {assertSavedSaleCashBindings} from "../../src/server/cash/saved-sale-bindings";
import {assertSaleCashBindingsFull} from "../../src/server/cash/sale-bindings";
import {cashSaleIntentHash} from "../../src/server/cash/sale-intent";
import {canonical,digest} from "../../src/server/inventory/validation";
import type {AuthorizedTransaction} from "../../src/server/auth/types";
import type {SqlRow,SqlValue} from "../../src/server/db/connection";
type Db={defaultSafeIntegers(v:boolean):void;exec(s:string):void;prepare(s:string):{get(...v:readonly SqlValue[]):SqlRow|undefined;all(...v:readonly SqlValue[]):SqlRow[];run(...v:readonly SqlValue[]):unknown};close():void};
const Driver=createRequire(import.meta.url)("better-sqlite3") as new(f:string)=>Db;
const faults=["","UPDATE counter_cash_admissions SET payload_hash='bad' WHERE id=:id","UPDATE counter_cash_admissions SET payload_digest='bad' WHERE id=:id","UPDATE counter_cash_admissions SET payload_json='{}' WHERE id=:id","UPDATE sale_operations SET payload_json='{}' WHERE id=:op","UPDATE counter_cash_admission_resolutions SET sale_operation_id=NULL WHERE admission_id=:id","UPDATE counter_cash_admission_resolutions SET sale_operation_id='missing' WHERE admission_id=:id","UPDATE counter_cash_admissions SET source_key='wrong' WHERE id=:id","UPDATE counter_cash_admissions SET source_kind='REFUND',payload_hash='bad' WHERE id=:id","UPDATE counter_cash_admissions SET source_kind=NULL,payload_hash='bad' WHERE id=:id","UPDATE counter_cash_admission_resolutions SET outcome=NULL WHERE admission_id=:id","UPDATE sale_operations SET request_key=NULL WHERE id=:op","UPDATE counter_cash_admission_resolutions SET sale_operation_id='o2' WHERE admission_id=:id"];
test.each([0,1,2].flatMap(index=>faults.map((fault,n)=>({index,fault,n}))))("saved binding differential for first/middle/last $index fault $n",async({index,fault})=>{
 const db=new Driver(":memory:");db.defaultSafeIntegers(true);
 try{
 db.exec("CREATE TABLE counter_cash_admissions(id TEXT,source_kind TEXT,source_key TEXT,payload_hash TEXT,payload_json TEXT,payload_digest TEXT);CREATE TABLE counter_cash_admission_resolutions(id TEXT,admission_id TEXT,outcome TEXT,sale_operation_id TEXT);CREATE TABLE sale_operations(id TEXT,request_key TEXT,payload_json TEXT,invoice_id TEXT);CREATE TABLE sale_payments(id TEXT,invoice_id TEXT);CREATE TABLE cash_movements(id TEXT,sale_payment_id TEXT);CREATE TABLE cash_flow_evidence(admission_id TEXT,movement_id TEXT);");
 for(let i=0;i<3;i++){const intent={requestKey:randomUUID(),context:randomUUID(),lines:[{productId:randomUUID(),quantity:"1",unitPricePaisa:"11000",discountPercent:"0"}],customerName:"TEST",customerPhone:""},payload={intent,shopName:"TEST SHOP"};
 db.prepare("INSERT INTO counter_cash_admissions VALUES(?,?,?,?,?,?)").run("a"+i,"SALE",intent.requestKey,cashSaleIntentHash(intent),canonical(payload),digest(payload));db.prepare("INSERT INTO sale_operations VALUES(?,?,?,?)").run("o"+i,intent.requestKey,canonical({...intent,cashPaisa:"11000",cashDate:"2026-11-16"}),"i"+i);
 db.exec("INSERT INTO counter_cash_admission_resolutions VALUES('r"+i+"','a"+i+"','POSTED','o"+i+"');INSERT INTO sale_payments VALUES('p"+i+"','i"+i+"');INSERT INTO cash_movements VALUES('m"+i+"','p"+i+"');INSERT INTO cash_flow_evidence VALUES('a"+i+"','m"+i+"');");
 }
 if(fault)db.exec(fault.replaceAll(":id","'a"+index+"'").replaceAll(":op","'o"+index+"'"));
 const tx:AuthorizedTransaction={get:async(q,v=[])=>db.prepare(q).get(...v),all:async(q,v=[])=>db.prepare(q).all(...v),run:async()=>{throw Error("No writes");}},ok=async(work:()=>Promise<void>)=>{try{await work();return true;}catch(error){if(!fault)throw error;return false;}};
 expect(await ok(()=>assertSavedSaleCashBindings(tx,["i"+index]))).toBe(await ok(()=>assertSaleCashBindingsFull(tx)));
 }finally{db.close();}
});
test("explicit unrelated SALE fault timing tradeoff, while key/operation/evidence each independently retain a relevant admission",async()=>{
 const db=new Driver(":memory:");db.defaultSafeIntegers(true);
 try{
 db.exec("CREATE TABLE counter_cash_admissions(id TEXT,source_kind TEXT,source_key TEXT,payload_hash TEXT,payload_json TEXT,payload_digest TEXT);CREATE TABLE counter_cash_admission_resolutions(id TEXT,admission_id TEXT,outcome TEXT,sale_operation_id TEXT);CREATE TABLE sale_operations(id TEXT,request_key TEXT,payload_json TEXT,invoice_id TEXT);CREATE TABLE sale_payments(id TEXT,invoice_id TEXT);CREATE TABLE cash_movements(id TEXT,sale_payment_id TEXT);CREATE TABLE cash_flow_evidence(admission_id TEXT,movement_id TEXT);INSERT INTO counter_cash_admissions VALUES('bad','SALE','unknown','bad','{}','bad');");
 const tx:AuthorizedTransaction={get:async(q,v=[])=>db.prepare(q).get(...v),all:async(q,v=[])=>db.prepare(q).all(...v),run:async()=>{throw Error("No writes");}};
 await expect(assertSavedSaleCashBindings(tx,["i"])).resolves.toBeUndefined();await expect(assertSaleCashBindingsFull(tx)).rejects.toThrow();
 db.exec("INSERT INTO sale_operations VALUES('o','unknown','{}','i')");
 await expect(assertSavedSaleCashBindings(tx,["i"])).rejects.toThrow();
 db.exec("UPDATE sale_operations SET request_key='different';INSERT INTO counter_cash_admission_resolutions VALUES('r','bad','POSTED','o')");
 await expect(assertSavedSaleCashBindings(tx,["i"])).rejects.toThrow();
 db.exec("DELETE FROM counter_cash_admission_resolutions;INSERT INTO sale_payments VALUES('p','i');INSERT INTO cash_movements VALUES('m','p');INSERT INTO cash_flow_evidence VALUES('bad','m')");
 await expect(assertSavedSaleCashBindings(tx,["i"])).rejects.toThrow();
 }finally{db.close();}
});
