"use client";
import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
type Job={id:string;kind:string;state:string;createdAtMs:string;sourceId?:string};
type Status={configured:boolean;cloud:string;jobs?:Job[]};
type Marker={key:string;kind:"manual"|"export"|"restore";archiveId?:string};
const markerKey="pos.test.backup.original.v1";
function readMarker():Marker|null{
 const raw=localStorage.getItem(markerKey);if(!raw)return null;if(raw.length>256)throw Error();
 const m=JSON.parse(raw);if(!m||!["manual","export","restore"].includes(m.kind)||!/^[a-f0-9-]{36}$/.test(m.key)||Object.keys(m).some(k=>!["key","kind","archiveId"].includes(k))||(m.kind!=="manual"&&!/^[a-f0-9-]{36}$/.test(m.archiveId)))throw Error();return m;
}
async function request(p:string,body?:unknown){const r=await fetch("/api/admin/backups/"+p,{method:body===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",...(body===undefined?{}:{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})});if(!r.ok)throw Error("Backup outcome unconfirmed. Check the original key.");return r.json();}
export function TestBackupCard(){
 const [status,setStatus]=useState<Status|null>(null),[marker,setMarker]=useState<Marker|null>(null),[password,setPassword]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[terminal,setTerminal]=useState(false),[confirmRestore,setConfirmRestore]=useState(false);
 async function refresh(){setStatus(await request("status"));}
 useEffect(()=>{let live=true;
 void Promise.resolve().then(()=>{if(live){try{setMarker(readMarker());setReady(true);}catch{setMessage("Original backup key storage unavailable. Commands blocked.");}}return request("status");}).then(v=>{if(live)setStatus(v);}).catch(()=>{if(live)setMessage("Backup status unavailable.");});return()=>{live=false;};},[]);
 async function execute(kind:Marker["kind"],archiveId?:string){
  if(!ready||busy||marker||!password||kind==="restore"&&!confirmRestore)return;const pw=password;setPassword("");setBusy(true);setTerminal(false);
  try{if(!navigator.locks)throw Error();await navigator.locks.request(markerKey,async()=>{
   if(readMarker())throw Error();const m:Marker={key:crypto.randomUUID(),kind,...(archiveId?{archiveId}:{})};localStorage.setItem(markerKey,JSON.stringify(m));setMarker(m);
   const value=await request(kind,{key:m.key,password:pw,...(archiveId?{archiveId}:{})});setMessage(value.state);if(kind==="restore")setTerminal(true);await refresh();
  });}catch{setMessage("Backup outcome unconfirmed. Check the original key.");}finally{setBusy(false);}
 }
 async function resolve(){if(!marker||busy)return;setBusy(true);try{
  if(marker.kind==="restore"){if(!password||!confirmRestore)throw Error();const pw=password;setPassword("");const v=await request("restore",{key:marker.key,archiveId:marker.archiveId,password:pw});setMessage(v.state);setTerminal(true);return;}
  const v=await request("jobs/"+marker.key);setMessage(v.state);setTerminal(["FAILED","SNAPSHOT_VERIFIED","EXPORTED"].includes(v.state));await refresh();
 }catch{setMessage("Original backup result unavailable.");}finally{setBusy(false);}}
 async function acknowledge(){if(!terminal||!marker||busy)return;try{await navigator.locks.request(markerKey,async()=>{if(JSON.stringify(readMarker())!==JSON.stringify(marker))throw Error();localStorage.removeItem(markerKey);setMarker(null);setTerminal(false);});}catch{setMessage("Original backup key changed.");}}
 const last=status?.jobs?.find(j=>j.state==="SNAPSHOT_VERIFIED");
 return <Card className="p-4 sm:p-5"><h2 className="font-semibold">Backup &amp; Restore</h2>
 <dl className="mt-3 grid gap-2 text-sm">{[["Automatic Backup",status?.configured?"Every 30 minutes while running ? TEST":"Not configured"],["Last Local Backup",last?new Date(Number(last.createdAtMs)).toLocaleString("en-PK",{timeZone:"Asia/Karachi"}):"No verified snapshot"],["Latest Backup Job",status?.jobs?.[0]?status.jobs[0].kind+" ? "+status.jobs[0].state:"No job recorded"],["Last Cloud Backup","Not configured"],["Independent Recovery","Not verified"]].map(([label,value])=><div key={label} className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>)}</dl>
 {status?.configured&&<div className="mt-3"><Field id="backup-admin-password" label="Admin password for backup or export"><Input id="backup-admin-password" type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} /></Field></div>}
 <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={confirmRestore} onChange={e=>setConfirmRestore(e.target.checked)} />Create a separate TEST restore; preserve the original database</label>
 <div className="mt-3 flex flex-wrap gap-3"><Button disabled={!ready||!status?.configured||busy||!!marker||!password} onClick={()=>void execute("manual")}>Backup Now</Button>
 <Button variant="outline" disabled={!ready||!last||busy||!!marker||!password} onClick={()=>last&&void execute("export",last.id)}>Export Encrypted Backup</Button>
 <Button variant="outline" disabled={!ready||!last||busy||!!marker||!password||!confirmRestore} onClick={()=>last&&void execute("restore",last.id)}>Restore Backup</Button></div>
 <p className="mt-3 text-xs text-muted-foreground">Restore creates a separate TEST copy. Login drill and independent replacement-PC recovery require separate verification. Production is disabled.</p>
 {marker&&<div className="mt-3 grid gap-2 text-sm"><p className="break-all">Original {marker.kind} key: {marker.key}</p><Button variant="outline" disabled={busy} onClick={()=>void resolve()}>Check Original Backup</Button>{terminal&&<Button disabled={busy} onClick={()=>void acknowledge()}>Acknowledge Backup Outcome</Button>}</div>}
 {message&&<p role="status" className="mt-2 text-sm">{message}</p>}
 <Button className="mt-3" variant="outline" disabled={busy} onClick={()=>void refresh().catch(()=>setMessage("Backup status unavailable."))}>Refresh Backup Status</Button>
 </Card>;
}
