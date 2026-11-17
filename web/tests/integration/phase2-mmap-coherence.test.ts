import {beforeAll,test,expect} from "vitest";
import {sql} from "kysely";
import path from "node:path";
import {seed,gateway} from "../helpers/cash-fixture";
import {Driver} from "../helpers/admin-products-settings-volume";
import {openAsyncOwner,captureGuardInputs,guardInputsUnchanged,type GuardInputPoint} from "../../src/server/auth/database";
beforeAll(seed);
test("native mapped main/WAL reads see foreign commits/checkpoints, reject concurrent writers and expire transaction proofs",async()=>{
 const f=await gateway();await f.g.close();const owned=openAsyncOwner(f.config),other=new Driver(path.join(f.config.database.directory,"test.sqlite3"),{readonly:false,fileMustExist:true});other.defaultSafeIntegers(true);other.pragma("busy_timeout=1");
 let point:GuardInputPoint|undefined,stale:Parameters<typeof captureGuardInputs>[0]|undefined;
 try{
  expect((await sql.raw("PRAGMA mmap_size").execute(owned.db)).rows).toEqual([{mmap_size:536870912}]);
  const before=owned.get("SELECT auth_epoch FROM auth_principals WHERE id='ADMIN'")!.auth_epoch as bigint;
  await owned.db.transaction().execute(async()=>{
   owned.run("UPDATE auth_principals SET auth_epoch=auth_epoch WHERE id='ADMIN'");
   const tx=owned.scope(()=>{if(!owned.inTransaction())throw Error("Closed");});stale=tx;
   point=captureGuardInputs(tx,"RETURN");expect(point).toBeDefined();
   expect(()=>other.exec("BEGIN IMMEDIATE")).toThrow(/locked|busy/i);
   expect(owned.get("SELECT auth_epoch FROM auth_principals WHERE id='ADMIN'")!.auth_epoch).toBe(before);
   expect(guardInputsUnchanged(tx,"RETURN",point!)).toBe(true);
  });
  expect(()=>guardInputsUnchanged(stale!,"RETURN",point!)).toThrow();
  other.exec("BEGIN IMMEDIATE; UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='ADMIN'; COMMIT");
  expect(owned.get("SELECT auth_epoch FROM auth_principals WHERE id='ADMIN'")!.auth_epoch).toBe(before+BigInt(1));
  other.exec("BEGIN IMMEDIATE; UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='ADMIN'; ROLLBACK");
  expect(owned.get("SELECT auth_epoch FROM auth_principals WHERE id='ADMIN'")!.auth_epoch).toBe(before+BigInt(1));
  other.exec("BEGIN IMMEDIATE; UPDATE auth_principals SET auth_epoch=auth_epoch+1 WHERE id='ADMIN'; COMMIT; PRAGMA wal_checkpoint(FULL)");
  expect(owned.get("SELECT auth_epoch FROM auth_principals WHERE id='ADMIN'")!.auth_epoch).toBe(before+BigInt(2));
 }finally{other.close();await owned.close();}
 const reopened=openAsyncOwner(f.config);try{expect((await sql.raw("PRAGMA mmap_size").execute(reopened.db)).rows).toEqual([{mmap_size:536870912}]);expect(reopened.get("SELECT auth_epoch FROM auth_principals WHERE id='ADMIN'")).toBeDefined();}finally{await reopened.close();}
},120000);
