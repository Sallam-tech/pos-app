import {test,expect} from "vitest";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import ts from "typescript";
import type {SqlRow} from "../../src/server/db/connection";
const Driver=createRequire(import.meta.url)("better-sqlite3") as new(p:string)=>{exec(sql:string):void;prepare(sql:string):{get():SqlRow|undefined};close():void};
const baseline=JSON.parse(readFileSync("tests/helpers/cash-sql-baseline.json","utf8")) as {file:string;before:string}[];
function actual(pair:typeof baseline[number]){
 const source=ts.createSourceFile(pair.file,readFileSync("src/server/"+pair.file,"utf8"),ts.ScriptTarget.Latest,true),queries:string[]=[];
 const visit=(n:ts.Node)=>{if(ts.isVariableDeclaration(n)&&n.initializer&&ts.isStringLiteral(n.initializer))queries.push(n.initializer.text);if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==="bad"&&ts.isStringLiteral(n.arguments[0]))queries.push(n.arguments[0].text);ts.forEachChild(n,visit);};visit(source);
 const selected=pair.file.startsWith("returns")?queries.find(s=>s.startsWith("SELECT l.id FROM sale_lines")):pair.before.includes("e.previous_id")?queries.find(s=>s.startsWith("SELECT e.id FROM cash_flow_evidence e LEFT JOIN")):pair.before.startsWith("SELECT e.id")?queries.find(s=>s.startsWith("SELECT e.id FROM cash_flow_evidence e WHERE e.admission_id")):queries.find(s=>s.includes("o.id=r.recovery_operation_id"));if(!selected)throw Error("Actual guarded SQL not found: "+pair.file+" "+pair.before.slice(0,120));return selected;
}
const pairs=baseline.map(p=>({...p,after:actual(p)}));
function memory(){const db=new Driver(":memory:");db.exec(`
CREATE TABLE sale_lines(id TEXT PRIMARY KEY,invoice_id TEXT,charged_m INTEGER,cogs_m INTEGER);
CREATE TABLE financial_events(id TEXT PRIMARY KEY,sale_line_id TEXT,kind TEXT,revenue_delta_m INTEGER,cogs_delta_m INTEGER,valuation_delta_m INTEGER,effective_date TEXT,recorded_at_ms INTEGER);
CREATE TABLE sales(id TEXT PRIMARY KEY,business_date TEXT,recorded_at_ms INTEGER);
CREATE TABLE cash_flow_evidence(id TEXT PRIMARY KEY,movement_id TEXT,previous_id TEXT,admission_id TEXT,recorded_at_ms INTEGER);
CREATE INDEX cash_evidence_source ON cash_flow_evidence(movement_id,recorded_at_ms,id);
CREATE TABLE counter_cash_admission_resolutions(id TEXT,admission_id TEXT,outcome TEXT,actor_id TEXT,recovery_operation_id TEXT,sale_operation_id TEXT);
CREATE TABLE counter_cash_admissions(id TEXT PRIMARY KEY,source_kind TEXT);
CREATE TABLE cash_action_operations(id TEXT PRIMARY KEY,request_id TEXT,result_json TEXT);
CREATE TABLE cash_action_requests(id TEXT PRIMARY KEY,action TEXT,payload_json TEXT);
CREATE TABLE sale_operations(id TEXT PRIMARY KEY,invoice_id TEXT);
INSERT INTO sales VALUES('invoice','2026-11-16',1);
INSERT INTO sale_lines VALUES('line','invoice',11000,10000);
INSERT INTO financial_events VALUES('event','line','SALE',11000,10000,0,'2026-11-16',1);
INSERT INTO cash_flow_evidence VALUES('root','movement',NULL,'admission',1);
INSERT INTO counter_cash_admissions VALUES('admission','SALE');
INSERT INTO sale_operations VALUES('sale','invoice');
INSERT INTO counter_cash_admission_resolutions VALUES('resolution','admission','POSTED','SALESPERSON',NULL,'sale');
`);return db;}
const mutations=["", "DELETE FROM financial_events", "UPDATE financial_events SET revenue_delta_m=1", "UPDATE sales SET recorded_at_ms=2", "DELETE FROM sales", "DELETE FROM counter_cash_admission_resolutions", "UPDATE counter_cash_admission_resolutions SET outcome='NO_EFFECT'", "DELETE FROM counter_cash_admission_resolutions;INSERT INTO counter_cash_admission_resolutions(admission_id,outcome) VALUES(NULL,'POSTED')", "INSERT INTO cash_flow_evidence VALUES('second','movement',NULL,'admission',2)", "INSERT INTO cash_flow_evidence VALUES('child','other','root','admission',2)", "UPDATE cash_flow_evidence SET previous_id='missing'", "UPDATE cash_flow_evidence SET previous_id='root'", "INSERT INTO cash_flow_evidence VALUES('child','movement','root','admission',2)", "UPDATE counter_cash_admission_resolutions SET actor_id='ADMIN'", "UPDATE counter_cash_admission_resolutions SET recovery_operation_id='missing'", "UPDATE counter_cash_admission_resolutions SET actor_id='ADMIN',recovery_operation_id='cash';INSERT INTO cash_action_operations VALUES('cash','request','{\"invoiceId\":\"invoice\"}');INSERT INTO cash_action_requests VALUES('request','RESOLVE_ADMISSION','{\"resolution\":\"RECORD_PRIOR_SALE\",\"admissionId\":\"admission\"}')"];
test.each(mutations.map((sql,index)=>({sql,index})))("actual query predicates remain equivalent for boundary/fault case$index",({sql})=>{
 const db=memory();try{if(sql)db.exec(sql);for(const pair of pairs)expect(!!db.prepare(pair.after).get(),pair.file+" "+pair.before.slice(0,50)).toBe(!!db.prepare(pair.before).get());}finally{db.close();}
});