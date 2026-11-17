import {beforeAll,test,expect,vi} from "vitest";
import {randomUUID} from "node:crypto";
import path from "node:path";
import {seed,gateway,passwords,cashDay} from "../helpers/cash-fixture";
import {Driver} from "../helpers/admin-products-settings-volume";
import type {Raw} from "../helpers/reports-volume";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {createSalesService} from "../../src/server/sales/service";
import {createCashService} from "../../src/server/cash/service";
import {createInvoicesService} from "../../src/server/invoices/service";
import {productId} from "../helpers/returns-fixture";
import {credentials} from "../helpers/cash-fixture";
import {captureGuardInputs,guardInputsUnchanged} from "../../src/server/auth/database";
import {expenseBinding} from "../../src/server/expenses/authority";
import {canonical,digest} from "../../src/server/inventory/validation";
const nativePrototype=Driver.prototype as Raw;
beforeAll(seed);
test("genuine read call sites: unrelated SALE fault permits namespace/catalog/other receipts, affected reads and ALL financial commands refuse; roles and schema remain fresh",async()=>{
 const f=await gateway(),sales=createSalesService(f.g,"TEST SHOP",40),cash=createCashService(f.g,"TEST SHOP"),ids:string[]=[];let g=f.g;
 try{
 for(let i=0;i<2;i++){const input={requestKey:randomUUID(),context:(await sales.context(f.staff)).context,lines:[{productId,quantity:"1",unitPricePaisa:"11000",discountPercent:"0"}],cashPaisa:"11000",cashDate:cashDay(),customerName:"TEST scoped "+i,customerPhone:""};await cash.admit(f.staff,"SALESPERSON",{kind:"SALE",key:input.requestKey,input});ids.push((await sales.create(f.staff,input)).id);}
 await g.close();
 const db=new Driver(path.join(f.config.database.directory,"test.sqlite3"));try{
 const trigger=db.prepare("SELECT sql FROM sqlite_schema WHERE name='counter_cash_admissions_no_update'").get()!;db.exec("DROP TRIGGER counter_cash_admissions_no_update");db.prepare("UPDATE counter_cash_admissions SET payload_digest=? WHERE source_key=(SELECT request_key FROM sale_operations WHERE invoice_id=?)").run("0".repeat(64),ids[0]);db.exec(String(trigger.sql));
 }finally{db.close();}
 g=await openAuthorizationGateway(f.config,40);const admin=await credentials(g,f.config,"ADMIN"),staff=await credentials(g,f.config,"SALESPERSON"),api=createSalesService(g,"TEST SHOP",40),book=createCashService(g),invoices=createInvoicesService(g,40);
 expect((await api.catalog(staff)).items.length).toBeGreaterThan(0);expect((await api.context(staff)).context).toMatch(/^[0-9a-f]{64}$/);const ctx=(await book.context(admin)).context;
 expect((await api.get(staff,ids[1])).id).toBe(ids[1]);expect((await api.history(staff,undefined,"TEST-"+ids[1])).items.map(x=>x.id)).toEqual([ids[1]]);
 expect((await invoices.history(admin,{from:"2000-01-01",to:cashDay(),query:"TEST-"+ids[1]})).items.map(x=>x.id)).toEqual([ids[1]]);
 await expect(api.get(staff,ids[0])).rejects.toThrow();await expect(api.history(staff,undefined,"TEST-"+ids[0])).rejects.toThrow();await expect(invoices.receipt(admin,"ADMIN",ids[0])).rejects.toThrow();
 await expect(book.prepare(admin,passwords.ADMIN,randomUUID(),ctx,"START_COUNT",{businessDate:cashDay(),evidence:"TEST damaged source must block command"})).rejects.toThrow();
 const input={requestKey:randomUUID(),context:(await api.context(staff)).context,lines:[{productId,quantity:"1",unitPricePaisa:"11000",discountPercent:"0"}],cashPaisa:null,customerName:"TEST rollback",customerPhone:""};
 const before=await g.withAdminTransaction(admin,tx=>tx.get("SELECT count(*) AS n FROM sales"));await expect(api.create(staff,input)).rejects.toThrow();expect(await g.withAdminTransaction(admin,tx=>tx.get("SELECT count(*) AS n FROM sales"))).toEqual(before);
 await expect(api.catalog(admin)).rejects.toThrow();await expect(book.context(staff)).rejects.toThrow();await expect(invoices.history(staff,{from:"2000-01-01",to:cashDay(),query:""})).rejects.toThrow();await expect(api.catalog(new Request(f.config.origins.SALESPERSON+"/private",{headers:{origin:f.config.origins.SALESPERSON}}))).rejects.toThrow();
 await g.close();
 const tamper=new Driver(path.join(f.config.database.directory,"test.sqlite3"));try{tamper.exec("CREATE TRIGGER unreviewed_read_guard AFTER INSERT ON cash_action_requests BEGIN SELECT 1; END");}finally{tamper.close();}
 await expect(openAuthorizationGateway(f.config,40)).rejects.toThrow();
 }finally{await g.close();}
},180000);
test("native same-count redirected metadata write cannot mint/reuse guard proof",async()=>{
 const f=await gateway();try{await f.g.withAdminTransaction(f.admin,async(tx,a)=>{
 const point=captureGuardInputs(tx,"RETURN")!;expect(point).toBeDefined();const b=await expenseBinding(tx,a),key=randomUUID(),payload={businessDate:cashDay(),evidence:"TEST wrong native target"};
 const prepare=nativePrototype.prepare;
 vi.spyOn(nativePrototype,"prepare").mockImplementation(function(this:Raw,s:string){const st=prepare.call(this,s);if(s==="INSERT INTO cash_action_requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")st.run=()=>prepare.call(this,"UPDATE auth_principals SET auth_epoch=auth_epoch WHERE id='ADMIN'").run();return st;});
 try{await tx.run("INSERT INTO cash_action_requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[key,key,"a".repeat(64),"START_COUNT","ADMIN",a.sessionId,b.credential_version,b.auth_epoch,b.boot,canonical(payload),digest(payload),b.now]);}finally{vi.restoreAllMocks();}
 expect(guardInputsUnchanged(tx,"RETURN",point)).toBe(false);expect(await tx.get("SELECT id FROM cash_action_requests WHERE id=?",[key])).toBeUndefined();expect(captureGuardInputs(tx,"RETURN")).toBeUndefined();
 });}finally{vi.restoreAllMocks();await f.g.close();}
},120000);

test("returned original financial events stay mandatory while an unrelated receipt remains available",async()=>{
 const f=await gateway();let g=f.g;
 try{
 const ids=await g.withAdminTransaction(f.admin,async tx=>(await tx.all("SELECT id FROM sales ORDER BY rowid LIMIT 2")).map(x=>String(x.id)));
 expect(ids.length).toBe(2);await g.close();
 const raw=new Driver(path.join(f.config.database.directory,"test.sqlite3"));try{
 const guard=raw.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND tbl_name='financial_events' AND name LIKE '%no_update'").get()!;expect(guard).toBeDefined();raw.exec("DROP TRIGGER "+String(guard.name));raw.prepare("UPDATE financial_events SET revenue_delta_m=revenue_delta_m+100 WHERE sale_line_id IN(SELECT id FROM sale_lines WHERE invoice_id=?)").run(ids[0]);raw.exec(String(guard.sql));
 }finally{raw.close();}
 g=await openAuthorizationGateway(f.config,40);const staff=await credentials(g,f.config,"SALESPERSON"),admin=await credentials(g,f.config,"ADMIN"),api=createSalesService(g,"TEST SHOP",40),invoices=createInvoicesService(g,40),book=createCashService(g);
 await expect(api.get(staff,ids[0])).rejects.toThrow();await expect(invoices.history(admin,{from:"2000-01-01",to:cashDay(),query:"TEST-"+ids[0]})).rejects.toThrow();expect((await api.get(staff,ids[1])).id).toBe(ids[1]);expect((await invoices.history(admin,{from:"2000-01-01",to:cashDay(),query:"TEST-"+ids[1]})).items.map(x=>x.id)).toEqual([ids[1]]);
 const ctx=(await book.context(admin)).context;await expect(book.prepare(admin,passwords.ADMIN,randomUUID(),ctx,"START_COUNT",{businessDate:cashDay(),evidence:"TEST original financial fault must block every command"})).rejects.toThrow();
 }finally{await g.close();}
},120000);

test("receipt stock validation is scoped to one real read transaction; every receipt stays fresh and any stock write forces validation/rollback",async()=>{
 const {readReceipt}=await import("../../src/server/sales/service"),{selectProduct}=await import("../../src/server/inventory/model");
 const f=await gateway();let stockReads=0;try{
 const id=await f.g.withAdminTransaction(f.admin,async tx=>String((await tx.get("SELECT id FROM sales ORDER BY rowid LIMIT 1"))!.id)),prepare=nativePrototype.prepare;
 const before=await f.g.withAdminTransaction(f.admin,tx=>tx.get("SELECT sellable_q FROM stock_balances WHERE product_id=?",[productId]));
 vi.spyOn(nativePrototype,"prepare").mockImplementation(function(this:Raw,s:string){if(s===selectProduct+" WHERE p.id=?")stockReads++;return prepare.call(this,s);});
 await expect(f.g.withAdminTransaction(f.admin,async tx=>{
  const first=await readReceipt(tx,id),second=await readReceipt(tx,id);expect(first).not.toBe(second);expect(first).toEqual(second);expect(stockReads).toBe(1);
  await tx.run("UPDATE stock_balances SET sellable_q=sellable_q+1000000,stock_value_m=stock_value_m+cost_m WHERE product_id=?",[productId]);
  return readReceipt(tx,id);
 })).rejects.toThrow();expect(stockReads).toBe(2);vi.restoreAllMocks();
 expect(await f.g.withAdminTransaction(f.admin,tx=>tx.get("SELECT sellable_q FROM stock_balances WHERE product_id=?",[productId]))).toEqual(before);
 stockReads=0;vi.spyOn(nativePrototype,"prepare").mockImplementation(function(this:Raw,s:string){if(s===selectProduct+" WHERE p.id=?")stockReads++;return prepare.call(this,s);});
 await f.g.withAdminTransaction(f.admin,tx=>readReceipt(tx,id));await f.g.withAdminTransaction(f.admin,tx=>readReceipt(tx,id));expect(stockReads).toBe(2);
 }finally{vi.restoreAllMocks();await f.g.close();}
},120000);
