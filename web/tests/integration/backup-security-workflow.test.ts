import {beforeAll,test,expect} from "vitest";
import {randomUUID,randomBytes,createHash,X509Certificate} from "node:crypto";
import {mkdtempSync,writeFileSync,readdirSync} from "node:fs";
import path from "node:path";
import {chromium} from "playwright";
import {ready,seed,passwords,cashDay} from "../helpers/admin-products-settings-ready";
import {productId} from "../helpers/invoices-fixture";
import {login,wire,material} from "../helpers/inventory-http-fixture";
import {createReportsService} from "../../src/server/reports/service";
import {createTestCustody} from "../../src/server/backup/crypto";
import {configureTestBackups,reopenTestBackupConfiguration} from "../../src/server/backup/worker";
import {reopenTestRestore} from "../../src/server/backup/service";
import {startLocalRuntime,type LocalRuntime} from "../../src/server/hosting/runtime";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {credentials} from "../helpers/admin-products-settings-fixture";
beforeAll(seed);
test("actual Chromium -> Admin API -> encrypted backup/export -> isolated restore -> fresh login reconciles and recovers original key",async()=>{
 const f=await ready(),base=path.dirname(f.config.database.directory),dir=(name:string)=>mkdtempSync(path.join(base,name));
 const root=dir("workflow-jobs-"),exportDirectory=dir("workflow-export-"),custody=await createTestCustody(dir("workflow-vault-"));
 let runtime:LocalRuntime|undefined,sourceClosed=false;
 try{
  await f.opening("100000");await f.sale(productId,"2");await f.expense("1000");
  const period={from:"2000-01-01",to:cashDay(),asOf:String(Date.now())},before=await createReportsService(f.g,41).overview(f.admin,period);
  const configuration=await configureTestBackups(f.g,f.admin,passwords.ADMIN,custody,f.config.database,root,exportDirectory);
  await f.g.close();sourceClosed=true;
  const config={...f.runtime,testBackups:configuration,applicationDirectory:process.env.SHOP_POS_INVENTORY_BUILT_APP??f.runtime.applicationDirectory};
  runtime=await startLocalRuntime(config);
  const admin=await login(config),staff=await login(config,"SALESPERSON");
  const endpoint="/api/admin/backups/";
  for(const p of ["status","readiness","jobs/"+randomUUID()]){
   expect((await wire(config,endpoint+p,"SALESPERSON",staff)).status).toBe(403);
   expect((await wire(config,endpoint+p,"ADMIN",[])).status).toBe(403);
  }
  const malicious={key:randomUUID(),password:passwords.ADMIN,path:"C:\\outside"};
  expect((await wire(config,endpoint+"manual","ADMIN",admin,malicious)).status).not.toBe(202);
  expect((await wire(config,endpoint+"export","SALESPERSON",staff,{key:randomUUID(),archiveId:randomUUID(),password:passwords.ADMIN})).status).toBe(403);
  expect((await wire(config,endpoint+"manual","ADMIN",admin,{key:randomUUID(),password:passwords.ADMIN},{headers:{origin:"https://evil.example"}})).status).toBe(403);
  const statusReply=await wire(config,endpoint+"status","ADMIN",admin);
  expect(statusReply.headers["cache-control"]).toContain("no-store");expect(statusReply.body).not.toMatch(/AGE-SECRET|signingPrivate|directory|stockQuantity|profit|buyingPrice/);
  const browser=await chromium.launch({headless:true,args:["--ignore-certificate-errors-spki-list="+createHash("sha256").update(new X509Certificate(material.certificate).publicKey.export({type:"spki",format:"der"})).digest("base64")]});
  let key="";
  try{
   const context=await browser.newContext({ignoreHTTPSErrors:false}),page=await context.newPage();
   await page.goto(config.authorization.origins.ADMIN+"/login");
   await expect.poll(()=>page.getByRole("button",{name:"Open Shop",exact:true}).isEnabled(),{timeout:60000}).toBe(true);
   await page.locator("#login-password").fill(passwords.ADMIN);await page.getByRole("button",{name:"Open Shop",exact:true}).click();
   await expect.poll(()=>new URL(page.url()).pathname,{timeout:60000}).toBe("/admin/products");
   await page.goto(config.authorization.origins.ADMIN+"/admin/settings");
   await page.locator("#backup-admin-password").fill(passwords.ADMIN);
   let publishStatus=0,finish!:()=>void;const committed=new Promise<void>(r=>{finish=r;});
   await page.route("**/api/admin/backups/manual",async route=>{
    const body=route.request().postDataJSON(),headers=await route.request().allHeaders();key=body.key;
    try{publishStatus=(await wire(config,endpoint+"manual","ADMIN",(headers.cookie??"").split(";").map(x=>x.trim()),body)).status;await route.abort("failed");}finally{finish();}
   });
   await page.getByRole("button",{name:"Backup Now",exact:true}).click();await committed;expect(publishStatus).toBe(202);
   const stored=await page.evaluate(()=>localStorage.getItem("pos.test.backup.original.v1"));expect(stored).toBeTruthy();expect(Object.keys(JSON.parse(stored!)).sort()).toEqual(["key","kind"]);expect(stored).not.toContain(passwords.ADMIN);
   await page.reload();await page.getByText(key,{exact:false}).waitFor();
   const check=page.getByRole("button",{name:"Check Original Backup",exact:true});
   await expect.poll(async()=>{await check.click();return (await wire(config,endpoint+"jobs/"+key,"ADMIN",admin)).body;},{timeout:120000}).toContain("SNAPSHOT_VERIFIED");
   await check.click();await page.getByRole("button",{name:"Acknowledge Backup Outcome",exact:true}).click();
   await page.locator("#backup-admin-password").fill(passwords.ADMIN);await page.getByRole("button",{name:"Export Encrypted Backup",exact:true}).click();
   await expect.poll(async()=>{await check.click();const s=JSON.parse((await wire(config,endpoint+"status","ADMIN",admin)).body);return s.jobs.find((j:{kind:string})=>j.kind==="EXPORT")?.state;},{timeout:120000}).toBe("EXPORTED");
   await check.click();await page.getByRole("button",{name:"Acknowledge Backup Outcome",exact:true}).click();
   expect(readdirSync(exportDirectory).some(n=>n.endsWith(".age"))).toBe(true);
   await page.getByRole("checkbox",{name:/Create a separate TEST restore/}).check();
   await page.locator("#backup-admin-password").fill(passwords.ADMIN);
   await page.getByRole("button",{name:"Restore Backup",exact:true}).click();
   await page.getByText("ISOLATED_RESTORE_VERIFIED_LOGIN_PENDING",{exact:true}).waitFor({timeout:120000});
   const restoreMarker=await page.evaluate(()=>JSON.parse(localStorage.getItem("pos.test.backup.original.v1")!));
   const target=path.join(root,"restores",restoreMarker.key),restored=await reopenTestRestore(custody,target);
   await context.close();await runtime.close();runtime=undefined;
   const originalRestart=await reopenTestBackupConfiguration(custody,f.config.database,root);
   runtime=await startLocalRuntime({...config,testBackups:originalRestart});
   const freshAdmin=await login(config);expect(JSON.parse((await wire(config,endpoint+"jobs/"+key,"ADMIN",freshAdmin)).body).state).toBe("SNAPSHOT_VERIFIED");
   await runtime.close();runtime=undefined;
   const recoveredConfig={...config,testBackups:undefined,authorization:{...config.authorization,database:restored.database,restoreProof:restored.proof,signingSecrets:{ADMIN:randomBytes(48).toString("base64url"),SALESPERSON:randomBytes(48).toString("base64url")}}};
   runtime=await startLocalRuntime(recoveredConfig);expect((await login(recoveredConfig)).length).toBeGreaterThan(0);await login(recoveredConfig,"SALESPERSON");await runtime.close();runtime=undefined;
   const g=await openAuthorizationGateway(recoveredConfig.authorization,41);try{
    const actor=await credentials(g,recoveredConfig.authorization,"ADMIN"),after=await createReportsService(g,41).overview(actor,period);
    const economic=(v:unknown):unknown=>Array.isArray(v)?v.map(economic):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).filter(([k])=>k!=="snapshot"&&k!=="capturedAtMs").map(([k,x])=>[k,economic(x)])):v;
    expect(economic(after)).toEqual(economic(before));expect(BigInt(after.inventory.capturedAtMs)).toBeGreaterThanOrEqual(BigInt(before.inventory.capturedAtMs));
   }finally{await g.close();}
   writeFileSync(path.resolve("test-results/backup-security-preflight-20261114/workflow-proof.json"),JSON.stringify({status:"PASS_SAME_MACHINE_TEST",actualChromium:true,actualHttps:true,originalKeyLostResponse:true,export:"TEST_DIRECTORY_ONLY",isolatedRestoreFreshLogin:true,exactFinancialReconciliation:true,restart:true,physicalIndependentRecovery:"NOT_VERIFIED",productionActivation:false},null,2));
  }finally{await browser.close();}
 }finally{await runtime?.close();if(!sourceClosed)await f.g.close();}
},480000);
