import path from "node:path";
import {it,expect} from "vitest";
import {storage} from "../../src/server/backup/storage";
import {openProofDatabase,fingerprint} from "../../src/server/backup/snapshot";
import {readImportedRootProvenance} from "../../src/server/bootstrap/imported-root41";
import {classifyCandidateLedger} from "../../src/server/bootstrap/candidate-records";
import {createImportedRootWriterAdmission,createSelectedWriterAdmission,assertProtectedWriterAdmission} from "../../src/server/bootstrap/writer-admission";
import {createProtectedRestoredHistory} from "../../src/server/backup/protected-history";
import {withProtectedLocalKeys,type LocalKeyConfiguration} from "../../src/server/bootstrap/keys";
import {enrollmentDigest} from "../../src/server/bootstrap/database";
import {acquireRuntimeOwnership} from "../../src/server/hosting/ownership";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {readFinancialSource} from "../../src/server/reports/financial";
import {list as inventoryList} from "../../src/server/inventory/reads";
import {createReportsService} from "../../src/server/reports/service";
import {createSalesService} from "../../src/server/sales/service";
import {createSettingsService} from "../../src/server/settings/service";
import {testSourceNamespace,verifyProtectedSnapshotContents} from "../../src/server/backup/service";
import type {AuthorizedTransaction,AuthorizationConfiguration} from "../../src/server/auth/types";
it("completed generation2 independently reopens without SQL replay and exactly reconciles every financial credential and historical row",async()=>{
 const capsule=process.env.SHOP_POS_IMPORTED_TEST_CAPSULE;if(!capsule)throw Error("Encrypted disposable TEST continuation required");const encoded=await storage(capsule,"unseal");if(typeof encoded!=="string")throw Error();const bytes=Buffer.from(encoded,"base64");let f:{format:string;imported:LocalKeyConfiguration;passwords:{ADMIN:string;SALESPERSON:string};source:LocalKeyConfiguration;sourceState:string;saleId:string;receipt:unknown};try{f=JSON.parse(bytes.toString("utf8"));if(f.format!=="POS_DISPOSABLE_IMPORTED_TEST_CONTINUATION_V1")throw Error();}finally{bytes.fill(0);}
 const root=await readImportedRootProvenance(f.imported),current=classifyCandidateLedger(root.ledger).recordedCurrent;if(!current||current.generation!=="2")throw Error("Known recorded generation2 required; never repeat restore");
 const directory=path.join(path.dirname(f.imported.directory),current.operationId+"-staging",current.operationId),target:LocalKeyConfiguration={directory,database:{directory,filename:"restored41.sqlite3",mode:"test",create:false},migrationsDirectory:f.imported.migrationsDirectory};
 const beforeLedger=enrollmentDigest(root.ledger),source=openProofDatabase(path.join(f.imported.database.directory,f.imported.database.filename)),copy=openProofDatabase(path.join(directory,"restored41.sqlite3"));let sourceFingerprint:ReturnType<typeof fingerprint>,expectedFinancial:Awaited<ReturnType<typeof readFinancialSource>>,expectedInventory:Awaited<ReturnType<typeof inventoryList>>,sourceContext:string;
 const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),period={from:"2000-01-01",to:date,asOf:String(Date.now())};
 try{source.exec("BEGIN");copy.exec("BEGIN");const checked=await verifyProtectedSnapshotContents(source,testSourceNamespace(path.join(f.imported.database.directory,f.imported.database.filename)),root.history);sourceContext=checked.origin.context;
  sourceFingerprint=fingerprint(source);const targetFingerprint=fingerprint(copy),stable=(p:ReturnType<typeof fingerprint>)=>({...p,tables:p.tables.filter(t=>!['auth_login_attempts','auth_session_authorizations'].includes(t.name))});expect(stable(targetFingerprint)).toEqual(stable(sourceFingerprint));
  for(const name of ["returns","return_dispositions","expenses","invoice_revisions","daily_closings","closing_backup_jobs","financial_events","stock_movements"])expect(BigInt(targetFingerprint.tables.find(t=>t.name===name)!.count)).toBeGreaterThan(BigInt(0));
  const reader:AuthorizedTransaction={get:async(sql,values)=>source.prepare(sql).get(...(values??[])),all:async(sql,values)=>source.prepare(sql).all(...(values??[])),run:async()=>{throw Error("Readonly reconciliation never writes");}};
  expectedFinancial=await readFinancialSource(reader,41,period.from,period.to,period.asOf);expectedInventory=await inventoryList(reader,{limit:1});copy.exec("ROLLBACK");source.exec("ROLLBACK");
 }finally{copy.close();source.close();}
 const runtime=await acquireRuntimeOwnership(path.join(directory,"restored41.sqlite3"));let gateway:Awaited<ReturnType<typeof openAuthorizationGateway>>|undefined;
 try{await expect(createImportedRootWriterAdmission(f.imported,runtime)).rejects.toThrow();const admission=await createSelectedWriterAdmission(f.imported,target,runtime),history=createProtectedRestoredHistory(admission,target.database);expect(assertProtectedWriterAdmission(admission,target.database)).toMatchObject({generation:"2",maintenanceOnly:false,productionActivation:false});let secrets!:AuthorizationConfiguration['signingSecrets'];await withProtectedLocalKeys(target,async keys=>{secrets={...keys.signingSecrets};});const origins={ADMIN:"https://localhost:49991",SALESPERSON:"https://127.0.0.1:49991"};gateway=await openAuthorizationGateway({database:target.database,migrationsDirectory:target.migrationsDirectory,signingSecrets:secrets,origins,sessionLifetimeSeconds:600,protectedAdmission:admission,protectedHistory:history},41);
  const admin=await gateway.issueAdminSession(await gateway.verifyAdminPassword(f.passwords.ADMIN)),staff=await gateway.issueSalespersonSession(await gateway.verifySalespersonPassword(f.passwords.SALESPERSON)),request=(role:"ADMIN"|"SALESPERSON",response:Response)=>new Request(origins[role]+"/private",{headers:{cookie:response.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ")}}),adminRequest=request("ADMIN",admin),staffRequest=request("SALESPERSON",staff);
  const report=await createReportsService(gateway,41).overview(adminRequest,period);expect(report).toMatchObject(expectedFinancial);expect(report.inventory.overall).toEqual(expectedInventory.overall);expect(report.inventory.overall).toMatchObject({quantity:"10",stockValuePaisa:"150000"});expect(report).toMatchObject({revenuePaisa:"0",cogsPaisa:"0",expensesPaisa:"1300",netProfitPaisa:"-1300",refundsPaisa:"15000"});
  expect(await createSalesService(gateway,"TEST SHOP",41).get(staffRequest,f.saleId)).toEqual(f.receipt);const settings=await createSettingsService(gateway,"TEST SHOP").current(adminRequest,"ADMIN");if(!('context' in settings)||typeof settings.context!=="string")throw Error("New Settings context required");expect(settings.context).not.toBe(sourceContext);
 }finally{await gateway?.close();await runtime.close();}
 expect(enrollmentDigest((await readImportedRootProvenance(f.imported)).ledger)).toBe(beforeLedger);const original=openProofDatabase(path.join(f.source.database.directory,f.source.database.filename));try{expect(enrollmentDigest(fingerprint(original))).toBe(f.sourceState);}finally{original.close();}
 console.info("GENERATION2_FINANCIAL_RECONCILIATION_PASS",JSON.stringify({generation:"2",financialRowsAndRowids:"EXACT",immutableCredentialsAndBindings:"EXACT",freshRoles:["ADMIN","SALESPERSON"],stockQuantity:"10",stockValuePaisa:"150000",expensesPaisa:"1300",netProfitPaisa:"-1300",sqlReplay:false,productionActivation:false}));
});
