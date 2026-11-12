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
 return <details className="mt-5 rounded-lg border p-4"><summary className="font-semibold">Admin TEST sale recovery</summary><div className="mt-3 grid gap-3">
  <p className="text-sm">Copy only the operation key and context from the blocked Salesperson screen. These are not credentials. Only this signed Admin session can cancel. A saved invoice takes precedence.</p>
  <Field id="sale-recovery-key" label="Sale operation key"><Input id="sale-recovery-key" value={key} autoComplete="off" onChange={e=>{setKey(e.target.value);setReview(false);setState("");}}/></Field>
  <Field id="sale-recovery-context" label="Sale recovery context"><Input id="sale-recovery-context" value={context} autoComplete="off" onChange={e=>{setContext(e.target.value);setReview(false);setState("");}}/></Field>
  <p role="status">{state}</p><Button variant="outline" disabled={busy} onClick={()=>{void resolve(false);}}>Check original sale</Button>
  {state==="UNKNOWN"&&!review&&<Button variant="outline" disabled={busy} onClick={()=>setReview(true)}>Review permanent cancellation</Button>}
  {review&&<div><p>This permanently prevents this original key from creating a sale. It does not reverse a saved invoice.</p><Button disabled={busy} onClick={()=>{void resolve(true);}}>Confirm resolve or cancel sale</Button><Button variant="outline" onClick={()=>setReview(false)}>Keep blocked</Button></div>}
 </div></details>;
}
