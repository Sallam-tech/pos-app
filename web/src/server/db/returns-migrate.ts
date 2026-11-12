import "server-only";
import {assertDisposableMigrationConnection,executeReviewedReturnsProgram,type SqliteConnection} from "./connection";
import {assertSalesSchemaSnapshot} from "./sales-migrate";
import {reviewedMigrations} from "./reviewed-schema";
import {DatabaseFoundationError} from "./errors";
const stable=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x);
export function applyReturnsMigration37(db:SqliteConnection){
 assertDisposableMigrationConnection(db);
 try{return db.transaction(tx=>{
  const v=tx.get("SELECT user_version FROM pragma_user_version")?.user_version;
  if(v===BigInt(37)){assertSalesSchemaSnapshot(tx,37);return {applied:0,version:BigInt(37)};}
  assertSalesSchemaSnapshot(tx,36);
  if(tx.get("SELECT p.id FROM sale_payments p JOIN sales s ON s.id=p.invoice_id WHERE p.net_received_m<>s.charged_m OR p.recorded_at_ms<>s.recorded_at_ms LIMIT 1"))throw Error("Payment source unavailable.");
  const tables=tx.all("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").map(r=>String(r.name));
  const before=new Map(tables.map(t=>[t,stable(tx.all("SELECT rowid,* FROM "+t+" ORDER BY rowid"))]));
  executeReviewedReturnsProgram(db,tx);
  for(const t of tables){const rows=tx.all("SELECT rowid,* FROM "+t+" ORDER BY rowid").map(r=>{const x={...r};if(t==="stock_movements")delete x.return_disposition_id;return x;});if(stable(rows)!==before.get(t))throw Error("Preservation failed.");}
  if(tx.get("SELECT l.id FROM sale_lines l LEFT JOIN financial_events f ON f.sale_line_id=l.id WHERE f.id IS NULL OR f.revenue_delta_m<>l.charged_m OR f.cogs_delta_m<>l.cogs_m LIMIT 1")||tx.get("SELECT p.id FROM sale_payments p LEFT JOIN cash_movements c ON c.sale_payment_id=p.id WHERE c.id IS NULL OR c.amount_m<>p.net_received_m LIMIT 1"))throw Error("Backfill unavailable.");
  const m=reviewedMigrations()[36];tx.run("INSERT INTO schema_migrations VALUES(?,?,?,?)",[BigInt(37),m.name,m.checksum,BigInt(Date.now())]);tx.setSchemaVersion(BigInt(37));assertSalesSchemaSnapshot(tx,37);
  return {applied:1,version:BigInt(37)};
 });}catch(cause){throw new DatabaseFoundationError("MIGRATION_FAILED","TEST Returns migration failed; no success acknowledged. Inspect state before retry.",cause);}
}
