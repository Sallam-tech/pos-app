import {importRetainedPaidSales} from "../helpers/retained-paid-sales";
import {beforeAll,test,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {writeFileSync,mkdirSync} from "node:fs";
import path from "node:path";
import {seed,gateway,passwords,cashDay} from "../helpers/cash-fixture";
import {Driver} from "../helpers/admin-products-settings-volume";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {createInventoryService} from "../../src/server/inventory/service";
import {createSalesService} from "../../src/server/sales/service";
import {createCashService} from "../../src/server/cash/service";
import {canonical,digest} from "../../src/server/inventory/validation";
import {MONEY_POLICY} from "../../src/server/sales/calculations";
import {cashSaleIntentHash} from "../../src/server/cash/sale-intent";
import type {SqlValue} from "../../src/server/db/connection";
const evidence=path.resolve("test-results/phase2-integration-20261115");mkdirSync(evidence,{recursive:true});
const progress=(stage:string)=>writeFileSync(path.join(evidence,"retained-sales-capacity-progress.json"),JSON.stringify({stage,atMs:Date.now(),productionActivation:false}));
beforeAll(seed);
test("minimum50k actually retained paid sales: genuine schema, exact stock/money, recent/old searches and cash latency",async()=>{
 const imported=process.env.SHOP_POS_RETAINED_SALES_SOURCE?await importRetainedPaidSales(process.env.SHOP_POS_RETAINED_SALES_SOURCE,progress):null;
 const f=imported?null:await gateway(),count=50000,config=imported?.config??f!.config;
 let productId:string,invoiceId:string,sampleId:string;
 if(f){
 const inventory=createInventoryService(f.g,40),sales=createSalesService(f.g,"TEST SHOP",40),cash=createCashService(f.g,"TEST SHOP");
 try{
  const p=await inventory.createProduct(f.admin,{requestKey:randomUUID(),name:"SYNTHETIC retained sales capacity",unit:"PACK",buyingPricePaisa:"10000",sellingPricePaisa:"11000",sellingActive:true,openingQuantity:"50001",lowStockThreshold:"1"});productId=p.product.id;
  const command={requestKey:randomUUID(),context:(await sales.context(f.staff)).context,lines:[{productId,quantity:"1",unitPricePaisa:"11000",discountPercent:"0"}],cashPaisa:"11000",customerName:"SYNTHETIC TEST",customerPhone:"",cashDate:cashDay()};
  await cash.admit(f.staff,"SALESPERSON",{kind:"SALE",key:command.requestKey,input:command});invoiceId=(await sales.create(f.staff,command)).id;
 }finally{await f.g.close();}
 // Synthetic volume ONLY: derive complete consistent rows from one genuine command
 // after its sole owner closes. This is not 50k individual API/atomicity evidence.
 const filename=path.join(config.database.directory,"test.sqlite3"),raw=new Driver(filename);raw.defaultSafeIntegers(true);raw.pragma("foreign_keys=ON");raw.pragma("cache_size=-65536");
 sampleId=invoiceId!;
 try{
  const sale=raw.prepare("SELECT * FROM sales WHERE id=?").get(invoiceId!)!,line=raw.prepare("SELECT * FROM sale_lines WHERE invoice_id=?").get(invoiceId!)!,payment=raw.prepare("SELECT * FROM sale_payments WHERE invoice_id=?").get(invoiceId!)!,operation=raw.prepare("SELECT * FROM sale_operations WHERE id=?").get(sale.operation_id)!,admission=raw.prepare("SELECT * FROM counter_cash_admissions WHERE source_key=?").get(operation.request_key)!;
  const select:Record<string,[string,SqlValue]>={sale_operations:["id",operation.id],sales:["id",invoiceId!],sale_lines:["id",line.id],sale_payments:["id",payment.id],invoice_snapshots:["invoice_id",invoiceId!],stock_movements:["sale_line_id",line.id],financial_events:["sale_line_id",line.id],cash_movements:["sale_payment_id",payment.id],counter_cash_admissions:["id",admission.id],counter_cash_admission_resolutions:["admission_id",admission.id],cash_flow_evidence:["admission_id",admission.id]};
  const prototypes=Object.fromEntries(Object.entries(select).map(([table,[column,value]])=>[table,raw.prepare("SELECT * FROM "+table+" WHERE "+column+"=?").all(value)]));
  if(Object.values(prototypes).some(rows=>rows.length!==1))throw Error("Incomplete genuine paid-sale prototype");
  const insert=Object.fromEntries(Object.entries(prototypes).map(([table,rows])=>{const columns=Object.keys(rows[0]);return [table,{columns,statement:raw.prepare("INSERT INTO "+table+"("+columns.join(",")+") VALUES("+columns.map(()=>"?").join(",")+")")}];}));
  const balance=raw.prepare("SELECT * FROM stock_balances WHERE product_id=?").get(productId!)!;
  raw.transaction(()=>{
   raw.pragma("defer_foreign_keys=ON");
   for(let i=1;i<count;i++){
    const ids=new Map<string,string>();for(const rows of Object.values(prototypes))for(const row of rows)if(typeof row.id==="string")ids.set(row.id,randomUUID());ids.set(String(operation.request_key),randomUUID());
    const replace=(value:unknown):unknown=>typeof value==="string"?(ids.get(value)??(value.startsWith("TEST-")&&ids.has(value.slice(5))?"TEST-"+ids.get(value.slice(5)):value)):Array.isArray(value)?value.map(replace):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)])):value;
    for(const [table,rows]of Object.entries(prototypes))for(const original of rows){
     const row=Object.fromEntries(Object.entries(original).map(([k,v])=>[k,typeof v==="string"?replace(v):v])) as Record<string,SqlValue>;
     for(const key of Object.keys(row).filter(k=>k.endsWith("_json"))){const value=replace(JSON.parse(String(row[key]))),prefix=key.slice(0,-5);row[key]=canonical(value);if(prefix+"_hash" in row)row[prefix+"_hash"]=digest(value);if(prefix+"_digest" in row)row[prefix+"_digest"]=digest(value);}
     if(table==="invoice_snapshots")row.sha256=digest(JSON.parse(String(row.receipt_json)));
     if(table==="sale_operations")row.payload_hash=digest({kind:"SALE",policy:MONEY_POLICY,...JSON.parse(String(row.payload_json))});
     if(table==="counter_cash_admissions")row.payload_hash=cashSaleIntentHash(JSON.parse(String(row.payload_json)).intent);
     if(table==="stock_movements"){row.before_q=BigInt(String(balance.sellable_q))-BigInt(i-1)*BigInt(1000000);row.after_q=BigInt(String(row.before_q))-BigInt(1000000);row.balance_version=BigInt(String(balance.version))+BigInt(i);}
     insert[table].statement.run(...insert[table].columns.map(k=>row[k]));
    }
    if(i===count-1)sampleId=ids.get(invoiceId!)!;
   }
   const remaining=BigInt(String(balance.sellable_q))-BigInt(count-1)*BigInt(1000000);
   raw.prepare("UPDATE stock_balances SET sellable_q=?,stock_value_m=?,version=? WHERE product_id=?").run(remaining,remaining*BigInt(String(balance.cost_m))/BigInt(1000000),BigInt(String(balance.version))+BigInt(count-1),productId!);
   if(raw.pragma("foreign_key_check").length)throw Error("Capacity fixture FK failure");
  })();
 }finally{raw.close();}
 }else{
  const raw=new Driver(path.join(config.database.directory,"test.sqlite3"),{readonly:true,fileMustExist:true});try{raw.defaultSafeIntegers(true);productId=String(raw.prepare("SELECT id FROM products WHERE name='SYNTHETIC retained sales capacity'").get()!.id);sampleId=String(raw.prepare("SELECT invoice_id FROM sale_lines WHERE product_id=? ORDER BY rowid DESC LIMIT 1").get(productId)!.invoice_id);}finally{raw.close();}
 }
 progress("GATEWAY_REOPEN");const g=await openAuthorizationGateway(config,40),metrics:Record<string,unknown>={format:"SHOP_POS_RETAINED_PAID_SALES_CAPACITY_V1",synthetic:true,directory:config.database.directory,target:count,productionActivation:false};
 try{
  const admin=await (await import("../helpers/cash-fixture")).credentials(g,config,"ADMIN"),staff=await (await import("../helpers/cash-fixture")).credentials(g,config,"SALESPERSON"),api=createSalesService(g,"TEST SHOP",40),book=createCashService(g,"TEST SHOP");
  const retained=await g.withAdminTransaction(admin,tx=>tx.get("SELECT count(*) AS n FROM sales"));expect(BigInt(String(retained?.n))).toBeGreaterThanOrEqual(BigInt(count));metrics.retainedSales=String(retained?.n);
  progress("HISTORY_SEARCH");const start=performance.now();expect((await api.history(staff,undefined,"TEST-"+sampleId)).items.map(r=>r.id)).toContain(sampleId);metrics.invoiceSearchMs=performance.now()-start;
  progress("CATALOG_SEARCH");const catalogStart=performance.now();expect((await api.catalog(staff,"SYNTHETIC retained sales capacity")).items.some(p=>p.id===productId!)).toBe(true);metrics.productSearchMs=performance.now()-catalogStart;
  expect((await api.get(staff,sampleId)).totalPaisa).toBe("11000");
  const saved=await inventorySnapshot();expect(saved).toMatchObject({quantity:"1",cost:"10000"});metrics.stock=saved;
  const actionMetrics:{action:string;key:string;contextMs?:number;prepareMs?:number;executeMs?:number;stage:string}[]=[];metrics.cashActions=actionMetrics;
  const act=async(action:Parameters<typeof book.prepare>[4],input:unknown)=>{
   const entry:typeof actionMetrics[number]={action,key:randomUUID(),stage:"CONTEXT"};actionMetrics.push(entry);let at=performance.now();
   const ctx=(await book.context(admin)).context;entry.contextMs=performance.now()-at;entry.stage="PREPARE";at=performance.now();
   try{await book.prepare(admin,passwords.ADMIN,entry.key,ctx,action,input);}finally{entry.prepareMs=performance.now()-at;}
   entry.stage="EXECUTE";at=performance.now();let out;try{out=await book.execute(admin,entry.key,ctx,"ADMIN_VERIFIED_CASH_FACTS");}finally{entry.executeMs=performance.now()-at;}
   expect(out.state).toBe("COMMITTED");entry.stage="COMMITTED";return out.result as Record<string,unknown>;
  };
  progress("COUNT_WORKFLOW");const counted=performance.now(),session=await act("START_COUNT",{businessDate:"2026-10-07",evidence:"SYNTHETIC observed count; historical opening unknown"}),result=await act("RECORD_COUNT",{sessionId:session.sessionId,actualPaisa:"0",evidence:"SYNTHETIC observed zero; no invented historical balance"});metrics.countMs=performance.now()-counted;
  progress("CLOSING_WORKFLOW");const review=await book.summary(admin,"2026-10-07",String(result.countId)),closing=performance.now();expect((await act("CLOSE_DAY",{businessDate:"2026-10-07",countId:result.countId,sourceDigest:review.sourceDigest,allowUnreconciled:"YES",evidence:"SYNTHETIC missing historical evidence explicitly retained"})).status).toBe("UNRECONCILED");metrics.closeMs=performance.now()-closing;
  metrics.execution="COMPLETED";progress("COMPLETED");writeFileSync(path.join(evidence,"retained-sales-capacity.json"),JSON.stringify(metrics,null,2));
  expect(metrics.invoiceSearchMs).toBeLessThanOrEqual(3000);expect(metrics.productSearchMs).toBeLessThanOrEqual(3000);expect(metrics.countMs).toBeLessThanOrEqual(10000);expect(metrics.closeMs).toBeLessThanOrEqual(10000);
  async function inventorySnapshot(){return g.withAdminTransaction(admin,async tx=>{const r=await tx.get("SELECT sellable_q,cost_m FROM stock_balances WHERE product_id=?",[productId!]);return {quantity:(BigInt(String(r?.sellable_q))/BigInt(1000000)).toString(),cost:String(r?.cost_m)};});}
 }catch(error){metrics.execution="FAILED";metrics.failure=error instanceof Error?error.message:"Capacity failed";writeFileSync(path.join(evidence,"retained-sales-capacity.json"),JSON.stringify(metrics,null,2));throw error;}finally{await g.close();}
},1200000);