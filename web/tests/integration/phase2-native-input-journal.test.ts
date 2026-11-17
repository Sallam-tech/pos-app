import {test,expect} from "vitest";
import {createNativeInputJournal,type NativeInputFacts} from "../../src/server/auth/native-input-journal";
const sql="INSERT INTO cash_action_requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?)";
function setup(review=true){
 let facts:NativeInputFacts={changes:BigInt(0),schema:BigInt(41),tempSchema:BigInt(0),identity:"original",generation:{}};
 const journal=createNativeInputJournal(()=>facts,()=>review),change=(patch:Partial<NativeInputFacts>)=>{facts={...facts,...patch};};
 return {journal,change,get facts(){return facts;},write(text=sql,actual=BigInt(1),reported=actual){return journal.mutate(text,()=>{change({changes:facts.changes+actual});return {changes:reported};},()=>true);}};
}
test("each real mutation is recorded and checked per guard; proof has no registration or authorization",()=>{
 const f=setup(),p=f.journal.capture("RETURN")!;expect(f.journal.unchanged(p,"RETURN")).toBe(true);
 f.write();expect(f.journal.unchanged(p,"RETURN")).toBe(true);expect(f.journal.unchanged(p,"EXPENSE")).toBe(false);expect(f.journal.unchanged(p,"RETURN",true)).toBe(false);
 expect(f.journal.unchanged({},"RETURN")).toBe(false);expect(setup().journal.unchanged(p,"RETURN")).toBe(false);
});
test.each(["UPDATE sales SET charged_m=charged_m","INSERT INTO cash_action_requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?);","/* hidden */ "+sql])("unknown SQL disables every guard: %s",s=>{
 const f=setup(),p=f.journal.capture("SALE_CASH_BINDINGS")!;f.write(s);expect(f.journal.unchanged(p,"SALE_CASH_BINDINGS")).toBe(false);expect(f.journal.capture("RETURN")).toBeUndefined();
});
test.each(["schema","tempSchema","identity","generation","changes"] as const)("unjournalled %s change invalidates, including rollback/restoration",key=>{
 const f=setup(),p=f.journal.capture("RETURN")!,old=f.facts;f.change(key==="identity"?{identity:"replacement"}:key==="generation"?{generation:{}}:{[key]:BigInt(777)});
 expect(f.journal.unchanged(p,"RETURN")).toBe(false);f.change(old);expect(f.journal.unchanged(p,"RETURN")).toBe(false);
});
test.each([[BigInt(2),BigInt(1)],[BigInt(1),BigInt(0)],[BigInt(0),BigInt(1)]])("trigger/partial/silent effects %s/%s invalidate",(actual,reported)=>{
 const f=setup(),p=f.journal.capture("EXPENSE")!;f.write(sql,actual,reported);expect(f.journal.unchanged(p,"EXPENSE")).toBe(false);
});
test("unknown or tampered trigger cannot be treated as metadata",()=>{
 const f=setup(false),p=f.journal.capture("RETURN")!;f.write();expect(f.journal.unchanged(p,"RETURN")).toBe(false);
});
test("native error poisons proof even if caller catches it",()=>{
 const f=setup(),p=f.journal.capture("RETURN")!;expect(()=>f.journal.mutate(sql,()=>{throw Error("driver");},()=>true)).toThrow();expect(f.journal.unchanged(p,"RETURN")).toBe(false);
});
test("same-count redirected/missing/wrong target effect cannot establish reuse",()=>{
 const f=setup(),p=f.journal.capture("RETURN")!;
 f.journal.mutate(sql,()=>{f.change({changes:BigInt(1)});return {changes:BigInt(1)};},()=>false);
 expect(f.journal.unchanged(p,"RETURN")).toBe(false);
});