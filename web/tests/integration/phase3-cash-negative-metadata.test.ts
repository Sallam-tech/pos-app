import {beforeAll,test,expect} from "vitest";
import {randomUUID,createHash} from "node:crypto";
import {createRequire} from "node:module";
import path from "node:path";
import {seed,gateway} from "../helpers/cash-fixture";
import {expenseBinding} from "../../src/server/expenses/authority";

import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {canonical} from "../../src/server/inventory/validation";
import type {SqlValue} from "../../src/server/db/connection";
const Driver=createRequire(import.meta.url)("better-sqlite3") as new(p:string)=>{exec(s:string):void;prepare(s:string):{get():{sql:string}|undefined;run(...v:SqlValue[]):unknown};close():void};
beforeAll(seed);
test.each([BigInt("-5"),BigInt("0")])("full reviewed admission refuses corrupt nonpositive physical rowid %s before exposing a gateway",async rowid=>{
 const f=await gateway(),key=randomUUID();let values:SqlValue[]=[];
 await f.g.withAdminTransaction(f.admin,async(tx,a)=>{const b=await expenseBinding(tx,a);values=[rowid,key,key,"a".repeat(64),"START_COUNT","ADMIN",a.sessionId,b.credential_version,b.auth_epoch,b.boot,canonical({businessDate:"2026-10-07",evidence:"Disposable negative-rowid hash fault"}),"0".repeat(64),b.now];});
 await f.g.close();
 // Only this newly generated disposable fixture is changed. Restore the exact
 // pinned identity trigger before opening a genuine gateway; no product bypass.
 const db=new Driver(path.join(f.config.database.directory,"test.sqlite3")),name="cash_action_requests_positive_rowid",original=db.prepare("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='"+name+"'").get()!.sql;
 try{db.exec("BEGIN IMMEDIATE");db.exec("DROP TRIGGER "+name);db.prepare("INSERT INTO cash_action_requests(rowid,id,request_key,context,action,actor_id,session_ref,credential_version,auth_epoch,boot_generation,payload_json,payload_hash,recorded_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(...values);db.exec(original);expect(createHash("sha256").update(db.prepare("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='"+name+"'").get()!.sql).digest("hex")).toBe(createHash("sha256").update(original).digest("hex"));db.exec("COMMIT");}finally{db.close();}
 await expect(openAuthorizationGateway(f.config,40)).rejects.toThrow();
});
