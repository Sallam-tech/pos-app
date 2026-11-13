import "server-only";
import {assertDisposableMigrationConnection,executeReviewedCashMigration40,type SqlTransaction,type SqliteConnection} from "./connection";
import {assertSalesSchemaSnapshot} from "./sales-migrate";
import {reviewedMigrations} from "./reviewed-schema";
import {DatabaseFoundationError} from "./errors";
const stable=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x);
export function cashMigrationTransaction(tx:SqlTransaction,execute:()=>void){
 if(tx.get("SELECT user_version FROM pragma_user_version")?.user_version===BigInt(40)){assertSalesSchemaSnapshot(tx,40);return {applied:0,version:BigInt(40)};}
 assertSalesSchemaSnapshot(tx,39);
 const tables=tx.all("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").map(r=>String(r.name));
 const before=new Map(tables.map(t=>[t,stable(tx.all("SELECT rowid,* FROM "+t+" ORDER BY rowid"))]));
 execute();
 for(const t of tables){const rows=tx.all("SELECT rowid,* FROM "+t+" ORDER BY rowid").map(r=>{if(t!=="cash_movements")return r;const c={...r};if(c.reconciliation_id!==null)throw Error();delete c.reconciliation_id;return c;});if(stable(rows)!==before.get(t))throw Error("TEST40 source preservation failed: "+t);}
 const m=reviewedMigrations()[39];tx.run("INSERT INTO schema_migrations VALUES(?,?,?,?)",[BigInt(40),m.name,m.checksum,BigInt(Date.now())]);tx.setSchemaVersion(BigInt(40));assertSalesSchemaSnapshot(tx,40);
 return {applied:1,version:BigInt(40)};
}
export function applyCashMigration40(db:SqliteConnection){assertDisposableMigrationConnection(db);try{return executeReviewedCashMigration40(db);}catch(cause){throw new DatabaseFoundationError("MIGRATION_FAILED","TEST40 migration unconfirmed; inspect original state before retry.",cause);}}
