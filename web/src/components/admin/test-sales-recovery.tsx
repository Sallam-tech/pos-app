"use client";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Field} from "@/components/ui/field";
export function TestSalesRecovery(){
 const[key,setKey]=useState(""),[context,setContext]=useState(""),[state,setState]=useState(""),[review,setReview]=useState(false),[busy,setBusy]=useState(false);
 const resolve=async(confirm:boolean)=>{setBusy(true);try{
  if(!/^[0-9a-f-]{36}$/.test(key)||!/^[0-9a-f]{64}$/.test(context))throw Error();
  const response=await fetch("/api/admin/sale-operations/"+key+"/recovery",{method:confirm?"POST":"GET",credentials:"same-origin",cache:"no-store",redirect:"error",headers:{"X-Sales-Context":context,...(confirm?{"Content-Type":"application/json"}:{})},...(confirm?{body:"{}"}:{})});
  const value=await response.json();if(response.status!==404&&!response.ok)throw Error();if(!["UNKNOWN","CANCELLED","COMMITTED"].includes(value.state))throw Error();
  setState(value.state);setReview(false);
 }catch{setState("Unavailable - do not assume failure or retry with another key.");setReview(false);}finally{setBusy(false);}};
 return <details className="mt-5 rounded-lg border p-4"><summary className="font-semibold">Fix a stuck sale (Admin only)</summary><div className="mt-3 grid gap-3">
  <p className="text-sm">Copy the two codes shown on the blocked Salesperson screen. They are not passwords. If the sale was already saved, it stays saved.</p>
  <Field id="sale-recovery-key" label="Sale code (shown on the blocked screen)"><Input id="sale-recovery-key" value={key} autoComplete="off" onChange={e=>{setKey(e.target.value);setReview(false);setState("");}}/></Field>
  <Field id="sale-recovery-context" label="Check code (shown on the blocked screen)"><Input id="sale-recovery-context" value={context} autoComplete="off" onChange={e=>{setContext(e.target.value);setReview(false);setState("");}}/></Field>
  <p role="status">{state}</p><Button variant="outline" disabled={busy} onClick={()=>{void resolve(false);}}>Check if the sale was saved</Button>
  {state==="UNKNOWN"&&!review&&<Button variant="outline" disabled={busy} onClick={()=>setReview(true)}>Cancel this sale</Button>}
  {review&&<div><p>This sale will never be saved. A bill that is already saved is not undone.</p><Button disabled={busy} onClick={()=>{void resolve(true);}}>Yes, cancel this sale</Button><Button variant="outline" onClick={()=>setReview(false)}>Do not cancel</Button></div>}
 </div></details>;
}
