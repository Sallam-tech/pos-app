import {beforeAll,afterAll,test,expect} from "vitest";
import {randomUUID,createHash,X509Certificate} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import path from "node:path";
import {chromium} from "playwright";
import {seed,gateway,passwords,cashDay} from "../helpers/admin-products-settings-fixture";
import {wire,login,material} from "../helpers/inventory-http-fixture";
import {createInventoryService} from "../../src/server/inventory/service";
import {createSalesService,type Receipt} from "../../src/server/sales/service";
import {createCashService} from "../../src/server/cash/service";
import {startLocalRuntime,type LocalRuntime,type LocalRuntimeConfiguration} from "../../src/server/hosting/runtime";
import {Driver} from "../helpers/reports-volume";

const evidence=path.resolve("test-results/phase2-integration-20261115","unicode-flow-"+randomUUID());
mkdirSync(evidence,{recursive:true});
const productName="ÄPFEL İSTANBUL دودھ";
let config:LocalRuntimeConfiguration,runtime:LocalRuntime,receipt:Receipt,staff:string[],admin:string[];
function counts(){
 const db=new Driver(path.join(config.authorization.database.directory,"test.sqlite3"),{readonly:true,fileMustExist:true});
 try{db.defaultSafeIntegers(true);return db.prepare("SELECT (SELECT count(*) FROM sales) AS sales,(SELECT count(*) FROM sale_operations) AS operations,(SELECT count(*) FROM stock_movements) AS movements,(SELECT count(*) FROM cash_movements) AS cash").get();}
 finally{db.close();}
}
const call=(endpoint:string,role:"ADMIN"|"SALESPERSON"="SALESPERSON")=>wire(config,endpoint,role,role==="ADMIN"?admin:staff);
beforeAll(async()=>{
 await seed();const f=await gateway();config=f.runtime;
 try{
  const inventory=createInventoryService(f.g,41),sales=createSalesService(f.g,"TEST SHOP",41),cash=createCashService(f.g,"TEST SHOP",41);
  const p=await inventory.createProduct(f.admin,{requestKey:randomUUID(),name:productName,unit:"PACK",buyingPricePaisa:"10000",sellingPricePaisa:"11000",sellingActive:true,openingQuantity:"12",lowStockThreshold:"2"});
  const command={requestKey:randomUUID(),context:(await sales.context(f.staff)).context,lines:[{productId:p.product.id,quantity:"3",unitPricePaisa:"11000",discountPercent:"5"}],cashPaisa:"32000",cashDate:cashDay()};
  await cash.admit(f.staff,"SALESPERSON",{kind:"SALE",key:command.requestKey,input:command});
  receipt=await sales.create(f.staff,command);expect(receipt.totalPaisa).toBe("31500");
  // Rename current catalog metadata: history searches must still use sold snapshots.
  const current=await inventory.getProduct(f.admin,{productId:p.product.id});
  await inventory.updateProduct(f.admin,{requestKey:randomUUID(),productId:p.product.id,expectedProductVersion:current.productVersion,name:"TEST renamed current catalog",reason:"TEST preserve sold name snapshot"});
 }finally{await f.g.close();}
 runtime=await startLocalRuntime(config);staff=await login(config,"SALESPERSON");admin=await login(config,"ADMIN");
});
afterAll(async()=>{await runtime?.close();});

test("saved Unicode invoice search agrees across Admin, Salesperson and refund APIs without replacing historical names",async()=>{
 const before=counts();
 for(const query of [productName,"äpfel","i\u0307stanbul",receipt.number.toLowerCase()]){
  const q=encodeURIComponent(query);
  const a=await call("/api/admin/invoices/history?from=2000-01-01&to="+cashDay()+"&query="+q,"ADMIN");
  const s=await call("/api/pos/sales?query="+q);
  const r=await call("/api/returns/invoices?query="+q);
  expect(a.status).toBe(200);expect(s.status).toBe(200);expect(r.status).toBe(200);
  expect(JSON.parse(a.body).items.map((v:{id:string})=>v.id)).toContain(receipt.id);
  expect(JSON.parse(s.body).items.map((v:{id:string})=>v.id)).toContain(receipt.id);
  expect(JSON.parse(r.body).items.map((v:{invoiceId:string})=>v.invoiceId)).toContain(receipt.id);
  expect(s.body+r.body).not.toMatch(/buyingPrice|cost_snapshot|grossProfit|stockBefore|password|credential/i);
 }
 for(const role of ["ADMIN","SALESPERSON"] as const){
  const endpoint=role==="ADMIN"?"/api/admin/invoices/history?from=2000-01-01&to="+cashDay()+"&query=":"/api/pos/sales?query=";
  expect(JSON.parse((await call(endpoint+encodeURIComponent("%' OR 1=1 --"),role)).body).items).toEqual([]);
 }
 expect(counts()).toEqual(before);
});

test("guest, wrong role and foreign Origin cannot read Admin history; bound sessions return saved original receipt",async()=>{
 const endpoint="/api/admin/invoices/history?from=2000-01-01&to="+cashDay();
 expect((await wire(config,endpoint,"ADMIN",[])).status).toBe(403);
 expect((await call(endpoint)).status).toBe(403);
 expect((await wire(config,endpoint,"ADMIN",admin,undefined,{headers:{origin:"https://foreign.invalid"}})).status).toBe(403);
 const saved=await call("/api/pos/sales/"+receipt.id);expect(saved.status).toBe(200);expect(JSON.parse(saved.body)).toEqual(receipt);
 expect(JSON.parse(saved.body).lines[0].name).toBe(productName);
 expect(saved.headers["cache-control"]).toContain("no-store");
});

test("actual Chromium saved-invoice search and ordinary/80mm print output create no financial effects",async()=>{
 const before=counts(),spki=createHash("sha256").update(new X509Certificate(material.certificate).publicKey.export({type:"spki",format:"der"})).digest("base64");
 const browser=await chromium.launch({headless:true,args:["--ignore-certificate-errors-spki-list="+spki]});
 try{
  const context=await browser.newContext({ignoreHTTPSErrors:false,viewport:{width:1280,height:900}}),page=await context.newPage();
  await page.goto(config.authorization.origins.SALESPERSON+"/login");
  await expect.poll(()=>page.getByRole("button",{name:"Open Shop",exact:true}).isEnabled(),{timeout:60000}).toBe(true);
  await page.locator("#login-password").fill(passwords.SALESPERSON);await page.getByRole("button",{name:"Open Shop",exact:true}).click();
  await expect.poll(()=>new URL(page.url()).pathname,{timeout:60000}).toBe("/pos");
  await page.goto(config.authorization.origins.SALESPERSON+"/pos/history");
  // The saved API result drives the approved history table; no fabricated UI fixture.
  const search=page.getByRole("textbox").first();await search.fill("äpfel");
  await page.getByRole("button",{name:/search/i}).click();
  const row=page.getByRole("row").filter({hasText:receipt.number});
  await row.getByRole("button",{name:/view/i}).click({timeout:60000});
  const dialog=page.getByRole("dialog").filter({hasText:receipt.number});await dialog.waitFor({timeout:60000});
  expect(await dialog.textContent()).toContain(productName);
  for(const layout of ["ordinary","compact"] as const){
   await dialog.getByRole("combobox").selectOption(layout);
   const portal=page.locator("#shop-pos-print-receipt");
   expect(await portal.getAttribute("data-layout")).toBe(layout);
   await page.emulateMedia({media:"print"});
   expect(await portal.isVisible()).toBe(true);
   expect(await portal.textContent()).toContain("315");
   expect(await portal.textContent()).toContain("Software Developed by: SalamTech");
   const pdf=await page.pdf({printBackground:true,preferCSSPageSize:true,...(layout==="compact"?{width:"80mm",height:"300mm"}:{format:"A4" as const})});
   expect(pdf.subarray(0,5).toString()).toBe("%PDF-");
   writeFileSync(path.join(evidence,"saved-invoice-"+layout+".pdf"),pdf);
   await page.emulateMedia({media:"screen"});
  }
  // A failed native dialog opening has no receipt/accounting effect; retry remains explicit.
  await page.evaluate(()=>{window.print=()=>{throw Error("TEST print dialog unavailable");};});
  await dialog.getByRole("button",{name:"Print",exact:true}).click();
  await dialog.getByRole("alert").filter({hasText:"The print dialog could not open"}).waitFor();
  await page.screenshot({path:path.join(evidence,"print-dialog-unavailable.png"),fullPage:true});
  await page.evaluate(()=>{window.print=()=>{document.documentElement.dataset.testPrintRequested="true";};});
  await dialog.getByRole("button",{name:"Print",exact:true}).click();
  expect(await dialog.getByRole("alert").count()).toBe(0);
  expect(await page.locator("html").getAttribute("data-test-print-requested")).toBe("true");
  expect(await dialog.textContent()).toContain(receipt.number);
  await page.screenshot({path:path.join(evidence,"saved-unicode-invoice.png"),fullPage:true});
  await context.close();
 }finally{await browser.close();}
 expect(counts()).toEqual(before);
});

test("actual HTTPS restart preserves original invoice and search, invalidates the prior session and never replays the sale",async()=>{
 const before=counts(),oldStaff=staff;await runtime.close();runtime=await startLocalRuntime(config);
 expect((await wire(config,"/api/pos/sales/"+receipt.id,"SALESPERSON",oldStaff)).status).toBe(403);
 staff=await login(config,"SALESPERSON");admin=await login(config,"ADMIN");
 const saved=await call("/api/pos/sales/"+receipt.id);expect(JSON.parse(saved.body)).toEqual(receipt);
 const history=await call("/api/pos/sales?query="+encodeURIComponent("äpfel"));expect(JSON.parse(history.body).items.map((v:{id:string})=>v.id)).toContain(receipt.id);
 expect(counts()).toEqual(before);
 writeFileSync(path.join(evidence,"unicode-workflow-result.json"),JSON.stringify({schema:41,invoiceId:receipt.id,originalSaleNotReplayed:true,restartDurable:true,financialCountsUnchanged:true,productionActivation:false}));
});
test("actual Chromium atomic count keeps frozen UI, local preview, fresh final password and original-key-only commits",async()=>{
 const before=counts(),spki=createHash("sha256").update(new X509Certificate(material.certificate).publicKey.export({type:"spki",format:"der"})).digest("base64"),browser=await chromium.launch({headless:true,args:["--ignore-certificate-errors-spki-list="+spki]});
 const posts:{url:string;status?:number}[]=[];
 try{
  const ctx=await browser.newContext({ignoreHTTPSErrors:false}),page=await ctx.newPage();
  page.on("response",r=>{if(r.request().method()==="POST"&&new URL(r.url()).pathname.startsWith("/api/admin/cash-actions"))posts.push({url:new URL(r.url()).pathname,status:r.status()});});
  await page.goto(config.authorization.origins.ADMIN+"/login");await expect.poll(()=>page.getByRole("button",{name:"Open Shop",exact:true}).isEnabled(),{timeout:60000}).toBe(true);await page.locator("#login-password").fill(passwords.ADMIN);await page.getByRole("button",{name:"Open Shop",exact:true}).click();await page.waitForURL(/\/admin\//,{timeout:60000});
  await page.goto(config.authorization.origins.ADMIN+"/admin/daily-closing");
  for(const [index,action,label]of [[0,"START_COUNT","Start Physical Count"],[1,"RECORD_COUNT","Record Counted Cash"]] as const){
   await page.getByRole("combobox",{name:"Cash Action",exact:true}).selectOption(action);
   if(index===1){expect(await page.locator("#cash-session").inputValue()).toMatch(/^[0-9a-f-]{36}$/);await page.locator("#actual-counter-cash").fill("315");}
   await page.locator("#cash-evidence").fill("TEST witnessed genuine browser count; unknown historical opening preserved");
   await page.locator("#cash-password").fill(passwords.ADMIN);await page.getByRole("button",{name:"Review "+label,exact:true}).click();
   await page.getByRole("button",{name:"Confirm Exact Cash Action",exact:true}).waitFor({timeout:60000});
   expect(posts.length).toBe(index);expect(await page.locator("#cash-recovery-password").inputValue()).toBe("");
   await page.getByRole("checkbox",{name:"I verified these exact cash facts and approve this action once.",exact:true}).check();
   await page.getByRole("button",{name:"Confirm Exact Cash Action",exact:true}).click();
   await page.getByRole("alert").filter({hasText:"Enter the Admin password for this exact count confirmation."}).waitFor();expect(posts.length).toBe(index);
   await page.locator("#cash-recovery-password").fill(passwords.ADMIN);await page.getByRole("button",{name:"Confirm Exact Cash Action",exact:true}).click();
   await page.getByRole("button",{name:/Acknowledge Original Outcome/}).waitFor({timeout:60000});
   expect(posts.length).toBe(index+1);expect(posts[index].status).toBe(200);expect(posts[index].url).toMatch(/\/[0-9a-f-]{36}\/execute$/);
   await page.getByRole("button",{name:/Acknowledge Original Outcome/}).click();await page.getByRole("combobox",{name:"Cash Action",exact:true}).waitFor({timeout:60000});
  }
  expect(counts()).toEqual(before);writeFileSync(path.join(evidence,"atomic-count-browser.json"),JSON.stringify({status:"PASS",posts,frozenUi:"separate exact JSX/CSS evidence",noFinancialEffectsOutsideCountMetadata:true},null,2));await ctx.close();
 }finally{await browser.close();}
},180000);
