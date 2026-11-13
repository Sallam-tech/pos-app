import {CASH_AUTO,CASH_INDEXES,CASH_TABLES} from "./cash-manifest";
import {cashObjects} from "./cash-program";
import {INVOICE_AUTO,INVOICE_INDEXES,INVOICE_TABLES,invoicesObjects} from "./invoices-program";
import "server-only";
import {EXPENSE_AUTO,EXPENSE_INDEXES,EXPENSE_TABLES,expensesObjects} from "./expenses-program";
import { RETURN_AUTO,RETURN_INDEXES,RETURN_TABLES,returnsObjects } from "./returns-program";
import { assertDisposableMigrationConnection,executeReviewedSalesProgram,type SqliteConnection,type SqlTransaction } from "./connection";
import { AUTO_INDEXES,EXPLICIT_INDEXES,HISTORY_DEFINITION,reviewedMigrations,STATISTICS_DEFINITIONS } from "./reviewed-schema";
import { SALES_AUTO,SALES_INDEXES,salesObjects,SALES_TABLES } from "./sales-program";
import { schemaTokens } from "./schema-sql";
import { storedTriggerSql } from "./inventory-trigger-policy";
import { DatabaseFoundationError } from "./errors";
export function assertSalesSchemaSnapshot(tx:SqlTransaction,version:35|36|37|38|39|40){
 const databases=tx.all("SELECT name FROM pragma_database_list LIMIT 4");if(databases.length>2||databases.some(r=>r.name!=="main"&&r.name!=="temp")||(databases.some(r=>r.name==="temp")&&tx.all("SELECT name FROM temp.sqlite_schema LIMIT 1").length))throw Error("Ambiguous schema scope.");
 const history=reviewedMigrations().slice(0,version),objects=new Map<string,{type:string;table:string;sql:string|null}>();
 objects.set("schema_migrations",{type:"table",table:"schema_migrations",sql:HISTORY_DEFINITION});
 for(const m of history)if(m.objectType!=="program")objects.set(m.objectName,{type:m.objectType,table:m.objectTable,sql:m.sql});
 if(version>=36)for(const [n,v]of salesObjects())objects.set(n,v);
 if(version>=37)for(const [n,v]of returnsObjects())objects.set(n,v);
 if(version>=38)for(const[n,v]of expensesObjects())objects.set(n,v);
 if(version>=39)for(const[n,v]of invoicesObjects())objects.set(n,v);
 if(version===40)for(const[n,v]of cashObjects())objects.set(n,v);
 const auto:Record<string,readonly(readonly string[])[]>={...AUTO_INDEXES,...(version>=36?SALES_AUTO:{}),...(version>=37?RETURN_AUTO:{}),...(version>=38?EXPENSE_AUTO:{}),...(version>=39?INVOICE_AUTO:{}),...(version===40?CASH_AUTO:{})};
 const explicit:Record<string,{table:string;columns:readonly string[];unique:bigint;partial:bigint}>={...EXPLICIT_INDEXES,...(version>=36?SALES_INDEXES:{}),...(version>=37?RETURN_INDEXES:{}),...(version>=38?EXPENSE_INDEXES:{}),...(version>=39?INVOICE_INDEXES:{}),...(version===40?CASH_INDEXES:{})};
 const indices=new Map<string,{table:string;columns:readonly string[];origin:string;unique:bigint;partial:bigint}>();
 for(const[n,v]of Object.entries(explicit))if(objects.has(n))indices.set(n,{...v,origin:"c"});
 for(const [table,defs]of Object.entries(auto))if(objects.has(table))defs.forEach(([origin,...cols],i)=>{const n="sqlite_autoindex_"+table+"_"+(i+1);objects.set(n,{type:"index",table,sql:null});indices.set(n,{table,columns:cols,origin,unique:BigInt(1),partial:BigInt(0)});});
 const actual=tx.all("SELECT type,name,tbl_name,sql FROM main.sqlite_schema LIMIT "+(version===40?769:version>=39?513:version>=37?385:129));if(actual.length>(version===40?768:version>=39?512:version>=37?384:128))throw Error();
 const seen=new Set<string>();
 for(const r of actual){
  const n=String(r.name);let e=objects.get(n);
  if(!e&&Object.hasOwn(STATISTICS_DEFINITIONS,n))e={type:"table",table:n,sql:STATISTICS_DEFINITIONS[n as keyof typeof STATISTICS_DEFINITIONS]};
  if(!e||seen.has(n)||r.type!==e.type||r.tbl_name!==e.table)throw Error();seen.add(n);
  if(e.sql===null?r.sql!==null:typeof r.sql!=="string"||(e.type==="trigger"?storedTriggerSql(r.sql)!==storedTriggerSql(e.sql):schemaTokens(r.sql)!==schemaTokens(e.sql)))throw Error();
  if(e.type==="table"&&!n.startsWith("sqlite_")&&tx.get("SELECT strict FROM pragma_table_list WHERE schema='main' AND name=?",[n])?.strict!==BigInt(1))throw Error();
 }
 for(const n of objects.keys())if(!seen.has(n))throw Error("Missing reviewed object: "+n);
 for(const [n,i]of indices){
  const list=tx.all("SELECT name,origin,\"unique\",partial FROM pragma_index_list(?)",[i.table]),v=list.find(r=>r.name===n);
  if(!v||v.origin!==i.origin||v.unique!==i.unique||v.partial!==i.partial)throw Error("Index metadata: "+n);
  const cols=tx.all("SELECT name FROM pragma_index_info(?) ORDER BY seqno",[n]);if(cols.length!==i.columns.length||cols.some((c,j)=>c.name!==i.columns[j]))throw Error("Index columns: "+n);
 }
 const rows=tx.all("SELECT version,name,checksum,applied_at FROM schema_migrations ORDER BY version LIMIT 40");
 if(rows.length!==history.length||rows.some((r,i)=>r.version!==history[i].version||r.name!==history[i].name||r.checksum!==history[i].checksum||typeof r.applied_at!=="bigint"||r.applied_at<=BigInt(0))||tx.get("SELECT user_version FROM pragma_user_version")?.user_version!==BigInt(version))throw Error();
 for(const table of ["inventory_operations","stock_movements","product_events","inventory_cancellations",...(version>=36?SALES_TABLES:[]),...(version>=37?RETURN_TABLES:[]),...(version>=38?EXPENSE_TABLES:[]),...(version>=39?INVOICE_TABLES:[]),...(version===40?CASH_TABLES:[])])if(tx.get("SELECT rowid FROM "+table+" WHERE rowid<=0 LIMIT 1"))throw Error();
 if(tx.get("SELECT p.id FROM products p LEFT JOIN stock_balances b ON b.product_id=p.id WHERE b.product_id IS NULL OR b.cost_m<>p.current_cost_m OR b.sellable_q<>(SELECT coalesce(sum(delta_q),0) FROM stock_movements WHERE product_id=p.id) OR EXISTS(SELECT 1 FROM (SELECT before_q,lag(after_q,1,0) OVER(ORDER BY balance_version) AS previous FROM stock_movements WHERE product_id=p.id) WHERE before_q<>previous) OR NOT EXISTS(SELECT 1 FROM inventory_operations o WHERE o.id=b.opening_operation_id AND o.product_id=p.id AND o.kind='CREATE') LIMIT 1"))throw Error("Inventory conservation unavailable.");
 if(tx.all("SELECT * FROM pragma_foreign_key_check").length||tx.get("SELECT * FROM pragma_integrity_check")?.integrity_check!=="ok")throw Error();
}
const stable=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x);
// Explicit owner-approved TEST maintenance only. No startup/import migration.
export function applySalesMigration36(connection:SqliteConnection){
 assertDisposableMigrationConnection(connection);
 try{return connection.transaction(tx=>{
  if(tx.get("SELECT user_version FROM pragma_user_version")?.user_version===BigInt(36)){assertSalesSchemaSnapshot(tx,36);return {applied:0,version:BigInt(36)};}
  assertSalesSchemaSnapshot(tx,35);
  const tables=tx.all("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").map(r=>String(r.name));
  const before=new Map(tables.map(t=>[t,stable(tx.all("SELECT rowid,* FROM "+t+" ORDER BY rowid"))]));
  executeReviewedSalesProgram(connection,tx);
  for(const table of tables){const rows=tx.all("SELECT rowid,* FROM "+table+" ORDER BY rowid").map(r=>{if(table!=="stock_movements")return r;const copy={...r};delete copy.sale_line_id;return copy;});if(stable(rows)!==before.get(table))throw Error("Preservation failed.");}
  const migration=reviewedMigrations()[35];tx.run("INSERT INTO schema_migrations VALUES(?,?,?,?)",[BigInt(36),migration.name,migration.checksum,BigInt(Date.now())]);tx.setSchemaVersion(BigInt(36));assertSalesSchemaSnapshot(tx,36);
  return {applied:1,version:BigInt(36)};
 });}catch(cause){throw new DatabaseFoundationError("MIGRATION_FAILED","TEST Sales migration failed; no success acknowledged. Inspect state before retry.",cause);}
}
