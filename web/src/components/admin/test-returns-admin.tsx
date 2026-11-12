"use client";
import {useState,useRef} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card,CardTitle} from "@/components/ui/card";
import {Field} from "@/components/ui/field";
import {returnsFetch,claim,check,changed} from "@/lib/returns/client";
import {displayMoney} from "@/lib/sales/client";
type Pending={id:string;kind:string;requesterRole:string;intent:{quote?:{invoiceNumber:string;totalPaisa:string;lines:{name:string;quantity:string;refundPaisa:string}[]}}};
type Detail={id:string;totalPaisa:string;lines:{returnLineId:string;name:string;quantity:string;pendingQuantity:string;originalCostPaisa:string;currentCostPaisa:string}[]};
export function TestReturnsAdmin({blocked,onChanged}:{blocked:boolean;onChanged:()=>void}){
 const[requests,setRequests]=useState<Pending[]>([]),[saved,setSaved]=useState<{id:string;totalPaisa:string}[]>([]),[detail,setDetail]=useState<Detail|null>(null),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[quantities,setQuantities]=useState<Record<string,{restock:string;damage:string;reason:string}>>({});
 const[key,setKey]=useState(""),[context,setContext]=useState(""),[kind,setKind]=useState("REFUND"),[resolution,setResolution]=useState("NO_CASH_PAID"),[cashDate,setCashDate]=useState(""),[attest,setAttest]=useState(false);
 const running=useRef(false);const[cursor,setCursor]=useState<string|null>(null);
 async function action(work:(secret:string)=>Promise<void>){if(running.current)return;running.current=true;setBusy(true);setError("");setNotice("");const secret=password;setPassword("");try{await work(secret);}catch{setError("Action unconfirmed. Preserve the original key. Never repeat a cash handover; reconcile unknown physical facts first.");}finally{running.current=false;setBusy(false);}}
 async function refresh(){setRequests((await returnsFetch("/api/admin/returns/requests")).items);const page=await returnsFetch("/api/admin/returns");setSaved(page.items);setCursor(page.nextCursor);}
 async function select(id:string){const v=await returnsFetch("/api/admin/returns/"+id);setDetail(v);setQuantities(Object.fromEntries(v.lines.map((l:Detail["lines"][number])=>[l.returnLineId,{restock:"0",damage:"0",reason:""}])));}
 return <div className="grid gap-5">
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <Card><CardTitle>Admin approval &amp; inspection</CardTitle><p>Exact approvals expire within 5 minutes. Verify payment and cash handling before authorizing. Never authorize a second payout for an unresolved return.</p>
   <Field id="return-authority-password" label="Fresh Admin password"><Input id="return-authority-password" type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)}/></Field>
   <Button variant="outline" disabled={busy} onClick={()=>{void action(refresh);}}>Refresh requests and returned goods</Button>
   <ul aria-label="Pending return requests" className="divide-y">{requests.map(r=><li className="space-y-2 py-3" key={r.id}><p className="break-all">{r.id} - {r.requesterRole} - {r.kind}</p>
    {r.intent.quote&&<><strong>{r.intent.quote.invoiceNumber}: {displayMoney(r.intent.quote.totalPaisa)}</strong>{r.intent.quote.lines.map((l,i)=><p key={i}>{l.name} x {l.quantity}: {displayMoney(l.refundPaisa)}</p>)}</>}
    {r.requesterRole==="SALESPERSON"&&r.kind==="REFUND"&&<Button disabled={busy} onClick={()=>{void action(async secret=>{await returnsFetch("/api/admin/returns/requests/"+r.id+"/approve",{password:secret,decision:"APPROVE"});setNotice("Exact refund authorized. Salesperson must check the current approval before cash handling.");await refresh();});}}>Approve exact refund</Button>}
    <Button disabled={busy} variant="outline" onClick={()=>{setKey(r.id);setKind(r.kind);setContext("");setAttest(false);}}>Reconcile this original key</Button>
   </li>)}</ul>
   {cursor&&<Button disabled={busy} variant="outline" onClick={()=>{void action(async()=>{const page=await returnsFetch("/api/admin/returns?cursor="+cursor);setSaved(old=>[...old,...page.items]);setCursor(page.nextCursor);});}}>More saved returns</Button>}
   <ul aria-label="Returned goods awaiting inspection" className="divide-y">{saved.map(r=><li key={r.id} className="py-2"><Button variant="outline" disabled={busy} onClick={()=>{void action(async()=>select(r.id));}}>Inspect return {r.id}</Button><span> {displayMoney(r.totalPaisa)}</span></li>)}</ul>
  </Card>
  {detail&&<Card><CardTitle>Inspect returned goods</CardTitle><p>Pending goods are not sellable. Inspect each item first. Restock reverses original sold COGS; damaged write-off does not add stock.</p>
   {detail.lines.map(l=><section key={l.returnLineId} className="my-3 grid gap-2 border-b pb-3"><strong>{l.name} - Pending: {l.pendingQuantity}</strong><p>Original cost: {displayMoney(l.originalCostPaisa)}; current valuation cost: {displayMoney(l.currentCostPaisa)}</p>
    {(["restock","damage","reason"] as const).map(field=><Field key={field} id={l.returnLineId+field} label={field==="restock"?"Sellable restock quantity":field==="damage"?"Damaged write-off quantity":"Inspection reason"}><Input id={l.returnLineId+field} inputMode={field==="reason"?"text":"numeric"} maxLength={field==="reason"?160:12} value={quantities[l.returnLineId]?.[field]??""} onChange={e=>setQuantities(v=>({...v,[l.returnLineId]:{...v[l.returnLineId],[field]:e.target.value}}))}/></Field>)}
   </section>)}
   <Button disabled={busy||blocked} onClick={()=>{void action(async secret=>{const m=await claim("DISPOSITION");onChanged();try{await returnsFetch("/api/admin/returns/"+detail.id+"/dispositions",{password:secret,requestKey:m.key,context:m.context,lines:detail.lines.filter(l=>quantities[l.returnLineId]?.restock!=="0"||quantities[l.returnLineId]?.damage!=="0").map(l=>({returnLineId:l.returnLineId,restockQuantity:quantities[l.returnLineId].restock,writeOffQuantity:quantities[l.returnLineId].damage,reason:quantities[l.returnLineId].reason}))});await check(m,"ADMIN");setNotice("Disposition committed. Acknowledge the original outcome before another mutation.");await select(detail.id);await refresh();}finally{changed();onChanged();}});}}>Confirm inspection and record disposition</Button>
   {blocked&&<p>Resolve and acknowledge the existing original operation before a replacement mutation.</p>}
  </Card>}
  <Card><CardTitle>Original-key Admin reconciliation</CardTitle><p>Never retry an UNKNOWN payout. Inspect the original SQL outcome and physical facts. No cash date is assumed. These actions record verified facts; they do not authorize handing over cash again.</p>
   <Field id="return-recovery-key" label="Original operation key"><Input id="return-recovery-key" value={key} maxLength={36} onChange={e=>setKey(e.target.value)}/></Field>
   <Field id="return-recovery-context" label="Original installation context"><Input id="return-recovery-context" value={context} maxLength={64} onChange={e=>setContext(e.target.value)}/></Field>
   <Button disabled={busy} variant="outline" onClick={()=>{void action(async()=>{const c=context||(await returnsFetch("/api/returns/context")).context;setContext(c);const r=await returnsFetch("/api/admin/return-operations/"+key+"/recovery",undefined,c,true);setNotice("Authoritative original outcome: "+r.state);});}}>Check authoritative original outcome</Button>
   <label>Operation kind <select aria-label="Recovery operation kind" value={kind} onChange={e=>{setKind(e.target.value);setResolution(e.target.value==="REFUND"?"NO_CASH_PAID":"NO_DISPOSITION_APPLIED");setAttest(false);}}><option>REFUND</option><option>DISPOSITION</option></select></label>
   <label>Verified facts <select aria-label="Recovery resolution" value={resolution} onChange={e=>{setResolution(e.target.value);setAttest(false);}}>{(kind==="REFUND"?["NO_CASH_PAID","RECORD_PRIOR_PAYOUT"]:["NO_DISPOSITION_APPLIED","RECORD_DISPOSITION"]).map(x=><option key={x}>{x}</option>)}</select></label>
   {resolution==="RECORD_PRIOR_PAYOUT"&&<Field id="recovery-cash-date" label="Verified actual prior cash handover date"><Input id="recovery-cash-date" type="date" value={cashDate} onChange={e=>setCashDate(e.target.value)}/></Field>}
   <label className="flex gap-2"><input type="checkbox" checked={attest} onChange={e=>setAttest(e.target.checked)}/>I verified these physical facts. No second cash handover or duplicate restock is being performed.</label>
   <Button disabled={busy||!attest} onClick={()=>{void action(async secret=>{const c=context||(await returnsFetch("/api/returns/context")).context;setContext(c);const r=await returnsFetch("/api/admin/return-operations/"+key+"/recovery",{password:secret,resolution,kind,...(resolution==="RECORD_PRIOR_PAYOUT"?{cashDate}:{})},c);setNotice("Original outcome: "+r.state+". Explicit acknowledgement is still required before clearing a browser marker.");setAttest(false);changed();onChanged();await refresh();});}}>Confirm verified reconciliation</Button>
  </Card>
 </div>;
}
