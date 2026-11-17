import {beforeAll,test,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {seed,gateway} from "../helpers/cash-fixture";
import {captureGuardInputs,guardInputsUnchanged,type GuardInputPoint} from "../../src/server/auth/database";
import {assertReturnLedgers,assertReturnLedgersFull} from "../../src/server/returns/ledgers";
import {assertExpenseLedgers,assertExpenseLedgersFull} from "../../src/server/expenses/ledgers";
import {assertSaleCashBindings,assertSaleCashBindingsFull} from "../../src/server/cash/sale-bindings";
import {expenseBinding} from "../../src/server/expenses/authority";
import {canonical,digest} from "../../src/server/inventory/validation";
import type {AuthorizedTransaction} from "../../src/server/auth/types";
beforeAll(seed);
test("genuine reserved native scope journals reviewed INSERT, refuses fake/cross-scope/expired proofs, unknown writes and rollback",async()=>{
 const f=await gateway();let stale:AuthorizedTransaction|undefined,proof:GuardInputPoint|undefined,key:string|undefined;let stage="ENTER",inner:unknown;
 try{
 await f.g.withAdminTransaction(f.admin,async(tx,a)=>{
  try{stage="CAPTURE";stale=tx;proof=captureGuardInputs(tx,"RETURN");expect(proof).toBeDefined();
  expect(captureGuardInputs({get:tx.get,all:tx.all,run:tx.run},"RETURN")).toBeUndefined();
  stage="FULL";await assertReturnLedgersFull(tx);await assertExpenseLedgersFull(tx);await assertSaleCashBindingsFull(tx);
  await assertReturnLedgers(tx);await assertExpenseLedgers(tx);await assertSaleCashBindings(tx);
  stage="INSERT";const b=await expenseBinding(tx,a),payload={businessDate:"2026-10-07",evidence:"TEST journal only, no cash effect"};key=randomUUID();
  await tx.run("INSERT INTO cash_action_requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[key,key,"a".repeat(64),"START_COUNT","ADMIN",a.sessionId,b.credential_version,b.auth_epoch,b.boot,canonical(payload),digest(payload),b.now]);
  expect(guardInputsUnchanged(tx,"RETURN",proof!)).toBe(true);expect(guardInputsUnchanged(tx,"RETURN",proof!,true)).toBe(false);
  expect(guardInputsUnchanged(tx,"EXPENSE",proof!)).toBe(false);
  await assertReturnLedgers(tx);await assertExpenseLedgers(tx);await assertSaleCashBindings(tx);
  stage="FULL";await assertReturnLedgersFull(tx);await assertExpenseLedgersFull(tx);await assertSaleCashBindingsFull(tx);
  await tx.run("UPDATE cash_action_requests SET id=id WHERE id='missing'");
  expect(guardInputsUnchanged(tx,"RETURN",proof!)).toBe(false);expect(captureGuardInputs(tx,"RETURN")).toBeUndefined();}catch(e){inner=e;throw e;}
 });
 expect(()=>guardInputsUnchanged(stale!,"RETURN",proof!)).toThrow();
 await f.g.withAdminTransaction(f.admin,async tx=>{expect(guardInputsUnchanged(tx,"RETURN",proof!)).toBe(false);expect(captureGuardInputs(tx,"RETURN")).toBeDefined();});
 const rollback=randomUUID();
 await expect(f.g.withAdminTransaction(f.admin,async(tx,a)=>{const b=await expenseBinding(tx,a),p={businessDate:"2026-10-07",evidence:"rollback"};captureGuardInputs(tx,"RETURN");await tx.run("INSERT INTO cash_action_requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[rollback,rollback,"a".repeat(64),"START_COUNT","ADMIN",a.sessionId,b.credential_version,b.auth_epoch,b.boot,canonical(p),digest(p),b.now]);throw Error("rollback");})).rejects.toThrow();
 await f.g.withAdminTransaction(f.admin,async tx=>{expect(await tx.get("SELECT id FROM cash_action_requests WHERE id=?",[rollback])).toBeUndefined();expect(await tx.get("SELECT id FROM cash_action_requests WHERE id=?",[key!])).toBeDefined();});
 }catch(error){if(inner)throw new Error("Genuine journal stage "+stage,{cause:inner});throw error;}finally{await f.g.close();}
},120000);
