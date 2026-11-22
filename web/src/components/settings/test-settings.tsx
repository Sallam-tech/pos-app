"use client";
import {TestBackupCard} from "./test-backup-card";
import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Field} from "@/components/ui/field";
import {PageHeading} from "@/components/shell/page-heading";
import {ShopDetailsForm} from "./settings-preview";
import {PasswordSecurityPreview} from "./password-security-preview";
import {defaultShopSettings,type ShopDisplaySettings} from "@/lib/shop-display-settings";
import {refreshSharedShopSettings} from "./use-shop-settings";
import {readMarker,claimMarker,confirmMarker,acknowledgeMarker,sameMarker,type RecoveryMarker} from "@/lib/settings/recovery-store";
type Saved={id:string;revision:string;settings:ShopDisplaySettings;reason:string;recordedAtMs:string};
type Current={context:string;saved:Saved|null;fallbackShopName:string};
type Outcome={state:string;key:string;context:string;kind:string;result?:unknown};
async function request(url:string,body?:unknown){const r=await fetch(url,{method:body===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",headers:body===undefined?{}:{"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!r.ok)throw Error("Settings operation unconfirmed. Resolve the original key before another change.");return await r.json();}
export function TestSettings(){
 const [current,setCurrent]=useState<Current|null>(null),[history,setHistory]=useState<Saved[]>([]),[cursor,setCursor]=useState<string|null>(null),[marker,setMarker]=useState<RecoveryMarker|null>(null),[outcome,setOutcome]=useState<Outcome|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[password,setPassword]=useState(""),[evidence,setEvidence]=useState("");
 async function load(){const c=await request("/api/admin/settings") as Current,h=await request("/api/admin/settings/history");setCurrent(c);setHistory(h.items);setCursor(h.nextCursor);refreshSharedShopSettings();}
 useEffect(()=>{let live=true;void Promise.all([request("/api/admin/settings"),request("/api/admin/settings/history"),readMarker()]).then(([c,h,m])=>{if(live){setCurrent(c);setHistory(h.items);setCursor(h.nextCursor);setMarker(m);setReady(true);}}).catch(()=>{if(live)setMessage("Shared settings unavailable. Changes blocked.");});return()=>{live=false;};},[]);
 const blocked=!ready||busy||marker!==null||!current;
 async function accept(m:RecoveryMarker,v:Outcome){if(v.key!==m.key||v.context!==m.context||v.kind!==m.kind||!sameMarker(await readMarker(),m))throw Error("Original-key binding changed.");setOutcome(v);if(["COMMITTED","CANCELLED"].includes(v.state)&&m.state==="PENDING"){const confirmed=await confirmMarker(m);setMarker(confirmed);}}
 async function execute(kind:RecoveryMarker["kind"],body:Record<string,unknown>){if(blocked||!current)return;setBusy(true);setOutcome(null);setMessage("");try{const m:RecoveryMarker={v:1,key:crypto.randomUUID(),context:current.context,kind,state:"PENDING"};await claimMarker(m);setMarker(m);const url=kind==="SETTINGS"?"/api/admin/settings":"/api/admin/settings/password/"+kind.slice(9);const v=await request(url,{...body,key:m.key,context:m.context});if(kind==="PASSWORD_ADMIN"){setMessage("Admin password changed. Sign in with the new password, then resolve this original key.");window.location.assign(new URL("/login",window.location.origin).href);return;}await accept(m,v);if(kind==="SETTINGS"&&v.state==="COMMITTED"){const done=await readMarker();if(done&&sameMarker(done,{...m,state:"CONFIRMED"})){await acknowledgeMarker(done);setMarker(null);setOutcome(null);}setMessage("Shop details saved.");}else setMessage("Saved once. Acknowledge the original outcome to continue.");await load();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 async function recover(cancel=false,ack=false){if(!marker||busy)return;const m=marker,pw=password;setPassword("");setBusy(true);setMessage("");try{let v=await request("/api/admin/settings/operations/"+m.key+"?"+new URLSearchParams({context:m.context,kind:m.kind}));if(cancel&&v.state==="UNKNOWN"){v=await request("/api/admin/settings/operations/"+m.key+"/recovery",{context:m.context,kind:m.kind,password:pw,evidence});}
 if(ack){if(!["COMMITTED","CANCELLED"].includes(v.state)||m.state!=="CONFIRMED"||!sameMarker(await readMarker(),m))throw Error("Fresh terminal proof required.");await acknowledgeMarker(m);setMarker(null);setOutcome(null);setMessage("Original outcome acknowledged.");await load();}else await accept(m,v);
 }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 const saved=current?.saved?.settings??{...defaultShopSettings,shopName:current?.fallbackShopName??""};
 return <div className="mx-auto w-full max-w-3xl"><PageHeading route="/admin/settings">Settings</PageHeading><div className="mt-3 grid gap-3">
 {message&&<p role="status" className="break-words text-sm">{message}</p>}
 {marker&&<Card className="grid gap-3 p-4"><h2 className="font-semibold">Unfinished settings change</h2><p className="break-all text-xs">{marker.kind} · {marker.key}</p><p>{outcome?.state??"UNCONFIRMED — no automatic retry"}</p>{marker.kind.startsWith("PASSWORD_")&&<Button variant="outline" disabled={busy} onClick={()=>window.location.assign(new URL("/login",window.location.origin).href)}>Sign in to finish the password change</Button>}<Button disabled={busy} onClick={()=>void recover()}>Check the settings change</Button>
 {marker.state==="CONFIRMED"?<Button disabled={busy} onClick={()=>void recover(false,true)}>OK, I have seen the result</Button>:<><Field id="settings-recovery-evidence" label="Verified no-effect evidence"><Input id="settings-recovery-evidence" value={evidence} onChange={e=>setEvidence(e.target.value)} /></Field><Field id="settings-recovery-password" label="Current Admin password"><Input id="settings-recovery-password" type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} /></Field><Button disabled={busy||!password||!evidence} onClick={()=>void recover(true)}>Fence Verified Absent Operation</Button></>}
 </Card>}
 <Card className="p-4 sm:p-5"><h2 className="text-base font-semibold">Shop and Receipt Details</h2><p className="mt-1 text-xs text-muted-foreground">{current?.saved?"Saved shared revision "+current.saved.revision:"No saved settings revision. Other shop details are unrecorded."} · PKR · Asia/Karachi</p>
 {ready&&<>
 <ShopDetailsForm key={current?.saved?.revision??"0"} saved={saved} onEdit={()=>setMessage("")} onSaved={()=>{}} disabled={blocked} persist={values=>{void execute("SETTINGS",{input:{expectedRevision:current?.saved?.revision??"0",settings:{...values,timezone:"Asia/Karachi"},reason:"Shop details updated"}});}} /></>}
 </Card>
 <PasswordSecurityPreview live={{blocked,onChange:(target,pw,newPassword)=>execute(target==="Admin"?"PASSWORD_ADMIN":"PASSWORD_SALESPERSON",{password:pw,newPassword})}} />
 <Card className="grid gap-3 p-4"><h2 className="font-semibold">Saved Settings History</h2>{history.map(h=><div key={h.id} className="border-t pt-2 text-sm"><p>Revision {h.revision} · {h.settings.shopName}</p><p>{h.reason}</p><dl className="mt-1 text-xs"><div>Address: {h.settings.address||"Blank"}</div><div>Phone: {h.settings.phone||"Blank"}</div><div>Receipt message: {h.settings.footer||"Blank"}</div><div>Paper: {h.settings.receiptLayout}</div></dl><p className="text-xs">{new Date(Number(h.recordedAtMs)).toLocaleString("en-PK",{timeZone:"Asia/Karachi"})}</p></div>)}{cursor&&<Button disabled={busy} onClick={()=>{setBusy(true);void request("/api/admin/settings/history?cursor="+cursor).then(h=>{setHistory(v=>[...v,...h.items]);setCursor(h.nextCursor);}).catch(()=>setMessage("Saved history unavailable.")).finally(()=>setBusy(false));}}>More Saved Settings</Button>}</Card>
 <TestBackupCard />
 </div></div>;
}
