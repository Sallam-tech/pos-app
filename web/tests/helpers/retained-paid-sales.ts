import {applySettingsMigration41} from "../../src/server/db/settings-migrate";
import {mkdtempSync,openSync,readSync,closeSync} from "node:fs";
import path from "node:path";
import {randomBytes,createHash} from "node:crypto";
import {fixture} from "./inventory-http-fixture";
import {Driver} from "./admin-products-settings-volume";
import {openDatabase} from "../../src/server/db/connection";
import {applySalesMigration36} from "../../src/server/db/sales-migrate";
import {applyReturnsMigration37} from "../../src/server/db/returns-migrate";
import {applyExpensesMigration38} from "../../src/server/db/expenses-migrate";
import {applyInvoicesMigration39} from "../../src/server/db/invoices-migrate";
import {applyCashMigration40} from "../../src/server/db/cash-migrate";
import {digest} from "../../src/server/inventory/validation";
// Disposable synthetic volume construction, never a runtime/customer restore or
// credential reset. Original failed evidence is opened read-only and retained.
export async function importRetainedPaidSales(source:string,onStage:(stage:string)=>void=()=>{},schema:40|41=40){
 source=path.resolve(source);const root=path.resolve("test-results/sqlite-b1b-part1");
 if(!source.startsWith(root+path.sep)||path.basename(source)!=="test.sqlite3")throw Error("Confined synthetic source required");
 onStage("FIXTURE_ENROLLMENT");const before=hash(source),fresh=await fixture(),config={...fresh.config.authorization,sessionLifetimeSeconds:1800,signingSecrets:{ADMIN:randomBytes(48).toString("base64url"),SALESPERSON:randomBytes(48).toString("base64url")}};
 const db=openDatabase(config.database);try{applySalesMigration36(db);applyReturnsMigration37(db);applyExpensesMigration38(db);applyInvoicesMigration39(db);applyCashMigration40(db);}finally{db.close();}
 const snapshot=path.join(mkdtempSync(path.join(root,"retained-sales-copy-")),"source.sqlite3"),original=new Driver(source,{readonly:true,fileMustExist:true});
 try{original.defaultSafeIntegers(true);if(original.prepare("SELECT user_version AS v FROM pragma_user_version").get()?.v!==BigInt(40)||BigInt(String(original.prepare("SELECT count(*) AS n FROM sales").get()?.n))<BigInt(50000)||!original.prepare("SELECT id FROM products WHERE name='SYNTHETIC retained sales capacity'").get())throw Error("Unrecognized synthetic source");onStage("READ_ONLY_SOURCE_COPY");await original.backup(snapshot);}finally{original.close();}
 const raw=new Driver(path.join(config.database.directory,"test.sqlite3"));raw.defaultSafeIntegers(true);let corrected=0;
 try{
  raw.pragma("foreign_keys=ON");raw.pragma("cache_size=-65536");raw.prepare("ATTACH DATABASE ? AS src").run(snapshot);
  const tables=raw.prepare("SELECT name FROM src.sqlite_schema WHERE type='table' AND name NOT LIKE 'auth_%' AND name<>'schema_migrations' AND name NOT GLOB 'sqlite_*'").all().map(r=>String(r.name));
  onStage("COPY_ROWS");raw.transaction(()=>{raw.pragma("defer_foreign_keys=ON");for(const table of tables){
   if(!/^[a-z][a-z0-9_]*$/.test(table)||raw.prepare("SELECT count(*) AS n FROM main."+table).get()?.n!==BigInt(0))throw Error("Fresh empty synthetic destination required");
   const columns=raw.prepare("SELECT name FROM pragma_table_info(?)").all(table).map(r=>String(r.name));
   if(table!=="invoice_snapshots"){raw.exec("INSERT INTO main."+table+"(rowid,"+columns.join(",")+") SELECT rowid,"+columns.join(",")+" FROM src."+table);continue;}
   const insert=raw.prepare("INSERT INTO main.invoice_snapshots(rowid,"+columns.join(",")+") VALUES("+Array(columns.length+1).fill("?").join(",")+")");
   let after=BigInt(0);for(;;){const rows=raw.prepare("SELECT rowid AS ordinal,* FROM src.invoice_snapshots WHERE rowid>? ORDER BY rowid LIMIT 1000").all(after);if(!rows.length)break;for(const row of rows){const expected=digest(JSON.parse(String(row.receipt_json)));if(expected!==row.sha256)corrected++;insert.run(row.ordinal,...columns.map(c=>c==="sha256"?expected:row[c]));}after=BigInt(String(rows.at(-1)!.ordinal));}
  }if(raw.pragma("foreign_key_check").length)throw Error("Synthetic copy FK failure");})();raw.exec("DETACH DATABASE src");onStage("COPY_COMMITTED");
 }finally{raw.close();}
 if(schema===41){onStage("MIGRATE_CLONED_TEST41");const upgraded=openDatabase(config.database);try{applySettingsMigration41(upgraded);}finally{upgraded.close();}}
 if(hash(source)!==before)throw Error("Original failed synthetic source changed");
 onStage("SOURCE_HASH_PRESERVED");return {config,sourceSha256:before,correctedSyntheticSnapshotHashes:corrected};
}
// Fixture hashing stays byte-identical without retaining a whole300MB source
// Buffer in the same process that subsequently measures the HTTPS backend.
function hash(filename:string){const fd=openSync(filename,"r"),buffer=Buffer.alloc(1024*1024),digest=createHash("sha256");try{for(;;){const count=readSync(fd,buffer,0,buffer.length,null);if(!count)break;digest.update(buffer.subarray(0,count));}return digest.digest("hex");}finally{closeSync(fd);}}
