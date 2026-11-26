import "server-only";

import {spawn,type ChildProcessWithoutNullStreams} from "node:child_process";
import {existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

// One reusable powershell.exe for the short DPAPI/record/storage helper scripts (see powershell-session.ps1).
// Each request still runs one unchanged helper script and returns its exit code, stdout and stderr, so
// callers keep their exact success checks. Requests run one at a time. A request whose outcome is unknown
// (timeout, crash) is never retried; only requests that were never sent move to a new session. If a
// session cannot be started at all, callers get HelperSessionUnavailable and use their one-shot launch.

export type HelperScript="windows-protection"|"windows-enrollment-records"|"windows-candidate-records"|"windows-maintenance-records"|"storage";
export type HelperResult={code:number;stdout:Buffer;stderrBytes:number};

/** Nothing was sent to a session; the caller may safely run its original one-shot launch instead. */
export class HelperSessionUnavailable extends Error{constructor(){super("PowerShell helper session unavailable.");this.name="HelperSessionUnavailable";}}
/** The request was sent but its outcome is unknown (timeout or helper crash). Never retry it. */
export class HelperCallFailed extends Error{constructor(){super("PowerShell helper outcome unknown.");this.name="HelperCallFailed";}}

const IDLE_MS=4000,START_MS=60000,MAX_BUFFER=16*1024*1024;
type Job={script:HelperScript;input:Buffer;timeoutMs:number;resolve(value:HelperResult):void;reject(error:Error):void};
type Session={child:ChildProcessWithoutNullStreams;ready:boolean;buffer:string;job:Job|null;id:number;timer?:ReturnType<typeof setTimeout>};

const queue:Job[]=[];
let session:Session|null=null,starting=false,disabled=false,idle:ReturnType<typeof setTimeout>|undefined,started=0;

/** For tests and diagnostics only: how many helper sessions this process has started. */
export function helperSessionStats(){return {started,active:!!session,queued:queue.length,disabled};}

export function runHelperScript(script:HelperScript,input:Buffer,timeoutMs:number):Promise<HelperResult>{
 if(disabled||process.platform!=="win32")return Promise.reject(new HelperSessionUnavailable());
 return new Promise((resolve,reject)=>{queue.push({script,input,timeoutMs,resolve,reject});pump();});
}

/** Ends the session (backend shutdown). Requests not yet sent fall back to their one-shot launch. */
export function closeHelperSession(){
 if(idle)clearTimeout(idle);idle=undefined;
 for(const job of queue.splice(0))job.reject(new HelperSessionUnavailable());
 const current=session;session=null;if(!current)return;
 if(current.job){const job=current.job;current.job=null;if(current.timer)clearTimeout(current.timer);job.reject(new HelperCallFailed());}
 try{current.child.stdin.end(JSON.stringify({exit:true})+"\n");}catch{/* already closed */}
 setTimeout(()=>{try{current.child.kill();}catch{/* gone */}},2000).unref();
}

// While a request is queued or running the helper keeps Node alive (a caller may be awaiting it with
// nothing else pending); an idle helper never does, so it can't delay a normal process exit.
function hold(current:Session,keepAlive:boolean){
 for(const handle of [current.child,current.child.stdin,current.child.stdout,current.child.stderr] as unknown as {ref?():void;unref?():void}[]){if(keepAlive)handle.ref?.();else handle.unref?.();}
}

function pump(){
 if(idle){clearTimeout(idle);idle=undefined;}
 if(session?.job||starting)return;
 if(!queue.length){if(session){hold(session,false);idle=setTimeout(closeHelperSession,IDLE_MS);idle.unref();}return;}
 if(!session||!session.ready){start();return;}
 send(session,queue.shift()!);
}

function start(){
 const host=fileURLToPath(new URL("./powershell-session.ps1",import.meta.url)),root=process.env.SystemRoot;
 const executable=root&&path.isAbsolute(root)?path.join(root,"System32/WindowsPowerShell/v1.0/powershell.exe"):"";
 if(!executable||!existsSync(executable)||!existsSync(host)){unavailable();return;}
 starting=true;started++;
 let child:ChildProcessWithoutNullStreams;
 // Same one-process RemoteSigned policy as every other helper launch (see desktop/main.cjs protectData).
 try{child=spawn(executable,["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","RemoteSigned","-File",host],{windowsHide:true,stdio:["pipe","pipe","pipe"]});}catch{starting=false;unavailable();return;}
 const current:Session={child,ready:false,buffer:"",job:null,id:0};session=current;
 const startTimer=setTimeout(()=>fail(current),START_MS);startTimer.unref();
 hold(current,true);
 child.stdout.setEncoding("utf8");
 child.stdout.on("data",(chunk:string)=>{
  current.buffer+=chunk;if(current.buffer.length>MAX_BUFFER){fail(current);return;}
  for(;;){
   const at=current.buffer.indexOf("\n");if(at<0)break;
   const line=current.buffer.slice(0,at).replace(/\r$/,"");current.buffer=current.buffer.slice(at+1);
   if(!current.ready){
    if(line!=='{"ready":true}'){fail(current);return;}
    clearTimeout(startTimer);current.ready=true;starting=false;pump();continue;
   }
   answer(current,line);
  }
 });
 // The host itself never writes to stderr; helper stderr is captured inside each response.
 child.stderr.on("data",()=>fail(current));
 child.once("error",()=>fail(current));
 child.once("exit",()=>fail(current));
 child.stdin.on("error",()=>fail(current));
}

function unavailable(){disabled=true;starting=false;for(const job of queue.splice(0))job.reject(new HelperSessionUnavailable());}

function fail(current:Session){
 if(session!==current)return;
 const wasReady=current.ready;session=null;
 if(current.timer)clearTimeout(current.timer);
 try{current.child.kill();}catch{/* gone */}
 const job=current.job;current.job=null;
 if(job)job.reject(new HelperCallFailed());
 if(!wasReady){unavailable();return;}
 starting=false;pump();
}

function send(current:Session,job:Job){
 hold(current,true);current.job=job;current.id++;
 current.timer=setTimeout(()=>fail(current),job.timeoutMs);current.timer.unref();
 try{current.child.stdin.write(JSON.stringify({id:current.id,script:job.script,input:job.input.toString("base64")})+"\n");}catch{fail(current);}
}

function answer(current:Session,line:string){
 const job=current.job;if(!job){fail(current);return;}
 let value:{id?:unknown;code?:unknown;stdout?:unknown;stderr?:unknown};
 try{value=JSON.parse(line);}catch{fail(current);return;}
 if(!value||value.id!==current.id||!Number.isSafeInteger(value.code)||typeof value.stdout!=="string"||typeof value.stderr!=="string"){fail(current);return;}
 if(current.timer)clearTimeout(current.timer);current.job=null;
 job.resolve({code:value.code as number,stdout:Buffer.from(value.stdout,"base64"),stderrBytes:Buffer.from(value.stderr,"base64").length});
 pump();
}
