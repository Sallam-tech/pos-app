import {beforeAll,test,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {mkdtempSync,readdirSync,copyFileSync,readFileSync,writeFileSync} from "node:fs";
import path from "node:path";
import {ready,seed,passwords} from "../helpers/admin-products-settings-ready";
import {credentials,settings} from "../helpers/admin-products-settings-fixture";
import {createSettingsService} from "../../src/server/settings/service";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {createTestCustody} from "../../src/server/backup/crypto";
import {createTestArchive,authorizeTestRestore,restoreTestArchive,reopenTestRestore,type VerifiedTestRestore,type TestRestoreAuthority,testSourceNamespace} from "../../src/server/backup/service";
import {openProofDatabase,verifySchema41} from "../helpers/backup-security-proof";
import {assertStoredSettingsLedgers} from "../../src/server/settings/model";
import {canonical,digest} from "../../src/server/inventory/validation";
beforeAll(seed);
test("TEST-only restore rejects unauthorized/forged/replayed/wrong-destination authority; new writes use NEW context and restart requires the protected receipt",async()=>{
 const f=await ready(),root=path.dirname(f.config.database.directory),directory=(prefix:string)=>mkdtempSync(path.join(root,prefix));
 let sourceClosed=false;
 try{
  const api=createSettingsService(f.g,"TEST SHOP"),current=await api.current(f.admin,"ADMIN");if(!("context"in current)||!current.context)throw Error("TEST context absent.");
  const sourceContext=current.context;
  await api.save(f.admin,passwords.ADMIN,randomUUID(),sourceContext,{expectedRevision:"0",settings:settings(),reason:"TEST original immutable history"});
  const custody=await createTestCustody(directory("guard-vault-")),archive=await createTestArchive(custody,f.config.database,directory("guard-archives-"));
  const unauthorized=directory("guard-unauthorized-");
  await expect(restoreTestArchive(custody,{} as TestRestoreAuthority,archive.archive,unauthorized)).rejects.toThrow();expect(readdirSync(unauthorized)).toEqual([]);
  await expect(authorizeTestRestore(f.g,f.staff,passwords.ADMIN,archive.archive,unauthorized)).rejects.toThrow();expect(readdirSync(unauthorized)).toEqual([]);
  const wrong=directory("guard-wrong-"),target=directory("guard-target-"),permit=await authorizeTestRestore(f.g,f.admin,passwords.ADMIN,archive.archive,target);
  await expect(restoreTestArchive(custody,permit,archive.archive,wrong)).rejects.toThrow();expect(readdirSync(wrong)).toEqual([]);
  await expect(restoreTestArchive(custody,permit,archive.archive,target)).rejects.toThrow();
  const grant=await authorizeTestRestore(f.g,f.admin,passwords.ADMIN,archive.archive,target),saved=await restoreTestArchive(custody,grant,archive.archive,target);
  const before=readFileSync(path.join(target,"restored.sqlite3"));
  await expect(restoreTestArchive(custody,grant,archive.archive,target)).rejects.toThrow();expect(readFileSync(path.join(target,"restored.sqlite3"))).toEqual(before);
  expect(()=>JSON.stringify(saved.proof)).toThrow();
  await f.g.close();sourceClosed=true;
  const config={...f.config,database:saved.database,restoreProof:saved.proof};
  await expect(openAuthorizationGateway({...config,restoreProof:{} as VerifiedTestRestore},41)).rejects.toThrow();
  await expect(openAuthorizationGateway({...config,database:f.config.database},41)).rejects.toThrow();
  await expect(openAuthorizationGateway({...config,database:{...saved.database,mode:"persistent"}},41)).rejects.toThrow();
  let gateway=await openAuthorizationGateway(config,41);
  try{
   const admin=await credentials(gateway,config,"ADMIN"),service=createSettingsService(gateway,"TEST SHOP"),recovered=await service.current(admin,"ADMIN");
   if(!("context"in recovered)||!recovered.context)throw Error("TEST recovered context absent.");
   expect(recovered.context).not.toBe(sourceContext);
   await expect(service.save(admin,passwords.ADMIN,randomUUID(),sourceContext,{expectedRevision:"1",settings:settings("TEST forbidden replay"),reason:"TEST old context must deny"})).rejects.toThrow();
   const second=await service.save(admin,passwords.ADMIN,randomUUID(),recovered.context,{expectedRevision:"1",settings:settings("TEST new destination context"),reason:"TEST new context valid"});expect(second.state).toBe("COMMITTED");
   expect((await service.history(admin)).items).toHaveLength(2);
  }finally{await gateway.close();}
  const resumed=await reopenTestRestore(custody,target);
  gateway=await openAuthorizationGateway({...config,restoreProof:resumed.proof},41);
  try{const admin=await credentials(gateway,config,"ADMIN");expect((await createSettingsService(gateway,"TEST SHOP").history(admin)).items).toHaveLength(2);}finally{await gateway.close();}
  // A raw copy has no destination-bound receipt/capability and remains denied.
  const rawTarget=directory("guard-raw-");copyFileSync(path.join(target,"restored.sqlite3"),path.join(rawTarget,"test.sqlite3"));
  const rawConfig={...f.config,database:{...f.config.database,directory:rawTarget}};
  const raw=await openAuthorizationGateway(rawConfig,41);
  try{await expect(raw.verifyAdminPassword(passwords.ADMIN)).rejects.toThrow();}finally{await raw.close();}
  // A NEW row cannot borrow an old, otherwise valid restored context.
  const changed=openProofDatabase(path.join(target,"restored.sqlite3"),false);
  try{const triggers=changed.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND tbl_name='shop_settings_operations'").all();for(const t of triggers)changed.exec('DROP TRIGGER "'+t.name+'"');changed.prepare("UPDATE shop_settings_operations SET context=? WHERE expected_revision=1").run(sourceContext);for(const t of triggers)changed.exec(String(t.sql));await verifySchema41(changed);}finally{changed.close();}
  await expect(reopenTestRestore(custody,target)).rejects.toThrow();
  const receipt=path.join(target,"restore.dpapi"),cipher=Buffer.from(readFileSync(receipt));cipher[cipher.length-1]^=1;writeFileSync(receipt,cipher);
  await expect(reopenTestRestore(custody,target)).rejects.toThrow();
 }finally{if(!sourceClosed)await f.g.close();}
},300000);
test("a structurally valid rewritten historical Settings audit still fails its signed prefix; no credentials bypass it",async()=>{
 const f=await ready(),root=path.dirname(f.config.database.directory),directory=(p:string)=>mkdtempSync(path.join(root,p));let closed=false;
 try{
  const api=createSettingsService(f.g,"TEST SHOP"),c=await api.current(f.admin,"ADMIN");if(!("context"in c)||!c.context)throw Error("TEST context.");
  await api.save(f.admin,passwords.ADMIN,randomUUID(),c.context,{expectedRevision:"0",settings:settings(),reason:"TEST original audit reason"});
  const custody=await createTestCustody(directory("tamper-vault-")),archive=await createTestArchive(custody,f.config.database,directory("tamper-archives-")),target=directory("tamper-target-");
  const restored=await restoreTestArchive(custody,await authorizeTestRestore(f.g,f.admin,passwords.ADMIN,archive.archive,target),archive.archive,target);
  const raw=openProofDatabase(path.join(target,"restored.sqlite3"),false);
  try{
   const triggers=raw.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND tbl_name IN('shop_settings_revisions','shop_settings_operations')").all();
   for(const t of triggers)raw.exec('DROP TRIGGER "'+t.name+'"');
   const op=raw.prepare("SELECT * FROM shop_settings_operations LIMIT 1").get()!,payload=JSON.parse(String(op.payload_json)),result=JSON.parse(String(op.result_json)),reason="TEST forged but internally matching audit";
   payload.reason=reason;result.reason=reason;
   raw.prepare("UPDATE shop_settings_revisions SET reason=?").run(reason);
   raw.prepare("UPDATE shop_settings_operations SET payload_json=?,payload_hash=?,result_json=?,result_hash=?").run(canonical(payload),digest(payload),canonical(result),digest(result));
   for(const t of triggers)raw.exec(String(t.sql));
   raw.exec("BEGIN");await verifySchema41(raw);
   const tx={get:async(sql:string,values:readonly unknown[]=[])=>raw.prepare(sql).get(...values),all:async(sql:string,values:readonly unknown[]=[])=>raw.prepare(sql).all(...values),run:async()=>{throw Error("TEST read only");}};
   await assertStoredSettingsLedgers(tx,c.context);raw.exec("ROLLBACK");
  }finally{raw.close();}
  await expect(reopenTestRestore(custody,target)).rejects.toThrow();
  await f.g.close();closed=true;
  const config={...f.config,database:restored.database,restoreProof:restored.proof},gateway=await openAuthorizationGateway(config,41);
  try{await expect(gateway.verifyAdminPassword(passwords.ADMIN)).rejects.toThrow();}finally{await gateway.close();}
  expect(testSourceNamespace(path.join(target,"restored.sqlite3"))).not.toBe(testSourceNamespace(path.join(f.config.database.directory,f.config.database.filename)));
 }finally{if(!closed)await f.g.close();}
},300000);
