import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash,X509Certificate} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
const {chromium}=createRequire('D:/pos/web/package.json')('playwright');
const [bundle,dataRoot,evidence]=process.argv.slice(2);mkdirSync(evidence,{recursive:true});
const result={bundle,dataRoot,productionActivation:false,status:'IN_PROGRESS',stages:[]};
const save=()=>writeFileSync(path.join(evidence,'read-drain-result.json'),JSON.stringify(result,null,2));save();
const child=spawn(path.join(bundle,'resources/runtime/node.exe'),[path.join(bundle,'resources/payload/server/desktop/test-entry.js')],{cwd:dataRoot,env:{...process.env,NODE_ENV:'test',NEXT_TELEMETRY_DISABLED:'1'},windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
result.ownedBackendPid=child.pid;save();let browser;
try{
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Retained TEST startup timeout')),180000);child.on('message',m=>{if(m.type==='lifecycle'){result.stages.push(m.value);save();}if(m.type==='ready'){clearTimeout(timer);resolve(m.value);}if(m.type==='fatal'){clearTimeout(timer);reject(Error('Retained TEST startup rejected at '+m.stage));}if(m.type==='confirm-enrollment'||m.type==='read-passwords')reject(Error('Retained TEST must never re-enroll'));});child.once('error',reject);child.send({type:'start',dataRoot,applicationDirectory:path.join(bundle,'resources/payload/app')});});
 result.ready=true;save();
 const spki=createHash('sha256').update(new X509Certificate(ready.certificate).publicKey.export({type:'spki',format:'der'})).digest('base64');
 browser=await chromium.launch({headless:true,args:['--ignore-certificate-errors-spki-list='+spki]});
 const pending=[];
 for(const role of ['SALESPERSON','ADMIN']){const context=await browser.newContext({ignoreHTTPSErrors:false,serviceWorkers:'block'});const page=await context.newPage();await page.goto(ready.origins[role]+'/login');await page.locator('#login-password').waitFor();pending.push(page.evaluate(()=>Promise.all(Array.from({length:8},()=>fetch('/api/health')))).catch(()=>{}));}
 await delay(10);await browser.close();browser=undefined;await Promise.allSettled(pending);result.abortedBothRoleReadTraffic=true;save();
 const exited=once(child,'exit');child.send({type:'stop'});
 const [code]=await Promise.race([exited,delay(20000).then(()=>{throw Error('Original backend did not drain in20s; retained owned PID '+child.pid);})]);assert.equal(code,0);result.status='PASS';save();
}catch(error){result.status='FAIL';result.error=String(error);save();await browser?.close();process.exitCode=1;child.unref();child.channel?.unref();}
console.log(JSON.stringify(result));