import "server-only";
import {assertDisposableMigrationConnection,executeReviewedInvoiceMigration39,type SqlTransaction,type SqliteConnection} from "./connection";
import {assertSalesSchemaSnapshot} from "./sales-migrate";
import {reviewedMigrations} from "./reviewed-schema";
import {DatabaseFoundationError} from "./errors";
const stable=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x);
export function invoiceMigrationTransaction(tx:SqlTransaction,execute:()=>void){
 if(tx.get("SELECT user_version FROM pragma_user_version")?.user_version===BigInt(39)){assertSalesSchemaSnapshot(tx,39);return {applied:0,version:BigInt(39)};}
 assertSalesSchemaSnapshot(tx,38);
 const tables=tx.all("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").map(r=>String(r.name));
 const before=new Map(tables.map(t=>[t,stable(tx.all("SELECT rowid,* FROM "+t+" ORDER BY rowid"))]));
 execute();
 for(const t of tables){const rows=tx.all("SELECT rowid,* FROM "+t+" ORDER BY rowid").map(r=>{const x={...r};if(t==="stock_movements"||t==="financial_events")delete x.correction_line_id;if(t==="cash_movements")delete x.correction_adjustment_id;if(t==="returns"){delete x.invoice_revision_id;delete x.invoice_settlement_id;}if(t==="return_lines"){if(x.original_line_source_id!==x.sale_line_id||x.revision_line_id!==null)throw Error();delete x.original_line_source_id;delete x.revision_line_id;}if(t==="refund_payments")delete x.invoice_settlement_id;return x;});if(stable(rows)!==before.get(t))throw Error("Old source preservation failed: "+t);}
 const m=reviewedMigrations()[38];tx.run("INSERT INTO schema_migrations VALUES(?,?,?,?)",[BigInt(39),m.name,m.checksum,BigInt(Date.now())]);tx.setSchemaVersion(BigInt(39));assertSalesSchemaSnapshot(tx,39);return {applied:1,version:BigInt(39)};
}
export function applyInvoicesMigration39(db:SqliteConnection){assertDisposableMigrationConnection(db);try{return executeReviewedInvoiceMigration39(db);}catch(cause){throw new DatabaseFoundationError("MIGRATION_FAILED","TEST39 migration failed; inspect original state before retry.",cause);}}
