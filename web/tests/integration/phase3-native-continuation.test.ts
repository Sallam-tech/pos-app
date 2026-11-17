import {beforeAll,test,expect} from "vitest";
import {seed,gateway} from "../helpers/cash-fixture";
import {openAsyncOwner,captureGuardInputs,retainGuardInputs,resumeGuardInputs} from "../../src/server/auth/database";
import {assertReturnLedgers} from "../../src/server/returns/ledgers";
import {readFileSync} from "node:fs";
beforeAll(seed);
test("native continuation preserves private guard identity, expired callback refusal, unknown zero-effect mutation and transaction/rollback isolation",async()=>{
 const f=await gateway();await f.g.close();const o=openAsyncOwner(f.config),owner={},other={};let expired=false;
 try{await expect(o.db.transaction().execute(async()=>{
  o.reserve("ADMIN");const a=o.scope(()=>{if(expired||!o.inTransaction())throw Error("Expired callback");});const point=captureGuardInputs(a,"RETURN")!;expect(point).toBeDefined();await assertReturnLedgers(a);retainGuardInputs(a,"RETURN",point,owner);expired=true;
  expect(()=>resumeGuardInputs(a,"RETURN",owner)).toThrow("Expired callback");
  const b=o.scope(()=>{if(!o.inTransaction())throw Error("Closed transaction");});
  expect(resumeGuardInputs(b,"RETURN",owner)).toBe(true);expect(resumeGuardInputs(b,"RETURN",other)).toBe(false);expect(resumeGuardInputs(b,"EXPENSE",owner)).toBe(false);
  o.run("UPDATE auth_principals SET auth_epoch=auth_epoch WHERE id='missing'");expect(resumeGuardInputs(b,"RETURN",owner)).toBe(false);
  throw Error("INTENTIONAL_ROLLBACK");
 })).rejects.toThrow("INTENTIONAL_ROLLBACK");
 await o.db.transaction().execute(async()=>{o.reserve("ADMIN");const t=o.scope(()=>{if(!o.inTransaction())throw Error();});expect(resumeGuardInputs(t,"RETURN",owner)).toBe(false);expect(captureGuardInputs(t,"RETURN")).toBeDefined();});
 }finally{await o.close();}
},120000);
test("SETTINGS journal includes every Settings table dependency and default command gateway retains full validation",()=>{
 const model=readFileSync("src/server/settings/model.ts","utf8"),journal=readFileSync("src/server/auth/native-input-journal.ts","utf8"),gateway=readFileSync("src/server/auth/gateway.ts","utf8");
 const found=[...model.matchAll(/\b(?:FROM|JOIN)\s+([a-z][a-z0-9_]*)/gi)].map(m=>m[1]).filter(t=>!t.startsWith("pragma_"));
 const set=journal.match(/SETTINGS:new Set\(\[(.*?)\]\)/)![1];expect([...new Set(found)].filter(t=>!set.includes('"'+t+'"'))).toEqual([]);
 expect(gateway).toContain("accountOnly=false");expect(gateway).toContain("accountOnly?assertAccountSettingsLedgers:assertSettingsLedgers");
});
