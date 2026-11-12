import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openDatabase, type SqliteConnection } from "../../src/server/db/connection";
import { applyMigrations, loadMigrations } from "../../src/server/db/migrate";
import { openAuthorizationGateway } from "../../src/server/auth/gateway";
import { runTrustedFirstRunSetup } from "../../src/server/auth/provision";
import type { AuthorizationConfiguration, AuthorizationGateway, Role } from "../../src/server/auth/types";
import { inspectEnrollmentDatabase, enrollmentDigest } from "../../src/server/bootstrap/database";
import { createInventoryService } from "../../src/server/inventory/service";
import { InventoryError, type AdminProduct } from "../../src/server/inventory/contracts";
const probe=vi.hoisted(()=>({failAfter:"",lostAck:false,businessWrite:false,owners:0}));
vi.mock("../../src/server/auth/database",async original=>{
 const actual=await original<typeof import("../../src/server/auth/database")>();
 return {...actual,openAsyncOwner:(c:Parameters<typeof actual.openAsyncOwner>[0])=>{
  const owner=actual.openAsyncOwner(c),run=owner.run,scope=owner.scope;probe.owners++;
  const observed=(sql:string)=>{
   if(sql.startsWith("INSERT INTO inventory_operations")) probe.businessWrite=true;
   if(probe.failAfter && sql.startsWith(probe.failAfter)) {probe.failAfter="";throw new Error("TEST after native write");}
  };
  owner.run=(sql,values)=>{const result=run(sql,values);observed(sql);return result;};
  owner.scope=guard=>{const tx=scope(guard);return Object.freeze({...tx,async run(...args:Parameters<typeof tx.run>){
   const result=await tx.run(...args);observed(args[0]);return result;
  }});};return owner;
 }};
});
vi.mock("@better-auth/core/context",async original=>{
 const actual=await original<typeof import("@better-auth/core/context")>();
 return {...actual,runWithTransaction:async(...args:Parameters<typeof actual.runWithTransaction>)=>{
  const result=await actual.runWithTransaction(...args);
  if(probe.lostAck&&probe.businessWrite) {probe.lostAck=false;throw new Error("TEST lost commit acknowledgement");}
  return result;
 }};
});
const source=path.resolve("src/server/db/migrations"),root=path.resolve("test-results/sqlite-b1b-part1");mkdirSync(root,{recursive:true});
const run=mkdtempSync(path.join(root,"inventory-b2-")),base=path.join(run,"base"),authMigrations=path.join(run,"auth8"),enrolled8=path.join(run,"enrolled8");
const passwords={ADMIN:randomBytes(12).toString("base64url"),SALESPERSON:randomBytes(12).toString("base64url")};
const sensitive=new Set(Object.values(passwords)),gateways:AuthorizationGateway[]=[],readers:SqliteConnection[]=[],audits:(()=>void)[]=[];
const stable=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x);
const credentials=["auth_users","auth_credentials","auth_principals","auth_provisioning","auth_enrollment_binding"];
const authSnapshot=(db:SqliteConnection)=>stable(credentials.map(t=>db.all("SELECT * FROM "+t+" ORDER BY id")));
let authBefore="",oldHistory="",frozen:Record<string,string>={};
const hash=(file:string)=>createHash("sha256").update(readFileSync(file)).digest("hex");
const origin={ADMIN:"https://localhost:9773",SALESPERSON:"https://127.0.0.1:9773"};
function request(role:Role="ADMIN",cookie="") {return new Request(origin[role]+"/private-inventory",{headers:{origin:origin[role],...(cookie?{cookie}:{})}});}
async function login(gateway:AuthorizationGateway,role:Role="ADMIN") {
 const receipt=await(role==="ADMIN"?gateway.verifyAdminPassword(passwords.ADMIN):gateway.verifySalespersonPassword(passwords.SALESPERSON));
 const response=await(role==="ADMIN"?gateway.issueAdminSession(receipt):gateway.issueSalespersonSession(receipt));
 const cookies=response.headers.getSetCookie();expect(cookies.length).toBeGreaterThan(0);
 const cookie=cookies.map(c=>c.split(";")[0]).join("; ");
 sensitive.add(cookie);for(const c of cookies) {const value=decodeURIComponent(c.split(";")[0].split("=").slice(1).join("="));sensitive.add(value);sensitive.add(value.split(".")[0]);}
 return request(role,cookie);
}
async function fixture(authenticate=true) {
 const directory=mkdtempSync(path.join(run,"case-"));copyFileSync(path.join(base,"test.sqlite3"),path.join(directory,"test.sqlite3"));
 const database={directory,filename:"test.sqlite3",mode:"test" as const,create:false,busyTimeoutMs:75};
 const db=openDatabase(database);readers.push(db);
 const secrets={ADMIN:randomBytes(48).toString("base64url"),SALESPERSON:randomBytes(48).toString("base64url")};Object.values(secrets).forEach(x=>sensitive.add(x));
 const config:AuthorizationConfiguration={database,migrationsDirectory:source,origins:origin,signingSecrets:secrets,sessionLifetimeSeconds:3600};
 const ownerCount=probe.owners,gateway=await openAuthorizationGateway(config);gateways.push(gateway);expect(probe.owners-ownerCount).toBe(1);
 const api=createInventoryService(gateway),admin=authenticate?await login(gateway):request();
 const snapshot=()=>stable({products:db.all("SELECT * FROM products ORDER BY id"),balances:db.all("SELECT * FROM stock_balances ORDER BY product_id"),
  operations:db.all("SELECT * FROM inventory_operations ORDER BY id"),movements:db.all("SELECT * FROM stock_movements ORDER BY id"),
  events:db.all("SELECT * FROM product_events ORDER BY operation_id"),identifiers:db.all("SELECT * FROM product_identifiers ORDER BY product_id")});
 audits.push(()=>{
  expect(authSnapshot(db)===authBefore).toBe(true);expect(stable(db.all("SELECT * FROM schema_migrations WHERE version<=8 ORDER BY version"))===oldHistory).toBe(true);
  for(const suffix of ["","-wal","-shm"]) {const file=path.join(directory,"test.sqlite3")+suffix;if(existsSync(file)) {
   const bytes=readFileSync(file);expect([...sensitive].filter(s=>s.length>=8).some(s=>bytes.includes(Buffer.from(s)))).toBe(false);
  }}
 });
 return {api,gateway,admin,db,config,directory,snapshot};
}
function create(overrides:Record<string,unknown>={}) {return {requestKey:randomUUID(),name:"TEST product",unit:"PACK",buyingPricePaisa:"1250",sellingPricePaisa:"1800",sellingActive:true,openingQuantity:"5",lowStockThreshold:"2",...overrides};}
function edit(p:AdminProduct,extra:Record<string,unknown>={}) {return {requestKey:randomUUID(),productId:p.id,expectedProductVersion:p.productVersion,reason:"TEST reviewed correction",...extra};}
function stock(p:AdminProduct,extra:Record<string,unknown>={}) {return {...edit(p),expectedBalanceVersion:p.balanceVersion,...extra};}
async function denied(work:Promise<unknown>,code?:InventoryError["code"]) {
 let caught:unknown;try {await work;}catch(e){caught=e;}
 expect(caught instanceof InventoryError).toBe(true);const e=caught as InventoryError;
 expect(e.message).toBe("Product or inventory operation unavailable.");if(code) expect(e.code).toBe(code);
 expect([...sensitive].filter(s=>s.length>=8).some(s=>stable({message:e.message,stack:e.stack}).includes(s))).toBe(false);
 expect(e.cause).toBeUndefined();
}
beforeAll(async()=>{
 mkdirSync(base);mkdirSync(authMigrations);
 for(const name of readdirSync(source).filter(n=>/^000[1-8]_/.test(n))) copyFileSync(path.join(source,name),path.join(authMigrations,name));
 const database={directory:base,filename:"test.sqlite3",mode:"test" as const,create:true};
 let db=openDatabase(database);applyMigrations(db,authMigrations);db.close();
 await runTrustedFirstRunSetup({database:{...database,create:false},migrationsDirectory:authMigrations},async()=>passwords);
 db=openDatabase({...database,create:false});
 db.transaction(tx=>{tx.run("INSERT INTO auth_enrollment_binding VALUES(?,?,?,?,?,?,?)",[BigInt(1),BigInt(1),BigInt(1),randomUUID(),randomUUID(),randomUUID(),"0".repeat(64)]);});
 // Generic non-authorizing TEST binding above proves byte preservation, not trusted physical enrollment.
 authBefore=authSnapshot(db);oldHistory=stable(db.all("SELECT * FROM schema_migrations ORDER BY version"));
 // Closed TEST-only v8 copy for Part2 migration lifecycle verification; no custody/anchor files.
 db.close();mkdirSync(enrolled8);copyFileSync(path.join(base,"test.sqlite3"),path.join(enrolled8,"test.sqlite3"));db=openDatabase({...database,create:false});
 expect(applyMigrations(db,source)).toEqual({applied:10,version:BigInt(18)});expect(authSnapshot(db)===authBefore).toBe(true);db.close();
 const preserved=[...readdirSync(source).filter(n=>/^000[1-8]_/.test(n)).map(n=>path.join(source,n)),
  path.resolve("src/lib/admin/mock-inventory.ts"),path.resolve("src/app/api/health/route.ts")];frozen=Object.fromEntries(preserved.map(f=>[f,hash(f)]));
});
afterEach(async()=>{
 probe.failAfter="";probe.lostAck=probe.businessWrite=false;vi.restoreAllMocks();
 for(const g of gateways.splice(0)) await g.close();
 for(const audit of audits.splice(0)) audit();for(const db of readers.splice(0)) db.close();
 for(const [file,digest] of Object.entries(frozen)) expect(hash(file)).toBe(digest);
});

describe("B2 Part1 real private Products and Inventory",()=>{
 it("applies all 18 reviewed migrations to an empty TEST database with real STRICT and FK metadata",()=>{
  const directory=mkdtempSync(path.join(run,"empty-")),db=openDatabase({directory,filename:"test.sqlite3",mode:"test",create:true});readers.push(db);
  expect(applyMigrations(db,source)).toEqual({applied:18,version:BigInt(18)});expect(applyMigrations(db,source).applied).toBe(0);
  for(const name of ["products","inventory_operations","stock_balances","product_identifiers","stock_movements","product_events"])
   expect(db.get("SELECT strict FROM pragma_table_list WHERE schema='main' AND name=?",[name])?.strict).toBe(BigInt(1));
  expect(db.all("SELECT * FROM pragma_foreign_key_check")).toEqual([]);expect(db.get("SELECT count(*) AS n FROM products")?.n).toBe(BigInt(0));
 });
 it("preserves populated auth history, credentials, versions, latch and TEST binding during explicit upgrade",async()=>{
  const f=await fixture();expect(authSnapshot(f.db)===authBefore).toBe(true);
  expect(f.db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(18));
  expect(stable(f.db.all("SELECT * FROM schema_migrations WHERE version<=8 ORDER BY version"))===oldHistory).toBe(true);
  expect(f.db.get("SELECT count(*) AS n FROM products")?.n).toBe(BigInt(0));
 });
 it("creates a persistent product and exactly one positive opening movement with a cost snapshot",async()=>{
  const f=await fixture(),command=create({code:"TEST_A",barcode:"0012345",category:"TEST category",sizeLabel:"TEST small"});
  const r=await f.api.createProduct(f.admin,command);
  expect(await f.api.getProduct(f.admin,{productId:r.product.id})).toEqual(r.product);
  expect(r.product).toMatchObject({code:"TEST_A",barcode:"0012345",quantity:"5",stockValuePaisa:"6250",unit:"PACK",balanceVersion:"1"});
  const h=await f.api.listMovements(f.admin,{productId:r.product.id});expect(h.items).toHaveLength(1);
  expect(h.items[0]).toMatchObject({kind:"OPENING",beforeQuantity:"0",deltaQuantity:"5",afterQuantity:"5",buyingPricePaisa:"1250",actor:"ADMIN"});
  expect(await f.api.createProduct(f.admin,command)).toEqual(r);
  expect(f.db.get("SELECT count(*) AS n FROM inventory_operations")?.n).toBe(BigInt(1));
 });
 it("records zero opening without a zero movement and retains the zero-stock catalog entry",async()=>{
  const f=await fixture(),command=create({openingQuantity:"0",lowStockThreshold:"0"}),r=await f.api.createProduct(f.admin,command);
  expect(r.movementId).toBeNull();expect(r.product).toMatchObject({stockStatus:"OUT",stockValuePaisa:"0"});
  expect((await f.api.listMovements(f.admin,{productId:r.product.id})).items).toEqual([]);
  expect((await f.api.listProductEvents(f.admin,{productId:r.product.id})).items).toHaveLength(1);
  expect(f.db.get("SELECT opening_operation_id FROM stock_balances WHERE product_id=?",[r.product.id])?.opening_operation_id).toBe(r.operationId);
  expect((await f.api.listProducts(f.admin,{})).overall).toMatchObject({products:"1",quantity:"0",lowStock:"1",outOfStock:"1"});
  await denied(f.api.createProduct(f.admin,{...command,openingQuantity:"1"}),"CONFLICT");
 });
 it("keeps whole PACK and BOX variants independent and rejects fractional or coerced quantities",async()=>{
  const f=await fixture(),a=await f.api.createProduct(f.admin,create({unit:"PACK",sizeLabel:"TEST 6"})),b=await f.api.createProduct(f.admin,create({unit:"BOX",sizeLabel:"TEST 12"}));
  expect(a.product.id).not.toBe(b.product.id);expect(a.product.code).not.toBe(b.product.code);
  expect((await f.api.listProducts(f.admin,{})).overall.quantity).toBe("10");
  for(const input of [{unit:"LOOSE"},{openingQuantity:"1.5"},{openingQuantity:1},{openingQuantity:"01"},{openingQuantity:"-1"}])
   await denied(f.api.createProduct(f.admin,create(input)),"INVALID_INPUT");
 });
 it("enforces unique stable codes and exact barcodes without partial creation",async()=>{
  const f=await fixture();await f.api.createProduct(f.admin,create({code:"TEST_UNIQUE",barcode:"000ABC"}));const before=f.snapshot();
  await denied(f.api.createProduct(f.admin,create({code:"TEST_UNIQUE"})),"CONFLICT");
  await denied(f.api.createProduct(f.admin,create({barcode:"000ABC"})),"CONFLICT");expect(f.snapshot()===before).toBe(true);
  expect((await f.api.createProduct(f.admin,create({barcode:"000abc"}))).product.barcode).toBe("000abc");
 });
 it("edits only approved metadata, rejects stale edits and denies quantity or cost fields on edit",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create());
  const updated=await f.api.updateProduct(f.admin,edit(r.product,{name:"TEST renamed",category:"TEST group",barcode:"0042",lowStockThreshold:"6"}));
  expect(updated.product).toMatchObject({name:"TEST renamed",category:"TEST group",barcode:"0042",quantity:"5",stockStatus:"LOW",productVersion:"2",balanceVersion:"1"});
  await denied(f.api.updateProduct(f.admin,edit(r.product,{name:"TEST stale"})),"CONFLICT");
  for(const extra of [{quantity:"100"},{buyingPricePaisa:"2000"},{unit:"BOX"},{code:"CHANGED"},{role:"ADMIN"}])
   await denied(f.api.updateProduct(f.admin,edit(updated.product,{name:"TEST invalid",...extra})),"INVALID_INPUT");
 });
 it("stops, resumes and archives without deleting physical stock or valuation",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create());
  const stopped=await f.api.setSellingStatus(f.admin,edit(r.product,{sellingActive:false}));
  expect((await f.api.listProducts(f.admin,{status:"STOPPED"})).items).toHaveLength(1);
  const resumed=await f.api.setSellingStatus(f.admin,edit(stopped.product,{sellingActive:true}));
  const archived=await f.api.archiveProduct(f.admin,edit(resumed.product));expect(archived.product.sellingActive).toBe(false);expect(archived.product.archivedAtMs).not.toBeNull();
  expect((await f.api.listProducts(f.admin,{status:"ARCHIVED"})).overall.stockValuePaisa).toBe("6250");
  expect((await f.api.listProducts(f.admin,{status:"SELLING"})).items).toEqual([]);
  await denied(f.api.setSellingStatus(f.admin,edit(archived.product,{sellingActive:true})),"CONFLICT");
  expect((await f.api.listMovements(f.admin,{productId:r.product.id})).items).toHaveLength(1);
 });
 it("requires a normal selling price for activation and rejects below-cost pricing",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create({sellingActive:false,sellingPricePaisa:null}));
  await denied(f.api.setSellingStatus(f.admin,edit(r.product,{sellingActive:true})),"INVALID_INPUT");
  await denied(f.api.setSellingPrice(f.admin,edit(r.product,{sellingPricePaisa:"1249"})),"INVALID_INPUT");
  const priced=await f.api.setSellingPrice(f.admin,edit(r.product,{sellingPricePaisa:"1250"}));
  expect((await f.api.setSellingStatus(f.admin,edit(priced.product,{sellingActive:true}))).product.sellingActive).toBe(true);
 });

 it("receives exactly once and returns the original saved result after a later edit",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create()),command=stock(r.product,{quantity:"3",unitBuyingPricePaisa:"1250",reference:"TEST receipt"});
  const received=await f.api.receiveStock(f.admin,command);expect(received.product).toMatchObject({quantity:"8",stockValuePaisa:"10000",balanceVersion:"2"});
  await f.api.updateProduct(f.admin,edit(received.product,{name:"TEST later"}));expect(await f.api.receiveStock(f.admin,command)).toEqual(received);
  const h=await f.api.listMovements(f.admin,{productId:r.product.id});expect(h.items).toHaveLength(2);expect(h.items[0]).toMatchObject({kind:"RECEIVE",deltaQuantity:"3",reference:"TEST receipt"});
  await denied(f.api.receiveStock(f.admin,{...command,quantity:"4"}),"CONFLICT");
 });
 it("blocks different-cost receiving without changing any state",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create()),before=f.snapshot();
  await denied(f.api.receiveStock(f.admin,stock(r.product,{quantity:"3",unitBuyingPricePaisa:"1300"})),"POLICY_PENDING");expect(f.snapshot()===before).toBe(true);
  expect((await f.api.receiveStock(f.admin,stock(r.product,{quantity:"1",unitBuyingPricePaisa:"1250"}))).product.quantity).toBe("6");
 });
 it("records signed physical corrections with required reasons and reconciles before/delta/after",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create());
  const adjusted=await f.api.correctStock(f.admin,stock(r.product,{targetQuantity:"2"}));expect(adjusted.product.stockStatus).toBe("LOW");
  expect((await f.api.listMovements(f.admin,{productId:r.product.id})).items[0]).toMatchObject({kind:"ADJUST",beforeQuantity:"5",deltaQuantity:"-3",afterQuantity:"2",buyingPricePaisa:"1250"});
  const empty=await f.api.correctStock(f.admin,stock(adjusted.product,{targetQuantity:"0"}));expect(empty.product.stockStatus).toBe("OUT");
  await denied(f.api.correctStock(f.admin,stock(empty.product,{targetQuantity:"1",reason:""})),"INVALID_INPUT");
  await denied(f.api.correctStock(f.admin,stock(empty.product,{targetQuantity:"-1"})),"INVALID_INPUT");
  expect(f.db.get("SELECT sum(delta_q) AS n FROM stock_movements WHERE product_id=?",[r.product.id])?.n).toBe(BigInt(0));
 });
 it("reprices every remaining unit but preserves earlier cost snapshots and normal selling price",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create()),prior=stable(f.db.all("SELECT * FROM stock_movements"));
  const changed=await f.api.changeBuyingCost(f.admin,stock(r.product,{buyingPricePaisa:"2000",confirmAllRemaining:true}));
  expect(changed.product).toMatchObject({quantity:"5",buyingPricePaisa:"2000",sellingPricePaisa:"1800",stockValuePaisa:"10000",priceNeedsReview:true});
  expect(changed.valuationDeltaPaisa).toBe("3750");expect(changed.movementId).toBeNull();expect(stable(f.db.all("SELECT * FROM stock_movements"))===prior).toBe(true);
  const events=await f.api.listProductEvents(f.admin,{productId:r.product.id});expect(events.items).toHaveLength(2);
  expect(events.items.find(e=>e.kind==="CREATE")?.after.buyingPricePaisa).toBe("1250");
  expect(events.items.find(e=>e.kind==="REPRICE")?.before?.buyingPricePaisa).toBe("1250");
  const stopped=await f.api.setSellingStatus(f.admin,edit(changed.product,{sellingActive:false}));
  await denied(f.api.setSellingStatus(f.admin,edit(stopped.product,{sellingActive:true})),"INVALID_INPUT");
 });
 it("includes zero in low-stock totals and separates filtered totals from overall and pagination",async()=>{
  const f=await fixture();for(const openingQuantity of ["0","2","3"]) await f.api.createProduct(f.admin,create({openingQuantity}));
  const low=await f.api.listProducts(f.admin,{stock:"LOW",limit:1});expect(low.filtered).toEqual({products:"2",quantity:"2",lowStock:"2",outOfStock:"1",stockValuePaisa:"2500"});
  expect(low.overall).toEqual({products:"3",quantity:"5",lowStock:"2",outOfStock:"1",stockValuePaisa:"6250"});expect(low.nextCursor).not.toBeNull();
  const next=await f.api.listProducts(f.admin,{stock:"LOW",limit:1,cursor:low.nextCursor});expect(next.items).toHaveLength(1);expect(next.items[0].id).not.toBe(low.items[0].id);expect(next.filtered).toEqual(low.filtered);
  expect((await f.api.listProducts(f.admin,{stock:"OUT"})).filtered.products).toBe("1");
 });
 it("supports bounded parameterized search without wildcard or SQL injection semantics",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create({name:"TEST needle_%'",code:"SEARCH_ME",barcode:"000ABC"}));
  for(const query of ["NEEDLE_%'","search_me","000ABC"]) expect((await f.api.listProducts(f.admin,{query})).items.map(p=>p.id)).toEqual([r.product.id]);
  expect((await f.api.listProducts(f.admin,{query:"' OR 1=1 --"})).items).toEqual([]);
  for(const input of [{limit:0},{limit:101},{limit:"50"},{cursor:"bad"},{query:"x".repeat(121)},{status:"ADMIN"},{status:["SELLING"]},{stock:"SECRET"}]) await denied(f.api.listProducts(f.admin,input),"INVALID_INPUT");
 });
 it("paginates stock movements by stable balance versions without losing history",async()=>{
  const f=await fixture(),a=await f.api.createProduct(f.admin,create()),b=await f.api.receiveStock(f.admin,stock(a.product,{quantity:"2",unitBuyingPricePaisa:"1250"}));
  await f.api.correctStock(f.admin,stock(b.product,{targetQuantity:"4"}));
  const first=await f.api.listMovements(f.admin,{productId:a.product.id,limit:1});expect(first.items[0].balanceVersion).toBe("3");
  const second=await f.api.listMovements(f.admin,{productId:a.product.id,limit:1,cursor:first.nextCursor});expect(second.items[0].balanceVersion).toBe("2");
  const third=await f.api.listMovements(f.admin,{productId:a.product.id,limit:1,cursor:second.nextCursor});expect(third.items[0].kind).toBe("OPENING");expect(third.nextCursor).toBeNull();
 });
 it("retains exact paisa beyond Number precision and rejects individual or aggregate int64 overflow",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create({buyingPricePaisa:"99999999999999",sellingPricePaisa:"99999999999999",openingQuantity:"100"}));
  expect(r.product.stockValuePaisa).toBe("9999999999999900");
  const before=f.snapshot();await denied(f.api.createProduct(f.admin,create({buyingPricePaisa:"99999999999999",sellingPricePaisa:"99999999999999",openingQuantity:"999999999999"})),"OVERFLOW");expect(f.snapshot()===before).toBe(true);
  await f.api.createProduct(f.admin,create({buyingPricePaisa:"50000000000000",sellingPricePaisa:"50000000000000",openingQuantity:"100000"}));
  await f.api.createProduct(f.admin,create({buyingPricePaisa:"50000000000000",sellingPricePaisa:"50000000000000",openingQuantity:"100000"}));
  await denied(f.api.listProducts(f.admin,{}),"UNAVAILABLE");
 });
 it("rejects malformed, oversized, noncanonical and unexpected mutation inputs without writes",async()=>{
  const f=await fixture(),before=f.snapshot();
  for(const input of [{name:" "},{name:"x".repeat(121)},{name:"\ud800"},{buyingPricePaisa:12.5},{buyingPricePaisa:"1.25"},{buyingPricePaisa:"0"},{openingQuantity:"1000000000000"},{openingQuantity:"9223372036854775808"},{sellingActive:"true"},{category:42},{barcode:" space"},{requestKey:"bad"},{sql:"DELETE"}]) await denied(f.api.createProduct(f.admin,create(input)));
  const getter=create();Object.defineProperty(getter,"name",{get(){throw new Error("must not run");},enumerable:true});await denied(f.api.createProduct(f.admin,getter),"INVALID_INPUT");
  expect(f.snapshot()===before).toBe(true);
 });
 it("serializes concurrent same-key receiving to a single effect",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create()),command=stock(r.product,{quantity:"2",unitBuyingPricePaisa:"1250"});
  const results=await Promise.all([f.api.receiveStock(f.admin,command),f.api.receiveStock(f.admin,command)]);expect(results[0]).toEqual(results[1]);
  expect((await f.api.getProduct(f.admin,{productId:r.product.id})).quantity).toBe("7");expect(f.db.get("SELECT count(*) AS n FROM stock_movements")?.n).toBe(BigInt(2));
 });
 it("rejects one of concurrent conflicting count, receive and reprice operations as stale",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create());
  const results=await Promise.allSettled([f.api.correctStock(f.admin,stock(r.product,{targetQuantity:"4"})),f.api.receiveStock(f.admin,stock(r.product,{quantity:"2",unitBuyingPricePaisa:"1250"})),f.api.changeBuyingCost(f.admin,stock(r.product,{buyingPricePaisa:"1300",confirmAllRemaining:true}))]);
  expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);expect(results.filter(x=>x.status==="rejected")).toHaveLength(2);
  const p=await f.api.getProduct(f.admin,{productId:r.product.id});expect(f.db.get("SELECT sum(delta_q) AS q FROM stock_movements")?.q).toBe(BigInt(p.quantity)*BigInt(1000000));
 });

 it.each(["INSERT INTO products","INSERT INTO inventory_operations","INSERT INTO stock_balances","INSERT INTO stock_movements","INSERT INTO product_events"])("rolls back all creation state after a real write fault at %s",async prefix=>{
  const f=await fixture(),before=f.snapshot();probe.failAfter=prefix;await denied(f.api.createProduct(f.admin,create()),"UNAVAILABLE");expect(f.snapshot()===before).toBe(true);
 });
 it("rolls back receiving after a native balance update fault without consuming its retry key",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create()),command=stock(r.product,{quantity:"2",unitBuyingPricePaisa:"1250"}),before=f.snapshot();
  probe.failAfter="UPDATE stock_balances";await denied(f.api.receiveStock(f.admin,command),"UNAVAILABLE");expect(f.snapshot()===before).toBe(true);
  expect((await f.api.receiveStock(f.admin,command)).product.quantity).toBe("7");
 });
 it("does not publish success when the real SQLite COMMIT fails its deferred foreign key check",async()=>{
  const f=await fixture();let armed=true,faults=0;
  interface Native {inTransaction:boolean;pragma(sql:string):unknown;prepare(sql:string):{run():unknown}}
  const Native=createRequire(import.meta.url)("better-sqlite3") as {prototype:Native},prepare=Native.prototype.prepare;
  vi.spyOn(Native.prototype,"prepare").mockImplementation(function(this:Native,sql:string){
   if(armed&&probe.businessWrite&&/^commit$/i.test(sql.trim())&&this.inTransaction) {
    armed=false;faults++;this.pragma("defer_foreign_keys=ON");prepare.call(this,"INSERT INTO product_identifiers VALUES('TEST_MISSING','BARCODE','TEST_ORPHAN')").run();
   }return prepare.call(this,sql);
  });
  const before=f.snapshot();await denied(f.api.createProduct(f.admin,create()),"UNAVAILABLE");expect(faults).toBe(1);expect(f.snapshot()===before).toBe(true);
 });
 it("recovers a lost native COMMIT acknowledgement by replaying the committed result without double stock",async()=>{
  const f=await fixture(),command=create();probe.businessWrite=false;probe.lostAck=true;
  await denied(f.api.createProduct(f.admin,command),"UNAVAILABLE");expect(f.db.get("SELECT count(*) AS n FROM products")?.n).toBe(BigInt(1));
  const replay=await f.api.createProduct(f.admin,command);expect(replay.product.quantity).toBe("5");
  expect(f.db.get("SELECT count(*) AS n FROM inventory_operations")?.n).toBe(BigInt(1));expect(f.db.get("SELECT count(*) AS n FROM stock_movements")?.n).toBe(BigInt(1));
 });
 it("denies Salesperson, wrong-origin, missing and revoked Admin cookies on every private operation",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create()),staff=await login(f.gateway,"SALESPERSON"),before=f.snapshot();
  for(const req of [request(),staff,request("ADMIN",staff.headers.get("cookie")!)]) {
   await denied(f.api.getProduct(req,{productId:r.product.id}),"UNAVAILABLE");await denied(f.api.listProducts(req,{}),"UNAVAILABLE");
   await denied(f.api.listMovements(req,{productId:r.product.id}),"UNAVAILABLE");await denied(f.api.listProductEvents(req,{productId:r.product.id}),"UNAVAILABLE");
   await denied(f.api.createProduct(req,create()),"UNAVAILABLE");await denied(f.api.updateProduct(req,edit(r.product,{name:"TEST forbidden"})),"UNAVAILABLE");
   await denied(f.api.setSellingPrice(req,edit(r.product,{sellingPricePaisa:"1900"})),"UNAVAILABLE");await denied(f.api.setSellingStatus(req,edit(r.product,{sellingActive:false})),"UNAVAILABLE");
   await denied(f.api.archiveProduct(req,edit(r.product)),"UNAVAILABLE");await denied(f.api.receiveStock(req,stock(r.product,{quantity:"1",unitBuyingPricePaisa:"1250"})),"UNAVAILABLE");
   await denied(f.api.correctStock(req,stock(r.product,{targetQuantity:"1"})),"UNAVAILABLE");await denied(f.api.changeBuyingCost(req,stock(r.product,{buyingPricePaisa:"1300",confirmAllRemaining:true})),"UNAVAILABLE");
  }
  await f.gateway.logoutAdmin(f.admin);await denied(f.api.getProduct(f.admin,{productId:r.product.id}),"UNAVAILABLE");expect(f.snapshot()===before).toBe(true);
 });
 it("fails closed on an unavailable authorization registry without exposing SQL or costs",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create()),before=f.snapshot();
  f.db.transaction(tx=>{tx.run("DELETE FROM auth_session_authorizations");});
  await denied(f.api.listProducts(f.admin,{}),"UNAVAILABLE");await denied(f.api.receiveStock(f.admin,stock(r.product,{quantity:"1",unitBuyingPricePaisa:"1250"})),"UNAVAILABLE");expect(f.snapshot()===before).toBe(true);
 });
 it("rejects a corrupted ledger rather than inventing zero stock or continuing writes",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create());f.db.transaction(tx=>{tx.run("DELETE FROM stock_movements WHERE product_id=?",[r.product.id]);});const before=f.snapshot();
  await denied(f.api.getProduct(f.admin,{productId:r.product.id}),"UNAVAILABLE");await denied(f.api.listProducts(f.admin,{}),"UNAVAILABLE");
  await denied(f.api.receiveStock(f.admin,stock(r.product,{quantity:"1",unitBuyingPricePaisa:"1250"})),"UNAVAILABLE");expect(f.snapshot()===before).toBe(true);
 });
 it("enforces native STRICT, FK, exact cached value and whole-unit checks independently of service validation",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create()),before=f.snapshot();
  for(const [sql,values] of [
   ["UPDATE products SET current_cost_m='not an integer' WHERE id=?",[r.product.id]],
   ["UPDATE products SET current_cost_m=? WHERE id=?",[BigInt(1300),r.product.id]],
   ["UPDATE stock_balances SET sellable_q=? WHERE product_id=?",[BigInt(1),r.product.id]],
   ["UPDATE stock_balances SET stock_value_m=? WHERE product_id=?",[BigInt(0),r.product.id]],
   ["DELETE FROM products WHERE id=?",[r.product.id]],
  ] as const) expect(()=>f.db.transaction(tx=>{tx.run(sql,values);})).toThrow();
  expect(f.snapshot()===before).toBe(true);expect(f.db.all("SELECT * FROM pragma_foreign_key_check")).toEqual([]);
 });
 it("retains inventory across owner reopen and an independent Node process while rejecting the old session",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create()),received=await f.api.receiveStock(f.admin,stock(r.product,{quantity:"2",unitBuyingPricePaisa:"1250"}));
  const before=f.snapshot();await f.gateway.close();
  const result=await promisify(execFile)(process.execPath,[path.resolve("tests/helpers/inventory-readonly-child.cjs"),path.join(f.directory,"test.sqlite3"),r.product.id],{windowsHide:true});
  expect(result.stderr).toBe("");expect(JSON.parse(result.stdout)).toEqual({quantityQ:"7000000",stockValuePaisa:"8750",movements:"2",schemaVersion:"18"});
  const next=await openAuthorizationGateway(f.config);gateways.push(next);const api=createInventoryService(next);
  await denied(api.getProduct(f.admin,{productId:r.product.id}),"UNAVAILABLE");const admin=await login(next);
  expect(await api.getProduct(admin,{productId:r.product.id})).toEqual(received.product);expect(f.snapshot()===before).toBe(true);
 });
 it("rejects rollback clocks without partial mutations",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create()),before=f.snapshot(),wall=Date.now();vi.spyOn(Date,"now").mockReturnValue(wall-60000);
  await denied(f.api.correctStock(f.admin,stock(r.product,{targetQuantity:"1"})),"UNAVAILABLE");expect(f.snapshot()===before).toBe(true);
 });
 it("keeps all inventory entry points server-only, adds no HTTP route and does not log secrets",async()=>{
  const f=await fixture(),log=vi.spyOn(console,"log"),warn=vi.spyOn(console,"warn"),error=vi.spyOn(console,"error");
  const r=await f.api.createProduct(f.admin,create());await denied(f.api.createProduct(f.admin,create({sql:"TEST malformed"})),"INVALID_INPUT");
  expect(log).not.toHaveBeenCalled();expect(warn).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();
  for(const name of readdirSync(path.resolve("src/server/inventory")).filter(n=>n.endsWith(".ts"))) {
   const content=readFileSync(path.resolve("src/server/inventory",name),"utf8");expect(content.startsWith('import "server-only";')).toBe(true);expect(content.includes("testUtils")).toBe(false);
  }
  const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
  const app=walk(path.resolve("src/app"));expect(app.filter(f=>/route\.ts$/.test(f)).map(f=>path.relative(path.resolve("src/app"),f).replaceAll("\\","/"))).toEqual(["api/health/route.ts"]);
  expect(app.some(file=>readFileSync(file,"utf8").includes("server/inventory"))).toBe(false);
  const json=stable(r);expect([...sensitive].filter(s=>s.length>=8).some(s=>json.includes(s))).toBe(false);expect(json.includes("actor_session_ref")).toBe(false);
 });
 it("does not replay a successful receipt over corrupted current inventory or arbitrary stored result fields",async()=>{
  const f=await fixture(),command=create(),r=await f.api.createProduct(f.admin,command);
  f.db.transaction(tx=>{tx.run("UPDATE inventory_operations SET result_json=? WHERE id=?",[JSON.stringify({unexpected:"TEST corrupt"}),r.operationId]);});
  await denied(f.api.createProduct(f.admin,command),"UNAVAILABLE");
  f.db.transaction(tx=>{tx.run("UPDATE inventory_operations SET result_json=? WHERE id=?",[stable(r),r.operationId]);tx.run("DELETE FROM stock_movements WHERE product_id=?",[r.product.id]);});
  await denied(f.api.createProduct(f.admin,command),"UNAVAILABLE");
 });
 it("serializes competing product creation with the same unique code",async()=>{
  const f=await fixture(),results=await Promise.allSettled([f.api.createProduct(f.admin,create({code:"RACING_CODE"})),f.api.createProduct(f.admin,create({code:"RACING_CODE"}))]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
  expect(f.db.get("SELECT count(*) AS n FROM stock_movements")?.n).toBe(BigInt(1));
 });
 it("rejects quantity capacity and version overflow without altering balances or history",async()=>{
  const f=await fixture(),r=await f.api.createProduct(f.admin,create({openingQuantity:"1",buyingPricePaisa:"1",sellingPricePaisa:"1"}));
  await denied(f.api.receiveStock(f.admin,stock(r.product,{quantity:"999999999999",unitBuyingPricePaisa:"1"})),"INVALID_INPUT");
  f.db.transaction(tx=>{tx.run("UPDATE stock_balances SET version=? WHERE product_id=?",[BigInt("9223372036854775807"),r.product.id]);});
  const before=f.snapshot();await denied(f.api.correctStock(f.admin,stock({...r.product,balanceVersion:"9223372036854775807"},{targetQuantity:"0"})),"OVERFLOW");expect(f.snapshot()===before).toBe(true);
 });
 it("preserves a generic pre-existing TEST historical snapshot across metadata edits and repricing",async()=>{
  const f=await fixture();f.db.transaction(tx=>{tx.run("CREATE TABLE test_preserved_snapshot(id TEXT PRIMARY KEY,cost_m INTEGER NOT NULL) STRICT");tx.run("INSERT INTO test_preserved_snapshot VALUES(?,?)",["TEST_HISTORY",BigInt(1250)]);});
  const before=stable(f.db.all("SELECT * FROM test_preserved_snapshot")),r=await f.api.createProduct(f.admin,create()),updated=await f.api.updateProduct(f.admin,edit(r.product,{name:"TEST renamed"}));
  await f.api.changeBuyingCost(f.admin,stock(updated.product,{buyingPricePaisa:"1400",confirmAllRemaining:true}));
  expect(stable(f.db.all("SELECT * FROM test_preserved_snapshot"))===before).toBe(true);
 });
 it("serializes logout with admitted inventory work and denies all later stale-cookie reads",async()=>{
  const f=await fixture(),pending=f.api.createProduct(f.admin,create()),logout=f.gateway.logoutAdmin(f.admin);
  const result=await pending;await logout;expect(f.db.get("SELECT id FROM products WHERE id=?",[result.product.id])?.id).toBe(result.product.id);
  await denied(f.api.getProduct(f.admin,{productId:result.product.id}),"UNAVAILABLE");expect(f.db.get("SELECT count(*) AS n FROM stock_movements")?.n).toBe(BigInt(1));
 });

 it("filters available physical stock and receives twenty onto fifty exactly once",async()=>{
  const f=await fixture(),a=await f.api.createProduct(f.admin,create({openingQuantity:"50"}));await f.api.createProduct(f.admin,create({openingQuantity:"0"}));
  const command=stock(a.product,{quantity:"20",unitBuyingPricePaisa:"1250"}),r=await f.api.receiveStock(f.admin,command);expect(r.product.quantity).toBe("70");
  expect(await f.api.receiveStock(f.admin,command)).toEqual(r);const result=await f.api.listProducts(f.admin,{stock:"AVAILABLE"});
  expect(result.filtered).toMatchObject({products:"1",quantity:"70",outOfStock:"0",stockValuePaisa:"87500"});expect(result.overall.products).toBe("2");expect(result.items.map(p=>p.id)).toEqual([a.product.id]);
 });
 it("rolls back an additive business migration batch failure and recovers without changing earlier history",()=>{
  const directory=mkdtempSync(path.join(run,"migration-failure-")),bad=mkdtempSync(path.join(run,"bad-migrations-")),db=openDatabase({directory,filename:"test.sqlite3",mode:"test",create:true});readers.push(db);
  applyMigrations(db,authMigrations);const history=stable(db.all("SELECT * FROM schema_migrations ORDER BY version"));
  for(const name of readdirSync(source).filter(n=>n.endsWith(".sql")))copyFileSync(path.join(source,name),path.join(bad,name));
  writeFileSync(path.join(bad,"0019_test_duplicate.sql"),"CREATE TABLE products(v INTEGER) STRICT;\n",{flag:"wx"});
  expect(()=>applyMigrations(db,bad)).toThrow();expect(db.get("SELECT user_version FROM pragma_user_version")?.user_version).toBe(BigInt(8));expect(stable(db.all("SELECT * FROM schema_migrations ORDER BY version"))===history).toBe(true);
  expect(db.all("SELECT name FROM sqlite_schema WHERE name IN ('products','inventory_operations','stock_balances','stock_movements','product_events','product_identifiers')")).toEqual([]);
  expect(applyMigrations(db,source)).toEqual({applied:10,version:BigInt(18)});
 });

});

// B2 Part2 review: constraint-valid TEST corruption must not be acknowledged as healthy history.
describe("B2 Part2 integrity review",()=>{
 it("rejects a broken before/after chain even when the movement sum still equals the balance",async()=>{
  const f=await fixture(),a=await f.api.createProduct(f.admin,create()),b=await f.api.receiveStock(f.admin,stock(a.product,{quantity:"2",unitBuyingPricePaisa:"1250"}));
  f.db.transaction(tx=>{tx.run("UPDATE stock_movements SET before_q=?,after_q=? WHERE id=?",[BigInt(0),BigInt(2000000),b.movementId!]);});
  expect(f.db.all("SELECT * FROM pragma_foreign_key_check")).toEqual([]);
  expect(f.db.get("SELECT sum(delta_q) AS q FROM stock_movements")?.q).toBe(BigInt(7000000));
  const before=f.snapshot();await denied(f.api.getProduct(f.admin,{productId:a.product.id}),"UNAVAILABLE");
  await denied(f.api.listProducts(f.admin,{}),"UNAVAILABLE");
  await denied(f.api.receiveStock(f.admin,stock(b.product,{quantity:"1",unitBuyingPricePaisa:"1250"})),"UNAVAILABLE");expect(f.snapshot()===before).toBe(true);
 });
 it("rejects a product audit snapshot belonging to another valid product",async()=>{
  const f=await fixture(),a=await f.api.createProduct(f.admin,create()),b=await f.api.createProduct(f.admin,create({name:"TEST other product"}));
  f.db.transaction(tx=>{tx.run("UPDATE product_events SET after_json=? WHERE operation_id=?",[stable(b.product),a.operationId]);});
  const before=f.snapshot();await denied(f.api.listProductEvents(f.admin,{productId:a.product.id}),"UNAVAILABLE");expect(f.snapshot()===before).toBe(true);
 });
 it("rejects a missing before snapshot on a non-creation audit event",async()=>{
  const f=await fixture(),a=await f.api.createProduct(f.admin,create()),b=await f.api.updateProduct(f.admin,edit(a.product,{name:"TEST updated"}));
  f.db.transaction(tx=>{tx.run("UPDATE product_events SET before_json=NULL WHERE operation_id=?",[b.operationId]);});
  await denied(f.api.listProductEvents(f.admin,{productId:a.product.id}),"UNAVAILABLE");
 });
});

describe("B2 Part2 compatibility and integrity gates",()=>{
 it("accepts zero opening and legitimate repricing version gaps in an exact movement chain",async()=>{
  const f=await fixture(),a=await f.api.createProduct(f.admin,create({openingQuantity:"0"})),b=await f.api.changeBuyingCost(f.admin,stock(a.product,{buyingPricePaisa:"1300",confirmAllRemaining:true})),
   c=await f.api.receiveStock(f.admin,stock(b.product,{quantity:"5",unitBuyingPricePaisa:"1300"})),d=await f.api.changeBuyingCost(f.admin,stock(c.product,{buyingPricePaisa:"1400",confirmAllRemaining:true})),
   e=await f.api.correctStock(f.admin,stock(d.product,{targetQuantity:"2"})),g=await f.api.receiveStock(f.admin,stock(e.product,{quantity:"1",unitBuyingPricePaisa:"1400"}));
  expect(g.product).toMatchObject({quantity:"3",stockValuePaisa:"4200",balanceVersion:"6"});
  expect((await f.api.listMovements(f.admin,{productId:a.product.id})).items.map(m=>m.balanceVersion)).toEqual(["6","5","3"]);
  expect((await f.api.listProductEvents(f.admin,{productId:a.product.id})).items).toHaveLength(6);expect((await f.api.listProducts(f.admin,{})).overall.stockValuePaisa).toBe("4200");
 });
 it("rejects an unexpected before snapshot on a creation event",async()=>{
  const f=await fixture(),a=await f.api.createProduct(f.admin,create());f.db.transaction(tx=>{tx.run("UPDATE product_events SET before_json=? WHERE operation_id=?",[stable(a.product),a.operationId]);});
  await denied(f.api.listProductEvents(f.admin,{productId:a.product.id}),"UNAVAILABLE");
 });
 it("demonstrates missing database append-only guards without committing TEST history changes",async()=>{
  const f=await fixture(),a=await f.api.createProduct(f.admin,create()),before=f.snapshot();let accepted=0;
  expect(()=>f.db.transaction(tx=>{
   expect(tx.run("UPDATE inventory_operations SET reason=? WHERE id=?",["TEST changed history",a.operationId]).changes).toBe(BigInt(1));accepted++;
   expect(tx.run("UPDATE stock_movements SET cost_snapshot_m=? WHERE product_id=?",[BigInt(1300),a.product.id]).changes).toBe(BigInt(1));accepted++;
   expect(tx.run("DELETE FROM product_events WHERE product_id=?",[a.product.id]).changes).toBe(BigInt(1));accepted++;throw new Error("TEST rollback demonstrated writes");
  })).toThrow();expect(accepted).toBe(3);expect(f.snapshot()===before).toBe(true);
  expect(f.db.all("SELECT name FROM sqlite_schema WHERE type='trigger'")).toEqual([]);
 });
 it("preserves every auth row including a real registry session across8-to18, but bootstrap rejects18",async()=>{
  const directory=mkdtempSync(path.join(run,"upgrade-review-"));copyFileSync(path.join(enrolled8,"test.sqlite3"),path.join(directory,"test.sqlite3"));
  const database={directory,filename:"test.sqlite3",mode:"test" as const,create:false,busyTimeoutMs:75},db=openDatabase(database);readers.push(db);
  const secrets={ADMIN:randomBytes(48).toString("base64url"),SALESPERSON:randomBytes(48).toString("base64url")};Object.values(secrets).forEach(s=>sensitive.add(s));
  const config:AuthorizationConfiguration={database,migrationsDirectory:authMigrations,origins:origin,signingSecrets:secrets,sessionLifetimeSeconds:3600};
  const old=await openAuthorizationGateway(config);gateways.push(old);const oldRequest=await login(old);expect((await old.authorizeAdmin(oldRequest)).role).toBe("ADMIN");await old.close();
  const allAuth=()=>stable([...credentials,"auth_session_authorizations","auth_login_attempts"].map(t=>db.all("SELECT * FROM "+t+" ORDER BY 1"))),before=allAuth();
  expect(db.get("SELECT count(*) AS n FROM auth_session_authorizations")?.n).toBe(BigInt(1));
  const initial=await inspectEnrollmentDatabase({database,migrationsDirectory:authMigrations},()=>{});expect(initial.kind).toBe("ENROLLED");
  const digest8=enrollmentDigest(loadMigrations(authMigrations).map(m=>[m.version,m.name,m.checksum])),digest18=enrollmentDigest(loadMigrations(source).map(m=>[m.version,m.name,m.checksum]));expect(digest8===digest18).toBe(false);
  expect(applyMigrations(db,source)).toEqual({applied:10,version:BigInt(18)});expect(allAuth()===before).toBe(true);
  let read=0;await expect(runTrustedFirstRunSetup({database,migrationsDirectory:source},async()=>{read++;return passwords;})).rejects.toMatchObject({name:"ProvisioningRejected"});expect(read).toBe(0);
  await expect(inspectEnrollmentDatabase({database,migrationsDirectory:source},()=>{})).rejects.toMatchObject({name:"BootstrapRejected"});
  await expect(openAuthorizationGateway(config)).rejects.toMatchObject({name:"AuthorizationDenied"});
  const next=await openAuthorizationGateway({...config,migrationsDirectory:source});gateways.push(next);
  await expect(next.authorizeAdmin(oldRequest)).rejects.toMatchObject({name:"AuthorizationDenied"});expect((await next.authorizeAdmin(await login(next))).role).toBe("ADMIN");
 });
 it.each(["changed","partial","newer","marker"] as const)("rejects incompatible migration history %s without repair or account reset",async kind=>{
  const f=await fixture(false);await f.gateway.close();
  f.db.transaction(tx=>{
   if(kind==="changed")tx.run("UPDATE schema_migrations SET checksum=? WHERE version=?",["0".repeat(64),BigInt(9)]);
   if(kind==="partial")tx.run("DELETE FROM schema_migrations WHERE version=?",[BigInt(18)]);
   if(kind==="newer"){tx.run("INSERT INTO schema_migrations VALUES(?,?,?,?)",[BigInt(19),"0019_test_unknown.sql","0".repeat(64),BigInt(Date.now())]);tx.setSchemaVersion(BigInt(19));}
   if(kind==="marker")tx.setSchemaVersion(BigInt(17));
  });
  const before=stable({auth:authSnapshot(f.db),history:f.db.all("SELECT * FROM schema_migrations ORDER BY version"),marker:f.db.get("SELECT user_version FROM pragma_user_version")});
  await expect(openAuthorizationGateway(f.config)).rejects.toMatchObject({name:"AuthorizationDenied"});expect(()=>applyMigrations(f.db,source)).toThrow();
  expect(stable({auth:authSnapshot(f.db),history:f.db.all("SELECT * FROM schema_migrations ORDER BY version"),marker:f.db.get("SELECT user_version FROM pragma_user_version")})===before).toBe(true);
 });
});

describe("B2 Part2 schema attestation limitation",()=>{
 it("records that valid history alone does not reject an unexpected actual SQL object",async()=>{
  const f=await fixture(false);await f.gateway.close();f.db.transaction(tx=>{tx.run("CREATE TABLE test_untracked_object(v INTEGER) STRICT");});
  const before=f.snapshot();expect(applyMigrations(f.db,source)).toEqual({applied:0,version:BigInt(18)});
  const next=await openAuthorizationGateway(f.config);gateways.push(next);expect((await next.authorizeAdmin(await login(next))).role).toBe("ADMIN");
  expect(f.db.get("SELECT name FROM sqlite_schema WHERE name=?",["test_untracked_object"])?.name).toBe("test_untracked_object");expect(f.snapshot()===before).toBe(true);
  // This is evidence of an existing production gate, NOT approval to adopt unknown objects.
 });
});
