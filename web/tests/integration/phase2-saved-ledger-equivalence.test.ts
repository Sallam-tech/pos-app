import {test,expect} from "vitest";
import {createRequire} from "node:module";
import {SALE_FINANCIAL_GUARD,SALE_PAYMENT_GUARD} from "../../src/server/returns/ledgers";
import {narrowSavedSaleGuard} from "../../src/server/returns/saved-ledgers";
type Db={exec(sql:string):void;prepare(sql:string):{get(...args:string[]):unknown};close():void};
const Driver=createRequire(import.meta.url)("better-sqlite3") as new(file:string)=>Db;
const faults=["","UPDATE financial_events SET revenue_delta_m=9900 WHERE id=:id","UPDATE financial_events SET effective_date='2020-01-01' WHERE id=:id","DELETE FROM financial_events WHERE id=:id","UPDATE financial_events SET cogs_delta_m=NULL WHERE id=:id","UPDATE sale_payments SET net_received_m=100 WHERE id=:id","DELETE FROM cash_movements WHERE id=:id","UPDATE cash_movements SET amount_m=100 WHERE id=:id","UPDATE cash_movements SET cash_date='2020-01-01' WHERE id=:id","UPDATE cash_movements SET kind=NULL WHERE id=:id"];
test.each([0,1,2].flatMap(index=>faults.map((fault,n)=>({index,fault,n}))))("original/scoped sale-financial predicate equivalence first/middle/last $index fault $n",({index,fault})=>{
 const db=new Driver(":memory:");try{
 db.exec("CREATE TABLE sale_lines(id TEXT,invoice_id TEXT,charged_m INTEGER,cogs_m INTEGER);CREATE TABLE sales(id TEXT,business_date TEXT,recorded_at_ms INTEGER,charged_m INTEGER,operation_id TEXT);CREATE TABLE financial_events(id TEXT,sale_line_id TEXT,kind TEXT,revenue_delta_m INTEGER,cogs_delta_m INTEGER,valuation_delta_m INTEGER,effective_date TEXT,recorded_at_ms INTEGER);CREATE TABLE sale_payments(id TEXT,invoice_id TEXT,net_received_m INTEGER,recorded_at_ms INTEGER);CREATE TABLE cash_movements(id TEXT,sale_payment_id TEXT,kind TEXT,amount_m INTEGER,cash_date TEXT);CREATE TABLE sale_operations(id TEXT,payload_json TEXT)");
 for(let i=0;i<3;i++)db.exec("INSERT INTO sales VALUES('i"+i+"','2026-11-16',1,11000,'o"+i+"');INSERT INTO sale_lines VALUES('l"+i+"','i"+i+"',11000,10000);INSERT INTO financial_events VALUES('x"+i+"','l"+i+"','SALE',11000,10000,0,'2026-11-16',1);INSERT INTO sale_payments VALUES('x"+i+"','i"+i+"',11000,1);INSERT INTO cash_movements VALUES('x"+i+"','x"+i+"','SALE',11000,'2026-11-16');INSERT INTO sale_operations VALUES('o"+i+"','{}')");
 if(fault)db.exec(fault.replaceAll(":id","'x"+index+"'"));
 for(const [query,column]of [[SALE_FINANCIAL_GUARD,"l.invoice_id"],[SALE_PAYMENT_GUARD,"p.invoice_id"]] as const)expect(!!db.prepare(narrowSavedSaleGuard(query,column,1)).get("i"+index)).toBe(!!db.prepare(query).get());
 }finally{db.close();}
});
test("only the two exact original predicates can be narrowed",()=>{expect(()=>narrowSavedSaleGuard("SELECT * FROM sales","l.invoice_id",1)).toThrow();expect(()=>narrowSavedSaleGuard(SALE_FINANCIAL_GUARD,"p.invoice_id",1)).toThrow();});
