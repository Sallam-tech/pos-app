import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {beforeAll,test,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {mkdtempSync,readFileSync,writeFileSync,readdirSync} from "node:fs";
import path from "node:path";
import {ready,seed,passwords} from "../helpers/admin-products-settings-ready";
import {createTestCustody,openTestCustody,hashFile} from "../../src/server/backup/crypto";
import {configureTestBackups,startTestBackupWorker,reopenTestBackupConfiguration} from "../../src/server/backup/worker";
import {openProofDatabase} from "../../src/server/backup/snapshot";
import {acquireRuntimeOwnership} from "../../src/server/hosting/ownership";
import {inspectTestSchema41Readiness} from "../../src/server/backup/readiness";
beforeAll(seed);
test("dedicated worker serializes automatic/manual/closing/export jobs, outlives Admin logout and replays signed journal after restart",async()=>{
 const f=await ready(),base=path.dirname(f.config.database.directory),dir=(p:string)=>mkdtempSync(path.join(base,p));
 const vault=dir("worker-vault-"),root=dir("worker-jobs-"),destination=dir("worker-export-"),custody=await createTestCustody(vault);
 let ownership:Awaited<ReturnType<typeof acquireRuntimeOwnership>>|undefined,worker:Awaited<ReturnType<typeof startTestBackupWorker>>|undefined,closed=false;
 try{
  await expect(configureTestBackups(f.g,f.staff,passwords.ADMIN,custody,f.config.database,root,destination)).rejects.toThrow();
  const configuration=await configureTestBackups(f.g,f.admin,passwords.ADMIN,custody,f.config.database,root,destination);
  expect(()=>JSON.stringify(configuration)).toThrow();
  await expect(startTestBackupWorker(configuration,{assertHeld(){}},f.config.database)).rejects.toThrow();
  ownership=await acquireRuntimeOwnership(path.join(f.config.database.directory,f.config.database.filename));
  const other={...f.config.database,directory:dir("worker-wrong-source-")},reader=openProofDatabase(path.join(f.config.database.directory,f.config.database.filename));try{await reader.backup(path.join(other.directory,other.filename));}finally{reader.close();}await expect(startTestBackupWorker(configuration,ownership,other)).rejects.toThrow();
  worker=await startTestBackupWorker(configuration,ownership,f.config.database);
  const automatic=worker.status().jobs.find(j=>j.kind==="AUTOMATIC")!;
  expect(automatic.state).toBe("SNAPSHOT_VERIFIED");
  const key=randomUUID();await Promise.all([worker.manual(key),worker.manual(key)]);await worker.idle();
  expect(worker.status().jobs.filter(j=>j.id===key)).toHaveLength(1);expect(worker.job(key).state).toBe("SNAPSHOT_VERIFIED");
  const date="2026-11-01",review=await f.cash.summary(f.admin,date);
  await f.act("CLOSE_DAY",{businessDate:date,countId:null,sourceDigest:review.sourceDigest,allowUnreconciled:"YES",evidence:"TEST missing evidence retained"});
  await worker.scan();expect(worker.status().jobs.filter(j=>j.kind==="CLOSING"&&j.state==="SNAPSHOT_VERIFIED")).toHaveLength(1);
  await worker.scan();expect(worker.status().jobs.filter(j=>j.kind==="CLOSING")).toHaveLength(1);
  await f.g.close();closed=true;
  const exportKey=randomUUID();await worker.export(exportKey,key);await worker.idle();
  expect(worker.job(exportKey).state).toBe("EXPORTED");
  expect(await hashFile(path.join(destination,key+".age"))).toEqual(await hashFile(worker.archive(key)));
  await worker.export(exportKey,key);expect(worker.status().jobs.filter(j=>j.id===exportKey)).toHaveLength(1);
  await worker.stop();await ownership.close();
  const reopened=await reopenTestBackupConfiguration(await openTestCustody(vault),f.config.database,root);
  ownership=await acquireRuntimeOwnership(path.join(f.config.database.directory,f.config.database.filename));worker=await startTestBackupWorker(reopened,ownership,f.config.database);
  expect(worker.job(key).state).toBe("SNAPSHOT_VERIFIED");expect(worker.job(exportKey).state).toBe("EXPORTED");
  expect(worker.status().productionActivation).toBe(false);
  expect((await inspectTestSchema41Readiness(f.config.database)).schemaStatus).toBe("VERIFIED_TEST_ONLY");
  expect((await inspectTestSchema41Readiness({...f.config.database,mode:"persistent"})).schemaStatus).toBe("REJECTED");
  await worker.stop();await ownership.close();worker=undefined;ownership=undefined;
  const record=path.join(root,readdirSync(root).find(n=>/^\d{8}\.json$/.test(n))!);
  const bytes=readFileSync(record),changed=Buffer.from(bytes);changed[changed.length-8]^=1;writeFileSync(record,changed);
  ownership=await acquireRuntimeOwnership(path.join(f.config.database.directory,f.config.database.filename));
  await expect(startTestBackupWorker(reopened,ownership,f.config.database)).rejects.toThrow();writeFileSync(record,bytes);
 }finally{await worker?.stop();await ownership?.close();if(!closed)await f.g.close();}
},300000);

test("actual worker process death replays RUNNING original ID and preserves its incomplete attempt",async()=>{
 const f=await ready(),base=path.dirname(f.config.database.directory),dir=(p:string)=>mkdtempSync(path.join(base,p)),vault=dir("crash-worker-vault-"),root=dir("crash-worker-jobs-"),custody=await createTestCustody(vault);
 const configuration=await configureTestBackups(f.g,f.admin,passwords.ADMIN,custody,f.config.database,root,dir("crash-worker-export-"));
 let lease=await acquireRuntimeOwnership(path.join(f.config.database.directory,f.config.database.filename)),worker=await startTestBackupWorker(configuration,lease,f.config.database);
 await worker.stop();await lease.close();await f.g.logoutAdmin(f.admin);await f.g.close();
 const key=randomUUID(),child=spawn(process.execPath,["--experimental-transform-types",fileURLToPath(new URL("../helpers/backup-security-crash-child.mjs",import.meta.url))],{cwd:process.cwd(),env:{...process.env,NODE_ENV:"test"},windowsHide:true,stdio:["pipe","pipe","pipe"]});
 await new Promise<void>((resolve,reject)=>{
  let output="",partial=false;const timer=setTimeout(()=>{child.kill();reject(Error("TEST worker barrier timeout"));},60000);timer.unref();
  child.stdout.on("data",(b:Buffer)=>{output+=b.toString();if(output.length>1024){child.kill();reject(Error());}if(output.includes("PARTIAL_WRITTEN")){partial=true;child.kill();}});
  child.stderr.on("data",()=>{});child.once("error",reject);child.once("close",()=>{clearTimeout(timer);if(partial)resolve();else reject(Error("TEST worker denied before barrier"));});
  const payload=Buffer.from(JSON.stringify({operation:"WORKER",config:f.config,vault,root,key}));child.stdin.end(payload,()=>payload.fill(0));
 });
 const jobDirectory=path.join(root,"job-"+key),oldAttempt=readdirSync(jobDirectory);expect(oldAttempt).toHaveLength(1);
 const partial=path.join(jobDirectory,oldAttempt[0],"archive.pending"),bytes=readFileSync(partial);expect(bytes.length).toBeGreaterThan(0);
 lease=await acquireRuntimeOwnership(path.join(f.config.database.directory,f.config.database.filename));
 try{
  const reopened=await reopenTestBackupConfiguration(custody,f.config.database,root);worker=await startTestBackupWorker(reopened,lease,f.config.database);
  expect(worker.job(key).state).toBe("SNAPSHOT_VERIFIED");expect(worker.status().jobs.filter(j=>j.id===key)).toHaveLength(1);
  expect(readFileSync(partial)).toEqual(bytes);expect(readdirSync(jobDirectory)).toHaveLength(2);
  await worker.manual(key);await worker.idle();expect(readdirSync(jobDirectory)).toHaveLength(2);
  await worker.stop();
 }finally{await lease.close();}
},300000);
