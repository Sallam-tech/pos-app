import {spawn} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {afterAll,beforeAll,expect,it} from "vitest";
import {runHelperScript,helperSessionStats,closeHelperSession,HelperCallFailed,type HelperScript} from "../../src/server/bootstrap/powershell-session";

// The reused PowerShell session must behave exactly like a fresh "powershell -File" launch of each
// unchanged helper script: same exit code, same stdout bytes, same stderr size. Runs under a simulated
// Restricted policy (a new Windows computer's default) for both paths.
const server=fileURLToPath(new URL("../../src/server/",import.meta.url));
const scriptPath=(s:HelperScript)=>s==="storage"?path.join(server,"backup","storage.ps1"):path.join(server,"bootstrap",s+".ps1");
const powershell=path.join(process.env.SystemRoot!,"System32/WindowsPowerShell/v1.0/powershell.exe");
function oneShot(script:HelperScript,input:Buffer){return new Promise<{code:number|null;stdout:Buffer;stderr:Buffer}>((resolve,reject)=>{
 const child=spawn(powershell,["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","RemoteSigned","-File",scriptPath(script)],{windowsHide:true});
 const out:Buffer[]=[],err:Buffer[]=[];child.stdout.on("data",b=>out.push(b));child.stderr.on("data",b=>err.push(b));
 child.once("error",reject);child.once("close",code=>resolve({code,stdout:Buffer.concat(out),stderr:Buffer.concat(err)}));child.stdin.end(input);
});}
const missing="C:\\shop-pos-definitely-missing-"+process.pid;

beforeAll(()=>{process.env.PSExecutionPolicyPreference="Restricted";});
afterAll(()=>{closeHelperSession();});

it("every helper gives the same exit code, stdout bytes and stderr size through the session as a fresh -File launch",async()=>{
 const cases:[HelperScript,string][]=[
  ["windows-protection",JSON.stringify({operation:"context"})],
  ["windows-protection","{}"],
  ["windows-protection","not json"],
  ["windows-protection",JSON.stringify({operation:"context",note:"Zoë ٹیسٹ"})],
  ["windows-enrollment-records",JSON.stringify({operation:"record-list",directory:missing})],
  ["windows-candidate-records",JSON.stringify({operation:"candidate-list",directory:missing})],
  ["windows-maintenance-records",JSON.stringify({operation:"maintenance-list",directory:missing})],
  ["storage",JSON.stringify({directory:missing,operation:"check"})],
 ];
 let successes=0;
 for(const [script,input] of cases){
  const viaSession=await runHelperScript(script,Buffer.from(input,"utf8"),60000),direct=await oneShot(script,Buffer.from(input,"utf8"));
  const label=script+" "+input;
  expect(viaSession.code,label).toBe(direct.code);
  expect(viaSession.stdout.toString("base64"),label).toBe(direct.stdout.toString("base64"));
  expect(viaSession.stderrBytes,label).toBe(direct.stderr.length);
  if(viaSession.code===0)successes++;
 }
 expect(successes).toBeGreaterThanOrEqual(1);
 expect(helperSessionStats().started).toBe(1);
},180000);

it("reuses one process for many calls, including concurrent ones, and is far faster than fresh launches",async()=>{
 const input=Buffer.from(JSON.stringify({operation:"context"}));
 const freshStart=Date.now();const fresh=await oneShot("windows-protection",input);const freshMs=Date.now()-freshStart;
 const started=helperSessionStats().started,t=Date.now();
 const results=await Promise.all(Array.from({length:8},()=>runHelperScript("windows-protection",input,60000)));
 const perCallMs=(Date.now()-t)/8;
 for(const r of results){expect(r.code).toBe(0);expect(r.stdout.equals(fresh.stdout)).toBe(true);}
 expect(helperSessionStats().started).toBeLessThanOrEqual(started+1);
 console.log(`fresh launch ${freshMs} ms; session ${perCallMs.toFixed(0)} ms per call`);
 expect(perCallMs).toBeLessThan(freshMs/2);
},120000);

it("an unknown script is refused without running anything, and the next call recovers on a new session",async()=>{
 const before=helperSessionStats().started;
 await expect(runHelperScript("not-a-helper" as HelperScript,Buffer.from("{}"),30000)).rejects.toBeInstanceOf(HelperCallFailed);
 const ok=await runHelperScript("windows-protection",Buffer.from(JSON.stringify({operation:"context"})),60000);
 expect(ok.code).toBe(0);expect(helperSessionStats().started).toBe(before+1);
},120000);

it("a standalone script awaiting a helper call finishes normally and then exits without waiting for the idle timer",async()=>{
 // Regression: an unreferenced helper let Node exit mid-request (top-level await, exit code 13).
 const dir=mkdtempSync(path.join(tmpdir(),"helper-session-child-")),probe=path.join(dir,"probe.mjs");
 const session=pathToFileURL(path.join(server,"bootstrap","powershell-session.ts")).href,empty=pathToFileURL(path.join(server,"../../node_modules/next/dist/compiled/server-only/empty.js")).href;
 writeFileSync(probe,`import {registerHooks} from "node:module";
registerHooks({resolve(s,c,n){if(s==="server-only")return n(${JSON.stringify(empty)},c);return n(s,c);}});
const {runHelperScript}=await import(${JSON.stringify(session)});
const r=await runHelperScript("windows-protection",Buffer.from(JSON.stringify({operation:"context"})),60000);
process.stdout.write("code="+r.code+" bytes="+r.stdout.length);`);
 try{
  const started=Date.now();
  const result=await new Promise<{code:number|null;out:string}>((resolve,reject)=>{const child=spawn(process.execPath,["--experimental-transform-types",probe],{windowsHide:true,env:{...process.env,NODE_ENV:"test"}});let out="";child.stdout.on("data",b=>out+=b);child.once("error",reject);child.once("close",code=>resolve({code,out}));});
  expect(result.code).toBe(0);expect(result.out).toMatch(/^code=0 bytes=[1-9]\d*$/);
  expect(Date.now()-started).toBeLessThan(15000);
 }finally{rmSync(dir,{recursive:true,force:true});}
},60000);

it("closes itself after a few idle seconds, so no helper process lingers",async()=>{
 await runHelperScript("windows-protection",Buffer.from(JSON.stringify({operation:"context"})),60000);
 expect(helperSessionStats().active).toBe(true);
 await new Promise(r=>setTimeout(r,5500));
 expect(helperSessionStats().active).toBe(false);
},60000);
