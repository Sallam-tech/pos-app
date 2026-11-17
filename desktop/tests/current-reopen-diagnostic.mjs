// Confined disposable CURRENT startup diagnostic. Never enroll, authenticate,
// select a writer, restore, reset a credential or send a financial operation.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from "node:url";
import path from 'node:path';
import assert from 'node:assert/strict';
const [bundleArg,dataArg,evidenceArg,hookArg]=process.argv.slice(2),bundle=path.resolve(bundleArg),dataRoot=path.resolve(dataArg),evidence=path.resolve(evidenceArg);
assert.match(path.basename(dataRoot),/^posdt-[a-f0-9-]{36}$/);assert.equal(path.dirname(dataRoot),path.resolve('web/test-results'));assert.equal(JSON.parse(readFileSync(path.join(bundle,'resources/payload/manifest.json'),'utf8')).productionActivation,false);
mkdirSync(evidence,{recursive:true});const result={diagnosticOnly:true,bundle,dataRoot,productionActivation:false,rounds:[]};
for(let round=0;round<3;round++){
 const env={...process.env,NODE_ENV:'test',NEXT_TELEMETRY_DISABLED:'1'};for(const k of ['NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','NODE_V8_COVERAGE'])delete env[k];
 const args=[...(hookArg?['--import',pathToFileURL(path.resolve(hookArg)).href]:[]),path.join(bundle,'resources/payload/server/desktop/test-entry.js')];
 const child=spawn(path.join(bundle,'resources/runtime/node.exe'),args,{cwd:dataRoot,env,windowsHide:true,stdio:['ignore','ignore','pipe','ipc']});let stderr='',stage='START';child.stderr.on('data',b=>stderr=(stderr+b).slice(-32000));const closed=once(child,'exit');
 try{await new Promise((resolve,reject)=>{let done=false;const end=(error)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve();};const timer=setTimeout(()=>end(Error('Startup deadline; retained')),180000);child.once('error',end);child.once('exit',()=>end(Error('Exit before READY')));child.on('message',m=>{if(m?.type==='startup-stage')stage=m.value;else if(m?.type==='ready')end();else if(m?.type==='fatal')end(Error('Fatal at '+m.stage));else if(['confirm-enrollment','read-passwords','recovery-review','confirm-writer-selection','backup-handoff-password','confirm-protected-restore'].includes(m?.type))end(Error('Unrequested ceremony refused'));});child.send({type:'start',dataRoot,applicationDirectory:path.join(bundle,'resources/payload/app')});});
 child.send({type:'stop'});const [exitCode]=await closed;assert.equal(exitCode,0);result.rounds.push({round,status:'PASS',stage,exitCode});
 }catch(error){result.rounds.push({round,status:'FAIL',stage,error:String(error)});if(child.exitCode===null){child.send({type:'stop'});await closed;}writeFileSync(path.join(evidence,'stderr-'+round+'.log'),stderr);writeFileSync(path.join(evidence,'current-reopen-result.json'),JSON.stringify(result,null,2));throw error;}
 writeFileSync(path.join(evidence,'stderr-'+round+'.log'),stderr);writeFileSync(path.join(evidence,'current-reopen-result.json'),JSON.stringify(result,null,2));
}
