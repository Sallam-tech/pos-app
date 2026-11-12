"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card,CardTitle} from "@/components/ui/card";
import {Field} from "@/components/ui/field";
import {displayMoney} from "@/lib/sales/client";
import {readMarker,type RecoveryMarker} from "@/lib/returns/recovery-store";
import {returnsFetch,claim,check,acknowledge,changed,type ReturnRole} from "@/lib/returns/client";
import {TestReturnsAdmin} from "@/components/admin/test-returns-admin";
type Invoice={invoiceId:string;invoiceNumber:string;paymentRecorded:boolean;lines:{saleLineId:string;name:string;quantity:string;remainingQuantity:string;unitPayablePaisa:string;paidPaisa:string|null}[]};
type Quote={invoiceNumber:string;totalPaisa:string;lines:{saleLineId:string;name:string;quantity:string;refundPaisa:string}[]};
type Outcome={state:string;key:string;context:string;kind?:string;quote?:Quote;cashDate?:string;refund?:{id:string;totalPaisa:string;cashDate:string;lines:{name:string;quantity:string;refundPaisa:string}[]}};
export function TestReturns({role}:{role:ReturnRole}){
 const[query,setQuery]=useState(""),[invoices,setInvoices]=useState<Invoice[]>([]),[invoice,setInvoice]=useState<Invoice|null>(null),[selection,setSelection]=useState<Record<string,string>>({}),[quote,setQuote]=useState<Quote|null>(null);
 const[marker,setMarker]=useState<RecoveryMarker|null>(null),[outcome,setOutcome]=useState<Outcome|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[uncertain,setUncertain]=useState(false),[password,setPassword]=useState(""),[confirmed,setConfirmed]=useState(false),[cashDate,setCashDate]=useState("");
 const[cursor,setCursor]=useState<string|null>(null);
 const running=useRef(false),observed=useRef<RecoveryMarker|null>(null);
 const refresh=useCallback(async(recovered=false)=>{try{const m=await readMarker();setReady(true);setMarker(m);if(!m){if(observed.current){setInvoice(null);setSelection({});setQuote(null);setOutcome(null);setConfirmed(false);}observed.current=null;return;}if(recovered&&observed.current?.key!==m.key)setUncertain(true);observed.current=m;const x=await check(m,role);setMarker(x.marker);setOutcome(x.result);if(x.result.cashDate)setCashDate(x.result.cashDate);}catch{setReady(false);setError("Recovery unavailable. Keep the original key; mutation blocked.");}},[role]);
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(active)void refresh(true);});const c=new BroadcastChannel("pos-test-returns-changes");c.onmessage=()=>{void refresh(true);};return()=>{active=false;c.close();};},[refresh]);
 const input=()=>({invoiceId:invoice?.invoiceId,lines:Object.entries(selection).map(([saleLineId,quantity])=>({saleLineId,quantity}))});
 const search=async(next?:string)=>{try{const r=await returnsFetch("/api/returns/invoices?query="+encodeURIComponent(query.trim())+(next?"&cursor="+next:""));setInvoices(old=>next?[...old,...r.items]:r.items);setCursor(r.nextCursor);setError("");}catch{setError("Original invoices unavailable.");}};
 const review=async()=>{try{setQuote(await returnsFetch("/api/returns/quote",input()));setError("");}catch{setError("Refund unavailable: verify original payment, selected quantities and prior returns.");}};
 const prepare=async()=>{
  if(running.current||marker||!ready||!quote)return;running.current=true;setBusy(true);setConfirmed(false);setError("");const secret=password;setPassword("");
  try{const m=await claim("REFUND");observed.current=m;setMarker(m);await returnsFetch(role==="ADMIN"?"/api/admin/returns":"/api/pos/returns/requests",role==="ADMIN"?{action:"PREPARE",requestKey:m.key,context:m.context,password:secret,input:input()}:{requestKey:m.key,context:m.context,input:input()});const r=await check(m,role);setMarker(r.marker);setOutcome(r.result);setCashDate(r.result.cashDate??"");setUncertain(false);}
  catch{setUncertain(true);setError("Request unconfirmed. Original key retained; do not handle cash. Admin reconciliation required.");await refresh(true);}
  finally{running.current=false;setBusy(false);changed();}
 };
 const execute=async()=>{
  if(!marker||running.current||uncertain||outcome?.state!=="APPROVED"||!confirmed)return;running.current=true;setBusy(true);setUncertain(true);setConfirmed(false);
  try{const m=marker;await returnsFetch(role==="ADMIN"?"/api/admin/returns":"/api/pos/returns/"+m.key+"/execute",role==="ADMIN"?{action:"EXECUTE",requestKey:m.key,confirmation:"CASH_HANDED_OVER",cashDate}:{confirmation:"CASH_HANDED_OVER",cashDate});const r=await check(m,role);setMarker(r.marker);setOutcome(r.result);setError("");}
  catch{setError("Payout recording UNKNOWN. Never hand over cash again. Fresh Admin reconciliation required.");await refresh(true);}
  finally{running.current=false;setBusy(false);changed();}
 };
 const done=async()=>{if(!marker||running.current)return;running.current=true;setBusy(true);try{await acknowledge(marker,role);observed.current=null;setMarker(null);setOutcome(null);setQuote(null);setInvoice(null);setSelection({});setConfirmed(false);setUncertain(false);setError("");}catch{setError("Acknowledgement unconfirmed. Original key remains blocked.");}finally{running.current=false;setBusy(false);}};
 const shown=outcome?.quote??quote;
 return <div className="mx-auto grid max-w-4xl gap-5">
  {error&&<p role="alert" className="rounded-md border border-danger p-3 text-sm">{error}</p>}
  {marker&&<Card><CardTitle>Return recovery</CardTitle><p role="status">{outcome?.state??"UNKNOWN"}{uncertain&&!["COMMITTED","CANCELLED"].includes(outcome?.state??"")?" — cash handling blocked; Admin must reconcile":""}</p><p className="break-all text-xs">Operation {marker.key}<br/>Context {marker.context}</p><Button disabled={busy} variant="outline" onClick={()=>{void refresh();}}>Check original return</Button>
   {outcome?.state==="COMMITTED"&&outcome.refund&&<div aria-label="Saved refund"><p>Saved refund: {displayMoney(outcome.refund.totalPaisa)}</p><p>Cash date: {outcome.refund.cashDate}</p><p>Returned goods remain pending inspection until Admin disposition.</p></div>}
   {["COMMITTED","CANCELLED"].includes(outcome?.state??"")&&<Button disabled={busy} onClick={()=>{void done();}}>Acknowledge original outcome</Button>}
  </Card>}
  <Card><fieldset disabled={!ready||!!marker||busy} className="space-y-5">
   <CardTitle>Find Original Sale</CardTitle><form onSubmit={e=>{e.preventDefault();void search();}} className="flex gap-3"><Input aria-label="Find original invoice or product" type="search" value={query} maxLength={120} onChange={e=>setQuery(e.target.value)} placeholder="Search invoice number or product name..."/><Button type="submit" variant="outline">Search</Button></form>
   {invoices.length>0&&<ul aria-label="Matching original sales" className="divide-y rounded-md border">{invoices.map(i=><li key={i.invoiceId}><Button variant="ghost" onClick={()=>{setInvoice(i);setSelection({});setQuote(null);}}>{i.invoiceNumber}</Button>{!i.paymentRecorded&&<p>Payment UNRECORDED — refund unavailable.</p>}</li>)}</ul>}
   {cursor&&<Button variant="outline" onClick={()=>{void search(cursor);}}>More matching original sales</Button>}
   {invoice&&<section><div className="flex justify-between"><strong className="break-all">{invoice.invoiceNumber}</strong><Button variant="outline" disabled={!invoice.paymentRecorded} onClick={()=>{setSelection(Object.fromEntries(invoice.lines.filter(l=>BigInt(l.remainingQuantity)>BigInt(0)).map(l=>[l.saleLineId,l.remainingQuantity])));setQuote(null);}}>Select all remaining</Button></div>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Select","Product","Sold Qty","Return Qty","Original Unit Paid","Refund"].map(x=><th key={x} className="p-2 text-left">{x}</th>)}</tr></thead><tbody>{invoice.lines.map(l=><tr key={l.saleLineId}>
     <td><input type="checkbox" aria-label={"Select "+l.name} disabled={!invoice.paymentRecorded||l.remainingQuantity==="0"} checked={selection[l.saleLineId]!==undefined} onChange={e=>{setSelection(old=>{const n={...old};if(e.target.checked)n[l.saleLineId]="1";else delete n[l.saleLineId];return n;});setQuote(null);}}/></td><td>{l.name}<small className="block">Remaining returnable: {l.remainingQuantity}</small></td><td>{l.quantity}</td><td><Input aria-label={"Return Quantity — "+l.name} inputMode="numeric" maxLength={12} disabled={selection[l.saleLineId]===undefined} value={selection[l.saleLineId]??""} onChange={e=>{setSelection(v=>({...v,[l.saleLineId]:e.target.value}));setQuote(null);}}/></td><td>{l.paidPaisa===null?"Not recorded":displayMoney(l.unitPayablePaisa)}</td><td>{quote?.lines.find(x=>x.saleLineId===l.saleLineId)?.refundPaisa?displayMoney(quote.lines.find(x=>x.saleLineId===l.saleLineId)!.refundPaisa):"Review"}</td>
    </tr>)}</tbody></table></div><Button className="mt-4" onClick={()=>{void review();}}>Review Refund</Button>
   </section>}
  </fieldset></Card>
  {shown&&<Card><CardTitle>Refund Review</CardTitle><p className="break-all">{shown.invoiceNumber}</p>{shown.lines.map((l,i)=><p key={i}>{l.name} × {l.quantity}: {displayMoney(l.refundPaisa)}</p>)}<p className="font-bold">Total Cash Refund: {displayMoney(shown.totalPaisa)}</p><p className="text-sm">Pending inspection. No sellable stock or COGS reversal at refund.</p>
   {!marker&&<>{role==="ADMIN"&&<Field label="Fresh Admin password" id="return-admin-password"><Input id="return-admin-password" type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)}/></Field>}<Button disabled={!ready||busy} onClick={()=>{void prepare();}}>{role==="ADMIN"?"Authorize exact refund":"Request Admin approval"}</Button></>}
   {marker&&outcome?.state==="APPROVED"&&!uncertain&&<div className="space-y-3"><p>Check approval immediately before handling cash. Never hand it over twice.</p><Field label="Actual cash handover date" id="refund-cash-date"><Input id="refund-cash-date" type="date" value={cashDate} onChange={e=>setCashDate(e.target.value)}/></Field><label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I handed over this exact cash refund once on the shown date</label><Button disabled={!confirmed||busy} onClick={()=>{void execute();}}>Record confirmed cash handover</Button></div>}
   {marker&&outcome?.state==="AWAITING_APPROVAL"&&<p>Owner approval is required in the separate trusted Admin Returns page. Do not hand over cash yet.</p>}
  </Card>}
  {role==="ADMIN"&&<TestReturnsAdmin blocked={!!marker} onChanged={()=>{void refresh(true);}}/>}
 </div>;
}
