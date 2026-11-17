import {test,expect,beforeAll} from "vitest";
import {sql} from "kysely";
import {createRequire} from "node:module";
import path from "node:path";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {seed,gateway} from "../helpers/cash-fixture";
import {openAsyncOwner,captureGuardInputs,guardInputsUnchanged,type GuardInputPoint} from "../../src/server/auth/database";
import {CASH_TABLES} from "../../src/server/db/cash-manifest";
beforeAll(seed);
test("complete source dependency inventory: every original guard SQL table is named in its journal read set",()=>{
 const source=readFileSync("src/server/auth/native-input-journal.ts","utf8");
 const declarations=ts.createSourceFile("journal.ts",source,ts.ScriptTarget.Latest,true);
 const sets=new Map<string,string[]>();function walk(n:ts.Node){if(ts.isPropertyAssignment(n)&&ts.isIdentifier(n.name)&&["RETURN","EXPENSE","SALE_CASH_BINDINGS","SETTINGS"].includes(n.name.text)&&ts.isNewExpression(n.initializer)){const a=n.initializer.arguments?.[0];if(a&&ts.isArrayLiteralExpression(a))sets.set(n.name.text,a.elements.filter(ts.isStringLiteral).map(x=>x.text));}ts.forEachChild(n,walk);}walk(declarations);
 for(const [guard,files]of [["RETURN",["returns/ledgers.ts","invoices/ledgers.ts"]],["EXPENSE",["expenses/ledgers.ts"]],["SALE_CASH_BINDINGS",["cash/sale-bindings.ts"]],["SETTINGS",["settings/model.ts","cash/sale-bindings.ts"]]] as const){
 const found=new Set<string>();for(const file of files){const ast=ts.createSourceFile(file,readFileSync(path.join("src/server",file),"utf8"),ts.ScriptTarget.Latest,true);function strings(n:ts.Node){if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))for(const m of n.text.matchAll(/\b(?:FROM|JOIN)\s+([a-z][a-z0-9_]*)/gi))if(!["pragma_user_version","line_totals","totals"].includes(m[1]))found.add(m[1]);ts.forEachChild(n,strings);}strings(ast);}
 expect(sets.get(guard)).toBeDefined();expect([...found].filter(t=>!sets.get(guard)!.includes(t))).toEqual([]);
 // The only known write targets have no overlap with ANY complete guard read set.
 expect(CASH_TABLES.filter(t=>["cash_action_requests","cash_action_authorizations","cash_action_operations","cash_count_sessions","cash_counts","cash_anchors","daily_closings","closing_backup_jobs"].includes(t)).some(t=>found.has(t))).toBe(false);
 }
});
test("real native writer contention, unjournalled same-handle mutation, DDL/temporary shadow and rollback invalidate reuse",async()=>{
 const f=await gateway();await f.g.close();const owned=openAsyncOwner(f.config);
 const Driver=createRequire(import.meta.url)("better-sqlite3") as new(filename:string,options:{fileMustExist:true;timeout:number})=>{exec(s:string):void;close():void};
 const other=new Driver(path.join(f.config.database.directory,"test.sqlite3"),{fileMustExist:true,timeout:1});
 let old:GuardInputPoint|undefined;
 try{
 await owned.db.transaction().execute(async()=>{
  owned.run("UPDATE auth_principals SET auth_epoch=auth_epoch WHERE id='ADMIN'");
  let live=true;const tx=owned.scope(()=>{if(!live||!owned.inTransaction())throw Error("Closed native scope");});
  try{
   old=captureGuardInputs(tx,"RETURN");expect(old).toBeDefined();
   expect(()=>other.exec("BEGIN IMMEDIATE")).toThrow(/locked|busy/i);expect(guardInputsUnchanged(tx,"RETURN",old!)).toBe(true);
   owned.run("UPDATE auth_principals SET auth_epoch=auth_epoch WHERE id='ADMIN'");
   expect(guardInputsUnchanged(tx,"RETURN",old!)).toBe(false);
  }finally{live=false;}
 });
 await expect(owned.db.transaction().execute(async connection=>{
  owned.run("UPDATE auth_principals SET auth_epoch=auth_epoch WHERE id='ADMIN'");
  let live=true;const tx=owned.scope(()=>{if(!live||!owned.inTransaction())throw Error("Closed native scope");});
  try{const p=captureGuardInputs(tx,"EXPENSE")!;expect(p).toBeDefined();await sql.raw("CREATE TEMP TABLE journal_probe(id TEXT)").execute(connection);expect(guardInputsUnchanged(tx,"EXPENSE",p)).toBe(false);throw Error("INTENTIONAL_DDL_ROLLBACK");}finally{live=false;}
 })).rejects.toThrow("INTENTIONAL_DDL_ROLLBACK");
 await owned.db.transaction().execute(async()=>{
  owned.run("UPDATE auth_principals SET auth_epoch=auth_epoch WHERE id='ADMIN'");
  const tx=owned.scope(()=>{if(!owned.inTransaction())throw Error("Closed native scope");});
  const p=captureGuardInputs(tx,"EXPENSE");expect(p).toBeDefined();expect(guardInputsUnchanged(tx,"EXPENSE",p!)).toBe(true);expect(guardInputsUnchanged(tx,"EXPENSE",old!)).toBe(false);
 });
 }finally{other.close();await owned.close();}
},120000);
