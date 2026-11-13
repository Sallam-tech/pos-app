import "server-only";
import {assertDisposableMigrationConnection,executeReviewedSettingsMigration41,type SqlTransaction,type SqliteConnection} from "./connection";
import {assertSalesSchemaSnapshot} from "./sales-migrate";
import {reviewedMigrations} from "./reviewed-schema";
import {DatabaseFoundationError} from "./errors";
const stable=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x);
export function settingsMigrationTransaction(tx:SqlTransaction,execute:()=>void){
 if(tx.get("SELECT user_version FROM pragma_user_version")?.user_version===BigInt(41)){assertSalesSchemaSnapshot(tx,41);return {applied:0,version:BigInt(41)};}
 assertSalesSchemaSnapshot(tx,40);
 const tables=tx.all("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").map(r=>String(r.name));
 const before=new Map(tables.map(t=>[t,stable(tx.all("SELECT rowid,* FROM "+t+" ORDER BY rowid"))]));
 execute();for(const t of tables)if(stable(tx.all("SELECT rowid,* FROM "+t+" ORDER BY rowid"))!==before.get(t))throw Error("TEST41 source preservation failed.");
 const m=reviewedMigrations()[40];tx.run("INSERT INTO schema_migrations VALUES(?,?,?,?)",[BigInt(41),m.name,m.checksum,BigInt(Date.now())]);tx.setSchemaVersion(BigInt(41));assertSalesSchemaSnapshot(tx,41);return {applied:1,version:BigInt(41)};
}
export function applySettingsMigration41(db:SqliteConnection){assertDisposableMigrationConnection(db);try{return executeReviewedSettingsMigration41(db);}catch(cause){throw new DatabaseFoundationError("MIGRATION_FAILED","TEST41 migration unconfirmed; inspect original state before retry.",cause);}}
