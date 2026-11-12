import {randomBytes,randomUUID} from "node:crypto";
import {copyFileSync,mkdtempSync} from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {beforeAll,afterEach,describe,it,expect,vi} from "vitest";
import {initialize,fixture,passwords,run,stable} from "../helpers/inventory-http-fixture";
import {openDatabase,executeReviewedSalesProgram} from "../../src/server/db/connection";
import {applySalesMigration36} from "../../src/server/db/sales-migrate";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {createInventoryService} from "../../src/server/inventory/service";
import {createSalesService} from "../../src/server/sales/service";
import {halfUp,lineAmounts,cumulativeRefund} from "../../src/server/sales/calculations";
import {validateReviewedSchema} from "../../src/server/db/validate-schema";
import type {AuthorizationGateway,AuthorizationConfiguration} from "../../src/server/auth/types";
import type {SqlValue} from "../../src/server/db/connection";
interface Native{inTransaction:boolean;exec(s:string):void;pragma(s:string):unknown;prepare(s:string):{run(...v:SqlValue[]):unknown}}
const Driver=createRequire(import.meta.url)("better-sqlite3") as {prototype:Native};
let seed:Awaited<ReturnType<typeof fixture>>,ids:string[];
const close:(()=>Promise<void>|void)[]=[];
const request=(config:AuthorizationConfiguration,role:"ADMIN"|"SALESPERSON",cookies:string[])=>new Request(config.origins[role]+"/private",{headers:{origin:config.origins[role],cookie:cookies.map(c=>c.split(";")[0]).join("; ")}});
async function login(g:AuthorizationGateway,c:AuthorizationConfiguration,role:"ADMIN"|"SALESPERSON"){const issued=role==="ADMIN"?await g.issueAdminSession(await g.verifyAdminPassword(passwords.ADMIN)):await g.issueSalespersonSession(await g.verifySalespersonPassword(passwords.SALESPERSON));return request(c,role,issued.headers.getSetCookie());}
beforeAll(async()=>{
 await initialize();seed=await fixture();const g=await openAuthorizationGateway(seed.config.authorization,35);
 try{const r=await login(g,seed.config.authorization,"ADMIN"),api=createInventoryService(g);ids=[];
  for(const [name,cost,price]of [["A","10000","11000"],["B","40000","50000"],["C","8000","10300"]]){const p=await api.createProduct(r,{requestKey:randomUUID(),name:"TEST "+name,unit:"PACK",buyingPricePaisa:cost,sellingPricePaisa:price,sellingActive:true,openingQuantity:"2000",lowStockThreshold:"1"});ids.push(p.product.id);}
 await api.createProduct(r,{requestKey:randomUUID(),name:"TEST legacy fractional",unit:"PACK",buyingPricePaisa:"1250",sellingPricePaisa:"1555",sellingActive:true,openingQuantity:"7",lowStockThreshold:"0"});
 }finally{await g.close();}
});
afterEach(async()=>{vi.restoreAllMocks();for(const f of close.splice(0).reverse())await f();});
function db36(upgrade=true){const directory=mkdtempSync(path.join(run,"sales36-"));copyFileSync(path.join(seed.config.authorization.database.directory,"test.sqlite3"),path.join(directory,"test.sqlite3"));const config={...seed.config.authorization,database:{...seed.config.authorization.database,directory},signingSecrets:{ADMIN:randomBytes(48).toString("base64url"),SALESPERSON:randomBytes(48).toString("base64url")}};const db=openDatabase(config.database);if(upgrade)applySalesMigration36(db);return {config,db};}
async function ready(){const {config,db}=db36();db.close();const g=await openAuthorizationGateway(config,36);close.push(()=>g.close());const admin=await login(g,config,"ADMIN"),staff=await login(g,config,"SALESPERSON"),api=createSalesService(g,"TEST SHOP"),context=(await api.context(staff)).context;return {config,g,admin,staff,api,context,command:()=>({requestKey:randomUUID(),context,lines:[{productId:ids[0],quantity:"3",unitPricePaisa:"11000",discountPercent:"5"},{productId:ids[1],quantity:"2",unitPricePaisa:"50000",discountPercent:"0"},{productId:ids[2],quantity:"4",unitPricePaisa:"10300",discountPercent:"20"}],cashPaisa:null})};}
describe("final OPTION2 exact arithmetic",()=>{
 it.each([["70001","700"],["70049","700"],["70050","701"],["70099","701"],["4570099","45701"]])("HALF_UP %s paisa to %s rupees",(n,v)=>expect(halfUp(BigInt(n),BigInt(100))).toBe(BigInt(v)));
 it.each(["1","3","10","100","1000"])("rounds UNIT before multiplying quantity%s",q=>expect(lineAmounts("11000",q,"5",BigInt(10000)).charged).toBe(BigInt(10500)*BigInt(q)));
 it("uses independent discounts and sums invoice1643",()=>expect([lineAmounts("11000","3","5",BigInt(10000)),lineAmounts("50000","2","0",BigInt(40000)),lineAmounts("10300","4","20",BigInt(8000))].reduce((n,l)=>n+l.charged,BigInt(0))).toBe(BigInt(164300)));
 it("retains cumulative101/3 refund34,33,34 and rejects inconsistent/overrun evidence",()=>{expect([cumulativeRefund("10100","3","0","0","1"),cumulativeRefund("10100","3","1","3400","1"),cumulativeRefund("10100","3","2","6700","1")]).toEqual([BigInt(3400),BigInt(3300),BigInt(3400)]);expect(()=>cumulativeRefund("10100","3","2","6600","1")).toThrow();expect(()=>cumulativeRefund("10100","3","3","10100","1")).toThrow();});
 it.each([["11000","3","5",BigInt(10501)],["110.00","1","5",BigInt(100)],["11000","1","5.5",BigInt(100)],["10000","1","100",BigInt(100)],["99999999999900","999999999999","0",BigInt(100)]])("rejects malformed/floor/zero/overflow",(...v)=>expect(()=>lineAmounts(...v as [string,string,string,bigint])).toThrow());
});
describe("real preserving schema36 and atomic Sales",()=>{
 it("preserves populated old values,rowids,auth,latch and old35 history and admits exact36",async()=>{
  const {db}=db36(false);close.push(()=>db.close());const tables=db.all("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*'").map(r=>String(r.name)),before=Object.fromEntries(tables.map(t=>[t,db.all("SELECT rowid,* FROM "+t)]));
  expect(applySalesMigration36(db)).toEqual({applied:1,version:BigInt(36)});for(const table of tables){const actual=db.all("SELECT rowid,* FROM "+table).map(r=>{const o={...r};if(table==="stock_movements")delete o.sale_line_id;return o;});expect(stable(table==="schema_migrations"?actual.slice(0,35):actual)===stable(before[table])).toBe(true);}
  expect(applySalesMigration36(db).applied).toBe(0);

 });
 it("rolls the whole DDL/copy/history/version transition back on native COMMIT failure",()=>{
  const {db}=db36(false);close.push(()=>db.close());const before=stable(db.all("SELECT rowid,* FROM stock_movements")),exec=Driver.prototype.exec;let failed=false;
  vi.spyOn(Driver.prototype,"exec").mockImplementation(function(this:Native,sql:string){if(sql==="COMMIT"&&!failed){failed=true;throw Error("TEST commit failure");}return exec.call(this,sql);});
  expect(()=>applySalesMigration36(db)).toThrow();expect(failed).toBe(true);vi.restoreAllMocks();expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(35));expect(stable(db.all("SELECT rowid,* FROM stock_movements"))===before).toBe(true);expect(db.get("SELECT name FROM sqlite_schema WHERE name='sales'")).toBeUndefined();
 });
 it("creates mixed invoice1643, exact snapshots, single stock ledger, unrecorded cash and current SQL authorization",async()=>{
  const f=await ready(),r=await f.api.create(f.staff,f.command());expect(r.totalPaisa).toBe("164300");expect(r.lines.map(l=>l.totalPaisa)).toEqual(["31500","100000","32800"]);expect(r.payment).toBeNull();
  expect(JSON.stringify(r)).not.toMatch(/cost|profit|stock|hash|password|token|secret/i);expect(await f.api.get(f.staff,r.id)).toEqual(r);
  expect((await f.g.withSalespersonTransaction(f.staff,tx=>validateReviewedSchema(tx,36))).ok).toBe(true);
  const movement=await createInventoryService(f.g,36).listMovements(f.admin,{productId:ids[0]});expect(movement.items[0]).toMatchObject({kind:"SALE",actor:"SALESPERSON",deltaQuantity:"-3"});
 });
 it("persists explicit cash only and rejects insufficient/fractional tender atomically",async()=>{const f=await ready(),c=f.command();expect((await f.api.create(f.staff,{...c,cashPaisa:"200000"})).payment).toEqual({tenderedPaisa:"200000",receivedPaisa:"164300",changePaisa:"35700"});await expect(f.api.create(f.staff,{...c,requestKey:randomUUID(),cashPaisa:"100"})).rejects.toThrow();await expect(f.api.create(f.staff,{...c,requestKey:randomUUID(),cashPaisa:"200001"})).rejects.toThrow();expect((await f.api.history(f.staff)).items).toHaveLength(1);});
 it("replays one original key once and rejects a changed command",async()=>{const f=await ready(),c=f.command(),a=await f.api.create(f.staff,c);expect(await f.api.create(f.staff,c)).toEqual(a);await expect(f.api.create(f.staff,{...c,cashPaisa:"200000"})).rejects.toThrow();expect((await f.api.history(f.staff)).items).toHaveLength(1);});
 it("serializes simultaneous same-key writes without duplicate invoice/deduction",async()=>{const f=await ready(),c=f.command(),v=await Promise.all([f.api.create(f.staff,c),f.api.create(f.staff,c)]);expect(v[0]).toEqual(v[1]);expect((await f.api.history(f.staff)).items).toHaveLength(1);});
 it("prevents oversell and rolls back all lines of a failed invoice",async()=>{const f=await ready(),c=f.command(),cmd={...c,lines:[{...c.lines[0],quantity:"1500"}]};const v=await Promise.allSettled([f.api.create(f.staff,cmd),f.api.create(f.staff,{...cmd,requestKey:randomUUID()})]);expect(v.filter(v=>v.status==="fulfilled")).toHaveLength(1);await expect(f.api.create(f.staff,{...c,requestKey:randomUUID(),lines:[c.lines[1],{...c.lines[0],quantity:"501"}]})).rejects.toThrow();expect((await f.api.history(f.staff)).items).toHaveLength(1);expect((await createInventoryService(f.g,36).getProduct(f.admin,{productId:ids[1]})).quantity).toBe("2000");});
 it("denies wrong-role, forged context, duplicate products and stale signed sessions",async()=>{const f=await ready(),c=f.command();await expect(f.api.create(f.admin,c)).rejects.toThrow();await expect(f.api.create(f.staff,{...c,context:"0".repeat(64)})).rejects.toThrow();await expect(f.api.create(f.staff,{...c,lines:[c.lines[0],c.lines[0]]})).rejects.toThrow();await f.g.logoutSalesperson(f.staff);await expect(f.api.create(f.staff,c)).rejects.toThrow();});
 it("keeps UNKNOWN blocked, Admin cancellation permanent and unrelated keys usable",async()=>{const f=await ready(),c=f.command();expect((await f.api.operation(f.staff,c.requestKey,c.context)).state).toBe("UNKNOWN");await expect(f.api.recovery(f.staff,c.requestKey,c.context,true)).rejects.toThrow();expect((await f.api.recovery(f.admin,c.requestKey,c.context,true)).state).toBe("CANCELLED");await expect(f.api.create(f.staff,c)).rejects.toThrow();expect((await f.api.recovery(f.admin,c.requestKey,c.context,true)).state).toBe("CANCELLED");const r=await f.api.create(f.staff,{...c,requestKey:randomUUID()});expect((await f.api.recovery(f.admin,r.id,c.context,false)).state).toBe("UNKNOWN");});
 it("D05 receive/reprices remaining+new stock, keeps past sold COGS and original replay",async()=>{const f=await ready(),c=f.command(),sale=await f.api.create(f.staff,c),inv=createInventoryService(f.g,36),old=await inv.getProduct(f.admin,{productId:ids[0]});const changed=await inv.receiveStock(f.admin,{requestKey:randomUUID(),productId:ids[0],expectedProductVersion:old.productVersion,expectedBalanceVersion:old.balanceVersion,quantity:"2",unitBuyingPricePaisa:"10600",reason:"TEST incoming cost"});expect(changed.product.quantity).toBe("1999");expect(changed.product.buyingPricePaisa).toBe("10600");expect(changed.valuationDeltaPaisa).toBe("1198200");expect(await f.api.create(f.staff,c)).toEqual(sale);expect(await f.api.get(f.staff,sale.id)).toEqual(sale);});
 it("saved invoices and revocation/cancellation survive reopen while all old cookies fail",async()=>{const f=await ready(),c=f.command(),sale=await f.api.create(f.staff,c);await f.api.recovery(f.admin,randomUUID(),c.context,true);await f.g.close();close.pop();const g=await openAuthorizationGateway(f.config,36);close.push(()=>g.close());const api=createSalesService(g,"TEST SHOP");await expect(api.history(f.staff)).rejects.toThrow();const staff=await login(g,f.config,"SALESPERSON");expect(await api.get(staff,sale.id)).toEqual(sale);expect((await api.context(staff)).context).toBe(c.context);});
});

describe("Sales36 native failures and every immutable key",()=>{
 it.each([0,1])("rejects replacement through EVERY PK/UNIQUE/rowid and UPSERT with recursive_triggers=%s",async recursive=>{
  const f=await ready(),c=f.command();await f.api.create(f.staff,{...c,cashPaisa:"200000"});await f.api.create(f.staff,{...c,requestKey:randomUUID(),cashPaisa:"200000"});await f.api.recovery(f.admin,randomUUID(),c.context,true);await f.api.recovery(f.admin,randomUUID(),c.context,true);await f.g.close();close.pop();
  type Raw={pragma(s:string):unknown;defaultSafeIntegers(v:boolean):void;prepare(s:string):{all(...v:SqlValue[]):Record<string,SqlValue>[];get(...v:SqlValue[]):Record<string,SqlValue>|undefined;run(...v:SqlValue[]):unknown};close():void};
  const Constructor=createRequire(import.meta.url)("better-sqlite3") as new(p:string)=>Raw,db=new Constructor(path.join(f.config.database.directory,"test.sqlite3"));close.push(()=>db.close());db.defaultSafeIntegers(true);db.pragma("foreign_keys=ON");db.pragma("recursive_triggers="+recursive);
  let probes=0;
  for(const table of ["sale_operations","sales","sale_lines","invoice_snapshots","sale_payments","sale_cancellations","stock_movements"]){
   // A confirmed payment is added by a second ordinary sale, not direct forged data.
   if(table==="sale_payments"&&!db.prepare("SELECT id FROM sale_payments LIMIT 1").get())continue;
   const row=db.prepare("SELECT rowid AS physical,* FROM "+table+" LIMIT 1").get()!;expect(!!row).toBe(true);
   const before=stable(db.prepare("SELECT rowid,* FROM "+table+" ORDER BY rowid").all()),columns=Object.keys(row).filter(k=>k!=="physical");
   const unique=db.pragma("index_list("+table+")") as {name:string;unique:bigint}[];
   const groups=[["rowid"],...unique.filter(i=>i.unique===BigInt(1)).map(i=>(db.pragma("index_info("+i.name+")") as {name:string}[]).map(c=>c.name))];
   for(const target of groups){
    const selected=target.includes("rowid")?row:db.prepare("SELECT rowid AS physical,* FROM "+table+" WHERE "+target.map(k=>k+" IS NOT NULL").join(" AND ")+(table==="stock_movements"&&target.length===1&&target[0]==="product_id"?" AND kind='OPENING'":"")+" LIMIT 1").get();if(!selected)throw Error("Missing uniqueness fixture");
    const source=selected;const candidate={...source};for(const field of ["id","request_key","invoice_id","operation_id","sale_line_id"])if(field in candidate&&candidate[field]!==null)candidate[field]=randomUUID();
    if("invoice_number" in candidate)candidate.invoice_number="TEST-"+candidate.id;
    if("balance_version" in candidate)candidate.balance_version=BigInt(999999);
    if("line_no" in candidate)candidate.line_no=BigInt(50);
    if("product_id" in candidate)candidate.product_id=randomUUID();
    candidate.physical=BigInt(900000+probes);
    for(const key of target)candidate[key==="rowid"?"physical":key]=source[key==="rowid"?"physical":key];
    const sql="INSERT OR REPLACE INTO "+table+"(rowid,"+columns.join(",")+") VALUES("+["?",...columns.map(()=>"?")].join(",")+")";
    expect(()=>db.prepare(sql).run(candidate.physical,...columns.map(k=>candidate[k]))).toThrow(/history conflict|movement conflict/i);probes++;
   }
   expect(()=>db.prepare("UPDATE "+table+" SET "+columns[0]+"="+columns[0]).run()).toThrow(/immutable|append|history/i);
   expect(()=>db.prepare("DELETE FROM "+table).run()).toThrow(/immutable|append|history/i);
   const victim=db.prepare("SELECT rowid AS physical,* FROM "+table+" WHERE rowid<>? LIMIT 1").get(row.physical)!;expect(!!victim).toBe(true);expect(()=>db.prepare("UPDATE OR REPLACE "+table+" SET "+columns[0]+"=? WHERE rowid=?").run(victim[columns[0]],row.physical)).toThrow(/immutable|history/i);expect(()=>db.prepare("UPDATE OR REPLACE "+table+" SET rowid=? WHERE rowid=?").run(victim.physical,row.physical)).toThrow(/immutable|history/i);
   const pk=(unique.find(i=>String((i as unknown as {origin:string}).origin)==="pk"));expect(!!pk).toBe(true);
   expect(()=>db.prepare("INSERT INTO "+table+"("+columns.join(",")+") VALUES("+columns.map(()=>"?").join(",")+") ON CONFLICT DO UPDATE SET "+columns[0]+"=excluded."+columns[0]).run(...columns.map(k=>row[k]))).toThrow(/conflict|immutable|history/i);
   expect(stable(db.prepare("SELECT rowid,* FROM "+table+" ORDER BY rowid").all())===before).toBe(true);
  }
  expect(probes).toBeGreaterThan(20);
 });
 it("native COMMIT deferred-FK failure rolls back invoice/payment/all deductions",async()=>{
  const f=await ready(),c=f.command(),prepare=Driver.prototype.prepare;let armed=false,failed=false;
  vi.spyOn(Driver.prototype,"prepare").mockImplementation(function(this:Native,sql:string){if(armed&&!failed&&/^commit$/i.test(sql.trim())&&this.inTransaction){failed=true;this.pragma("defer_foreign_keys=ON");prepare.call(this,"INSERT INTO product_identifiers VALUES('TEST_MISSING','BARCODE','TEST_ORPHAN')").run();}return prepare.call(this,sql);});
  armed=true;await expect(f.api.create(f.staff,{...c,cashPaisa:"200000"})).rejects.toThrow();expect(failed).toBe(true);vi.restoreAllMocks();expect((await f.api.history(f.staff)).items).toHaveLength(0);
  expect((await createInventoryService(f.g,36).getProduct(f.admin,{productId:ids[0]})).quantity).toBe("2000");expect((await f.api.operation(f.staff,c.requestKey,c.context)).state).toBe("UNKNOWN");
 });
 it("real COMMIT success with lost acknowledgement stays UNKNOWN to caller but recovers exact original invoice",async()=>{
  const f=await ready(),c=f.command(),prepare=Driver.prototype.prepare;let lost=false;
  vi.spyOn(Driver.prototype,"prepare").mockImplementation(function(this:Native,sql:string){const s=prepare.call(this,sql);if(!lost&&/^commit$/i.test(sql.trim())&&this.inTransaction){const run=s.run.bind(s);s.run=(...v)=>{const value=run(...v);if(!lost){lost=true;throw Error("TEST lost acknowledgement");}return value;};}return s;});
  await expect(f.api.create(f.staff,c)).rejects.toThrow();expect(lost).toBe(true);vi.restoreAllMocks();expect((await f.api.operation(f.staff,c.requestKey,c.context)).state).toBe("COMMITTED");const recovered=await f.api.create(f.staff,c);expect(recovered.totalPaisa).toBe("164300");expect((await f.api.history(f.staff)).items).toHaveLength(1);
 });
 it("SQL failure and revoked authorization fail closed without disclosing hashes or source SQL",async()=>{
  const f=await ready(),c=f.command(),prepare=Driver.prototype.prepare;vi.spyOn(Driver.prototype,"prepare").mockImplementation(function(this:Native,sql:string){if(sql.includes("FROM sale_operations WHERE request_key"))throw Error("TEST private SQL failure");return prepare.call(this,sql);});
  let error:unknown;try{await f.api.create(f.staff,c);}catch(e){error=e;}expect(String(error)).toBe("SaleError: Sale unavailable.");vi.restoreAllMocks();expect((await f.api.history(f.staff)).items).toHaveLength(0);
 });
});

describe("exact source admission and coordinated failure paths",()=>{
 it.each(["temp-shadow","broken-ledger","newer-version","clone"])("denies%s before schema36 writes",kind=>{
  const f=db36(false);close.push(()=>f.db.close());
  if(kind==="temp-shadow")f.db.transaction(tx=>tx.run("CREATE TEMP TABLE stock_movements(v INTEGER) STRICT"));
  if(kind==="broken-ledger")f.db.transaction(tx=>tx.run("UPDATE stock_balances SET sellable_q=sellable_q+1000000,stock_value_m=stock_value_m+cost_m WHERE product_id=?",[ids[0]]));
  if(kind==="newer-version")f.db.transaction(tx=>tx.setSchemaVersion(BigInt(37)));
  expect(()=>applySalesMigration36(kind==="clone"?{...f.db}:f.db)).toThrow();expect(f.db.get("SELECT name FROM main.sqlite_schema WHERE name='sales'")).toBeUndefined();expect(f.db.all("SELECT version FROM main.schema_migrations")).toHaveLength(35);
 });
 it("rolls back each of42 native program steps and the history-write failure without partial schema or moved physical IDs",async()=>{
  const {salesSteps}=await import("../../src/server/db/sales-program"),steps=[...salesSteps(),"INSERT INTO schema_migrations VALUES(?,?,?,?)"],prepare=Driver.prototype.prepare;
  for(const target of steps){
   const {db}=db36(false);try{
    const before=stable(db.all("SELECT rowid,* FROM stock_movements ORDER BY rowid")),history=stable(db.all("SELECT * FROM schema_migrations ORDER BY version"));let hit=false;
    vi.spyOn(Driver.prototype,"prepare").mockImplementation(function(this:Native,sql:string){if(!hit&&sql===target){hit=true;throw Error("TEST program-step failure");}return prepare.call(this,sql);});
    expect(()=>applySalesMigration36(db)).toThrow();expect(hit).toBe(true);vi.restoreAllMocks();expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(35));expect(stable(db.all("SELECT rowid,* FROM stock_movements ORDER BY rowid"))===before).toBe(true);expect(stable(db.all("SELECT * FROM schema_migrations ORDER BY version"))===history).toBe(true);expect(db.get("SELECT name FROM sqlite_schema WHERE name='sales'")).toBeUndefined();
   }finally{vi.restoreAllMocks();db.close();}
  }
 });
 it("second-line SQL failure rolls back already written invoice, first-line deduction and payment",async()=>{
  const f=await ready(),c=f.command(),prepare=Driver.prototype.prepare;let lines=0;
  vi.spyOn(Driver.prototype,"prepare").mockImplementation(function(this:Native,sql:string){if(sql.startsWith("INSERT INTO sale_lines")&&++lines===2)throw Error("TEST second line failure");return prepare.call(this,sql);});
  await expect(f.api.create(f.staff,{...c,cashPaisa:"200000"})).rejects.toThrow();expect(lines).toBe(2);vi.restoreAllMocks();expect((await f.api.history(f.staff)).items).toHaveLength(0);expect((await createInventoryService(f.g,36).getProduct(f.admin,{productId:ids[0]})).quantity).toBe("2000");
 });
 it("concurrent original execution and Admin cancellation have exactly one terminal outcome",async()=>{
  const f=await ready(),c=f.command(),results=await Promise.allSettled([f.api.create(f.staff,c),f.api.recovery(f.admin,c.requestKey,c.context,true)]),terminal=await f.api.operation(f.staff,c.requestKey,c.context);
  expect(["COMMITTED","CANCELLED"]).toContain(terminal.state);const entries=(await f.api.history(f.staff)).items;if(terminal.state==="COMMITTED"){expect(results[0].status).toBe("fulfilled");expect(entries).toHaveLength(1);}else{expect(results[0].status).toBe("rejected");expect(entries).toHaveLength(0);}
 });
 it("sale and D05 receiving serialize stock versions and use the exact committed cost snapshot",async()=>{
  const f=await ready(),c={...f.command(),lines:[f.command().lines[0]]},inv=createInventoryService(f.g,36),old=await inv.getProduct(f.admin,{productId:ids[0]});
  const [sale,receive]=await Promise.allSettled([f.api.create(f.staff,c),inv.receiveStock(f.admin,{requestKey:randomUUID(),productId:ids[0],expectedProductVersion:old.productVersion,expectedBalanceVersion:old.balanceVersion,quantity:"2",unitBuyingPricePaisa:"10400",reason:"TEST concurrent receive"})]);
  expect(sale.status).toBe("fulfilled");const snapshot=await f.g.withAdminTransaction(f.admin,tx=>tx.get("SELECT cost_snapshot_m FROM sale_lines WHERE product_id=?",[ids[0]]));expect(snapshot?.cost_snapshot_m).toBe(receive.status==="fulfilled"?BigInt(10400):BigInt(10000));expect((await inv.getProduct(f.admin,{productId:ids[0]})).quantity).toBe(receive.status==="fulfilled"?"1999":"1997");
 });
});

describe("bounded real catalog/history and int64 cash",()=>{
 it("searches real products beyond first100 and filters saved snapshots with chronological keyset history",async()=>{
  const f=await ready(),{mutate}=await import("../../src/server/inventory/mutations");
  await f.g.withAdminTransaction(f.admin,async(tx,actor)=>{for(let i=0;i<101;i++)await mutate(tx,actor,"CREATE",{requestKey:randomUUID(),name:"AA TEST filler "+i,unit:"PACK",buyingPricePaisa:"100",sellingPricePaisa:"1000",sellingActive:true,openingQuantity:"0",lowStockThreshold:"0"});});
  expect((await f.api.catalog(f.staff)).items).toHaveLength(100);const found=await f.api.catalog(f.staff,"TEST C");expect(found.items.map(x=>x.id)).toEqual([ids[2]]);expect(JSON.stringify(found)).not.toMatch(/quantity|cost|stock|profit/i);
  const first=await f.api.create(f.staff,f.command()),second=await f.api.create(f.staff,{...f.command(),lines:[{productId:ids[0],quantity:"1",unitPricePaisa:"11100",discountPercent:"0"}]});
  expect((await f.api.history(f.staff,undefined,first.number)).items.map(x=>x.id)).toEqual([first.id]);const all=await f.api.history(f.staff);const expected=[first,second].sort((a,b)=>BigInt(a.recordedAtMs)>BigInt(b.recordedAtMs)?-1:BigInt(a.recordedAtMs)<BigInt(b.recordedAtMs)?1:b.id.localeCompare(a.id));expect(all.items.map(x=>x.id)).toEqual(expected.map(x=>x.id));expect((await f.api.history(f.staff,expected[0].id)).items.map(x=>x.id)).toEqual([expected[1].id]);
 });
 it("keeps whole-PKR cash/refund values above Number precision exact and rejects signed64 overflow",async()=>{
  const f=await ready(),tender="9223372036854775800",r=await f.api.create(f.staff,{...f.command(),cashPaisa:tender});expect(r.payment?.tenderedPaisa).toBe(tender);expect(r.payment?.changePaisa).toBe((BigInt(tender)-BigInt(164300)).toString());await expect(f.api.create(f.staff,{...f.command(),cashPaisa:"9223372036854775900"})).rejects.toThrow();
  const a=cumulativeRefund(tender,"3","0","0","1"),b=cumulativeRefund(tender,"3","1",a.toString(),"1"),c=cumulativeRefund(tender,"3","2",(a+b).toString(),"1");expect(a+b+c).toBe(BigInt(tender));
 });
});


describe("TEST maintenance confinement and preserved fractional history",()=>{
 it("a suppressed pinned-program error still poisons and rolls back the entire transaction",async()=>{
  const {db}=db36(false);close.push(()=>db.close());const {salesSteps}=await import("../../src/server/db/sales-program"),target=salesSteps()[1],prepare=Driver.prototype.prepare;
  const before=stable(db.all("SELECT rowid,* FROM stock_movements ORDER BY rowid"));let hit=false;
  vi.spyOn(Driver.prototype,"prepare").mockImplementation(function(this:Native,sql:string){if(sql===target){hit=true;throw Error("TEST suppressed program failure");}return prepare.call(this,sql);});
  expect(()=>db.transaction(tx=>{try{executeReviewedSalesProgram(db,tx);}catch{/* Deliberately suppress: outer COMMIT must still fail. */}})).toThrow();expect(hit).toBe(true);vi.restoreAllMocks();
  expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(35));expect(db.all("SELECT version FROM schema_migrations")).toHaveLength(35);expect(db.get("SELECT name FROM sqlite_schema WHERE name='sale_operations'")).toBeUndefined();expect(stable(db.all("SELECT rowid,* FROM stock_movements ORDER BY rowid"))).toBe(before);
 });
 it("rejects an enrolled TEST copy before any Sales DDL and preserves its binding",()=>{
  const {db}=db36(false);close.push(()=>db.close());db.transaction(tx=>tx.run("INSERT INTO auth_enrollment_binding VALUES(1,1,1,?,?,?,?)",[randomUUID(),randomUUID(),randomUUID(),"0".repeat(64)]));
  const before=stable(db.all("SELECT rowid,* FROM auth_enrollment_binding"));expect(()=>applySalesMigration36(db)).toThrow();expect(stable(db.all("SELECT rowid,* FROM auth_enrollment_binding"))).toBe(before);expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(35));expect(db.get("SELECT name FROM sqlite_schema WHERE name='sale_operations'")).toBeUndefined();
 });
 it("retains legacy fractional product/cost/value records without admitting new fractional-price writes",async()=>{
  const f=await ready(),inv=createInventoryService(f.g,36),legacy=(await inv.listProducts(f.admin,{query:"TEST legacy fractional"})).items[0];expect(legacy.buyingPricePaisa).toBe("1250");expect(legacy.sellingPricePaisa).toBe("1555");expect(legacy.stockValuePaisa).toBe("8750");expect((await f.api.catalog(f.staff,"TEST legacy fractional")).items).toHaveLength(0);
  await expect(inv.createProduct(f.admin,{requestKey:randomUUID(),name:"TEST rejected fractional",unit:"PACK",buyingPricePaisa:"1250",sellingPricePaisa:"2000",sellingActive:true,openingQuantity:"1",lowStockThreshold:"0"})).rejects.toThrow();
 });
});
