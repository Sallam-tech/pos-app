"use client";
import Link from "next/link";
import {Fragment,useEffect,useEffectEvent,useId,useRef,useState,type RefObject} from "react";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {Input} from "@/components/ui/input";
import {Field} from "@/components/ui/field";
import {Table,TableCell,TableHead,TableRegion} from "@/components/ui/table";
import {PageHeading} from "@/components/shell/page-heading";
import {rupees,today} from "@/lib/expenses/client";
import {reportFetch,reportParams,monthRange,recordedTime,type Overview,type Basis,type ProductsPage,type ProductDetail,type StockPage,type ExpensesPage} from "@/lib/reports/client";
import "@/app/admin/reports/reports.css";
function historyLabel(kind:string|null|undefined,tab:string){
 if(tab==="financial")return kind==="SALE"?"Sale":kind==="REFUND"?"Return / refund":kind==="INVOICE_CORRECTION"?"Sale correction":"Recorded activity";
 if(tab==="stock")return kind==="OPENING"?"Opening stock":kind==="RECEIVE"?"Stock received":kind==="ADJUST"?"Stock adjustment":kind==="SALE"?"Sale":kind==="RETURN"?"Returned stock":"Stock movement";
 return kind==="REPRICE"?"Buying-cost change":kind==="CREATE"?"Product added":kind==="EDIT"?"Product details changed":"Buying-cost history";
}
export function TestSavedFinancialReportProducts({period,initial,mode="profit",search,onSearchChange,detailsRef,showHistory=true,money=rupees}:{period:Basis;initial?:ProductsPage;mode?:"profit"|"sales";search?:string;onSearchChange?:(value:string)=>void;detailsRef?:RefObject<HTMLHeadingElement|null>;showHistory?:boolean;money?:(paisa:string|null|undefined)=>string}){
 const [localQuery,setLocalQuery]=useState(""),[applied,setApplied]=useState(""),[page,setPage]=useState<ProductsPage|null>(initial??null),[detail,setDetail]=useState<ProductDetail|null>(null),[expandedProduct,setExpandedProduct]=useState<string|null>(null),[tab,setTab]=useState("financial"),[error,setError]=useState(""),[busy,setBusy]=useState(false),[number,setNumber]=useState(1),generation=useRef(0),searchRef=useRef<HTMLInputElement>(null),tableId=useId();
 const query=search??localQuery;
 function updateQuery(value:string){if(onSearchChange)onSearchChange(value);else setLocalQuery(value);}
 async function load(cursor?:string,searchValue=query){const id=++generation.current;setBusy(true);setError("");setPage(null);setDetail(null);setExpandedProduct(null);try{const next=await reportFetch<ProductsPage>("products",reportParams(period,searchValue,cursor));if(id===generation.current){setPage(next);setApplied(searchValue);setNumber(n=>cursor?n+1:1);}}catch(e){if(id===generation.current)setError((e as Error).message);}finally{if(id===generation.current)setBusy(false);}}
 async function view(productId:string,section="financial",cursor?:string){const id=++generation.current;setBusy(true);setError("");setDetail(null);if(mode==="sales")setExpandedProduct(productId);try{const params=reportParams(period,"",cursor);params.set("tab",section);const result=await reportFetch<ProductDetail>("products/"+productId,params);if(id===generation.current){setDetail(result);setTab(section);}}catch(e){if(id===generation.current)setError((e as Error).message);}finally{if(id===generation.current)setBusy(false);}}
 const stop=useEffectEvent(()=>{generation.current++;});
 const first=useEffectEvent(()=>load());
 const searchChanged=useEffectEvent(()=>{if(query!==applied)void load(undefined,query);});
 useEffect(()=>{let active=true;if(!initial)queueMicrotask(()=>{if(active)void first();});return()=>{active=false;stop();};},[initial]);
 useEffect(()=>{if(query===applied)return;const timer=window.setTimeout(()=>searchChanged(),250);return()=>window.clearTimeout(timer);},[query,applied]);
 return <section id={mode==="sales"?"sales-details":"profit-details"} className="summary-panel mt-4 p-4" aria-labelledby={mode==="sales"?"sales-details-title":"profit-details-title"}>
  <h2 id={mode==="sales"?"sales-details-title":"profit-details-title"} ref={detailsRef} tabIndex={-1} className="section-title mb-3 scroll-mt-6">
   {mode==="sales"?"Sales Details":"Profit Details"}
  </h2>
  <div className="mb-3 flex flex-wrap items-end gap-2">
   <div className="w-full sm:max-w-sm">
    <Field id="saved-product-query" label="Search by product name">
     <Input ref={searchRef} id="saved-product-query" type="search" placeholder="Find product by name..."
      value={query} maxLength={120} onChange={e=>updateQuery(e.target.value)}/>
    </Field>
   </div>
   <Button variant="outline" disabled={busy} onClick={()=>{updateQuery("");searchRef.current?.focus();}}>Clear search</Button>
  </div>
  {error&&<p role="alert">{error}</p>}
  {(busy||query!==applied)&&<p role="status">Loading saved records…</p>}
  {page&&query===applied&&<>
   {query&&<dl aria-label={mode==="sales"?"Selected products revenue":"Selected products gross profit"} className="mb-3 text-sm">
    <div><dt className="text-muted-foreground">{mode==="sales"?"Selected Products Revenue":"Selected Products Gross Profit"}</dt>
     <dd className="numeric font-semibold">{mode==="sales"?money(page.filtered.revenuePaisa):money(page.filtered.grossProfitPaisa)}
      <span className="ml-2 text-xs font-normal text-muted-foreground">Matching product names · overall totals above include all products</span>
     </dd>
    </div>
   </dl>}
   <p role="status" aria-atomic="true" className="mb-3 text-xs text-muted-foreground">
    Showing {page.items.length} of {page.filtered.products} products for this period.
   </p>
   {page.items.length>0?<TableRegion label={mode==="sales"?"Sales results":"Profit results"}>
    <Table className={mode==="sales"?"min-w-[32rem]":"min-w-[38rem]"}>
     <caption className="sr-only">{mode==="sales"?"Saved product-wise sales":"Saved product-wise profit"}</caption>
     <thead><tr>
      <TableHead>Product</TableHead><TableHead className="text-right">{mode==="sales"?"Qty":"Sold"}</TableHead>
      <TableHead className="text-right">{mode==="sales"?"Total Sales":"Sales"}</TableHead>
      {mode==="profit"&&<><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Profit</TableHead></>}
     </tr></thead>
     <tbody>{page.items.map((p,index)=>{const expanded=mode==="sales"?expandedProduct===p.id:detail?.product.id===p.id,salesId=tableId+"-sales-"+index;return <Fragment key={p.id}><tr>
      <th scope="row" className="h-14 border-t px-4 py-3 font-semibold">
       {mode==="sales"
        ? <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
           <span>{p.name}</span>
           <Button variant="outline" size="sm" disabled={busy} aria-expanded={expanded} aria-controls={salesId}
            aria-label={(expanded?"Hide sales for ":"View sales for ")+p.name}
            onClick={()=>{if(expanded){generation.current++;setExpandedProduct(null);setDetail(null);}else void view(p.id);}}>{expanded?"Hide sales":"View sales"}</Button>
          </div>
        : showHistory
        ? <button type="button" className="cursor-pointer text-left font-semibold hover:underline focus-visible:underline"
           aria-expanded={detail?.product.id===p.id} aria-label={"View recorded history for "+p.name}
           onClick={()=>detail?.product.id===p.id?setDetail(null):void view(p.id)}>{p.name}</button>
        : p.name}
      </th>
      <TableCell className="numeric text-right">{p.quantity}</TableCell>
      <TableCell className="numeric whitespace-nowrap text-right">{money(p.revenuePaisa)}</TableCell>
      {mode==="profit"&&<>
       <TableCell className="numeric whitespace-nowrap text-right">{money(p.cogsPaisa)}</TableCell>
       <TableCell className={"numeric whitespace-nowrap text-right font-semibold "+(BigInt(p.grossProfitPaisa)<BigInt(0)?"text-danger":"text-success")}>
        {money(p.grossProfitPaisa)}{BigInt(p.grossProfitPaisa)<BigInt(0)?" (Loss)":""}
       </TableCell>
      </>}
     </tr>
     {mode==="sales"&&<tr id={salesId} hidden={!expanded}><td colSpan={3} className="border-t bg-muted/30 p-4">
      {expanded&&<section aria-label={"Individual sales for "+p.name}>
       <div className="mb-3"><h3 className="text-sm font-semibold">Individual sales — {p.name}</h3></div>
       {detail?.product.id===p.id&&detail.items.length
        ? <TableRegion label={"Individual sale details for "+p.name}>
          <Table className="min-w-[36rem]"><thead><tr><TableHead>Business date (Asia/Karachi)</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Sales (PKR)</TableHead></tr></thead>
           <tbody>{detail.items.map(v=><tr key={v.id}><TableCell>{v.effectiveDate}<span className="block text-xs">Recorded {recordedTime(v.recordedAtMs!)}</span></TableCell><TableCell>{historyLabel(v.kind,"financial")}</TableCell><TableCell className="numeric text-right">{v.quantity}</TableCell><TableCell className="numeric whitespace-nowrap text-right">{money(v.revenuePaisa)}</TableCell></tr>)}</tbody>
          </Table>
         </TableRegion>
        : busy&&expandedProduct===p.id?<p role="status">Loading saved sales…</p>:error?<p role="alert">Sales unavailable.</p>:<p>No sales for this product in this period.</p>}
       {detail?.product.id===p.id&&detail.nextCursor&&<Button className="mt-3" variant="outline" size="sm" disabled={busy} onClick={()=>void view(p.id,"financial",detail.nextCursor!)}>Older sales</Button>}
      </section>}
     </td></tr>}
    </Fragment>})}</tbody>
    </Table>
   </TableRegion>:<p className="rounded-md border bg-surface p-4 text-sm">
    {query?"No products match your search in this period.":mode==="sales"?"No sales found for this period.":"No sales for this period."}
   </p>}
   <div className="mt-3 flex gap-2">
    {page.nextCursor&&<Button disabled={busy} variant="outline" onClick={()=>void load(page.nextCursor!,applied)}>Next Products</Button>}
    {number>1&&<Button disabled={busy} variant="outline" onClick={()=>void load(undefined,applied)}>First Page</Button>}
   </div>
  </>}
  {showHistory&&detail&&<Card className="mt-4" aria-label="Product history">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <h2 className="section-title">{detail.product.name} · Product History</h2>
    <Button variant="outline" onClick={()=>{generation.current++;setDetail(null);setExpandedProduct(null);}}>Close Details</Button>
   </div>
   <p className="mt-2 text-sm">Current recorded stock: {detail.product.quantity} · Current buying cost {rupees(detail.product.buyingPricePaisa)} · Stock Value {rupees(detail.product.stockValuePaisa)}. Captured {recordedTime(detail.currentStockCapturedAtMs)}. Current valuation is separate from period cost.</p>
   <p className="mt-2">Period net sold {detail.totals.quantity} · Revenue {rupees(detail.totals.revenuePaisa)} · Original-cost COGS {rupees(detail.totals.cogsPaisa)} · Gross Profit {rupees(detail.totals.grossProfitPaisa)}</p>
   <div className="my-3 flex flex-wrap gap-2">
    {[["financial","Sales & Profit"],["stock","Recorded Stock Movements"],["cost","Buying-cost History"]].map(([value,label])=>
     <Button key={value} size="sm" variant={tab===value?"default":"outline"} disabled={busy} onClick={()=>void view(detail.product.id,value)}>{label}</Button>)}
   </div>
   <p className="mb-3 text-xs text-muted-foreground">
    {tab==="financial"?"Sale dates; original invoices and every revision remain unchanged.":"Recorded dates in Asia/Karachi; these are recorded movements, not estimated physical movement dates."}
   </p>
   <TableRegion label="Product history records">
    <Table className="min-w-[42rem]"><thead><tr><TableHead>Date / Time</TableHead><TableHead>Type</TableHead>
     {tab==="financial"?<><TableHead>Net Qty</TableHead><TableHead>Revenue</TableHead><TableHead>Cost</TableHead><TableHead>Gross Profit</TableHead></>
      :tab==="stock"?<><TableHead>Before</TableHead><TableHead>Change</TableHead><TableHead>After</TableHead><TableHead>Recorded Cost</TableHead></>
      :<><TableHead>Previous Cost</TableHead><TableHead>New Cost</TableHead></>}
    </tr></thead><tbody>{detail.items.map(v=><tr key={v.id}>
     <TableCell>{tab==="financial"?v.effectiveDate:recordedTime(v.recordedAtMs!)}
      {tab==="financial"&&<span className="block text-xs">Recorded {recordedTime(v.recordedAtMs!)}</span>}
     </TableCell>
     <TableCell>{historyLabel(v.kind,tab)}</TableCell>
     {tab==="financial"?<><TableCell>{v.quantity}</TableCell><TableCell>{rupees(v.revenuePaisa)}</TableCell><TableCell>{rupees(v.cogsPaisa)}</TableCell><TableCell>{rupees(v.grossProfitPaisa)}</TableCell></>
      :tab==="stock"?<><TableCell>{v.beforeQuantity}</TableCell><TableCell>{v.deltaQuantity}</TableCell><TableCell>{v.afterQuantity}</TableCell><TableCell>{rupees(v.costPaisa)}</TableCell></>
      :<><TableCell>{rupees(v.oldCostPaisa)}</TableCell><TableCell>{rupees(v.newCostPaisa)}</TableCell></>}
    </tr>)}</tbody></Table>
   </TableRegion>
   {!detail.items.length&&<p>No recorded activity in this period.</p>}
   {detail.nextCursor&&<Button className="mt-3" disabled={busy} variant="outline" onClick={()=>void view(detail.product.id,tab,detail.nextCursor!)}>Older Product Records</Button>}
   <p className="mt-3 text-sm"><Link href="/admin/sales" className="underline">Review Original / Revised Invoices</Link></p>
  </Card>}
 </section>;
}
export function TestReportsProducts({period,initial,mode="profit"}:{period:Basis;initial?:ProductsPage;mode?:"profit"|"sales"}){
 const [query,setQuery]=useState(""),[applied,setApplied]=useState(""),[page,setPage]=useState<ProductsPage|null>(initial??null),[detail,setDetail]=useState<ProductDetail|null>(null),[tab,setTab]=useState("financial"),[error,setError]=useState(""),[busy,setBusy]=useState(false),[number,setNumber]=useState(1),generation=useRef(0);
 async function load(cursor?:string,search=query){const id=++generation.current;setBusy(true);setError("");setPage(null);setDetail(null);try{const next=await reportFetch<ProductsPage>("products",reportParams(period,search,cursor));if(id===generation.current){setPage(next);setApplied(search);setNumber(n=>cursor?n+1:1);}}catch(e){if(id===generation.current)setError((e as Error).message);}finally{if(id===generation.current)setBusy(false);}}
 async function view(productId:string,section="financial",cursor?:string){const id=++generation.current;setBusy(true);setError("");setDetail(null);try{const params=reportParams(period,"",cursor);params.set("tab",section);const result=await reportFetch<ProductDetail>("products/"+productId,params);if(id===generation.current){setDetail(result);setTab(section);}}catch(e){if(id===generation.current)setError((e as Error).message);}finally{if(id===generation.current)setBusy(false);}}
 const stop=useEffectEvent(()=>{generation.current++;});const first=useEffectEvent(()=>load());useEffect(()=>{let active=true;if(!initial)queueMicrotask(()=>{if(active)void first();});return()=>{active=false;stop();};},[initial]);
 return <section className="summary-panel mt-4 p-4" aria-label="Saved product reports"><h2 className="section-title">{mode==="sales"?"Sales Details":"Profit Details"}</h2><div className="my-3 flex flex-wrap items-end gap-2"><Field id="saved-product-query" label="Search by product name or code"><Input id="saved-product-query" type="search" value={query} maxLength={120} onChange={e=>setQuery(e.target.value)}/></Field><Button variant="outline" disabled={busy} onClick={()=>void load()}>Search Products</Button><Button variant="outline" disabled={busy} onClick={()=>{setQuery("");void load(undefined,"");}}>Clear search</Button></div>
 {error&&<p role="alert">{error}</p>}{busy&&<p role="status">Loading saved product records…</p>}{page&&<><p className="mb-3 text-sm">{page.filtered.products} matching products · Page {number}. Matching sales {rupees(page.filtered.revenuePaisa)}{mode==="profit"&&<> · Gross Profit {rupees(page.filtered.grossProfitPaisa)}</>}. Expenses apply once to the full period.</p><TableRegion label="Saved product totals"><Table className="min-w-[42rem]"><thead><tr><TableHead>Product</TableHead><TableHead>Net Sold</TableHead><TableHead>Sales</TableHead>{mode==="profit"&&<><TableHead>Cost</TableHead><TableHead>Gross Profit</TableHead></>}<TableHead>Action</TableHead></tr></thead><tbody>{page.items.map(p=><tr key={p.id}><TableCell>{p.name}<span className="block text-xs text-muted-foreground">{p.code}</span></TableCell><TableCell>{p.quantity}</TableCell><TableCell>{rupees(p.revenuePaisa)}</TableCell>{mode==="profit"&&<><TableCell>{rupees(p.cogsPaisa)}</TableCell><TableCell>{rupees(p.grossProfitPaisa)}</TableCell></>}<TableCell><Button variant="outline" size="sm" disabled={busy} onClick={()=>void view(p.id)}>Product History</Button></TableCell></tr>)}</tbody></Table></TableRegion>{!page.items.length&&<p>No saved product activity matches this period and search.</p>}<div className="mt-3 flex gap-2">{page.nextCursor&&<Button disabled={busy} variant="outline" onClick={()=>void load(page.nextCursor!,applied)}>Next Products</Button>}{number>1&&<Button disabled={busy} variant="outline" onClick={()=>void load(undefined,applied)}>First Page</Button>}</div></>}
 {detail&&<Card className="mt-4" aria-label="Product history"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="section-title">{detail.product.name} · Product History</h2><Button variant="outline" onClick={()=>{generation.current++;setDetail(null);}}>Close Details</Button></div><p className="mt-2 text-sm">Current recorded stock: {detail.product.quantity} · Current buying cost {rupees(detail.product.buyingPricePaisa)} · Stock Value {rupees(detail.product.stockValuePaisa)}. Captured {recordedTime(detail.currentStockCapturedAtMs)}. Current valuation is separate from period COGS.</p><p className="mt-2">Period net sold {detail.totals.quantity} · Revenue {rupees(detail.totals.revenuePaisa)} · Original-cost COGS {rupees(detail.totals.cogsPaisa)} · Gross Profit {rupees(detail.totals.grossProfitPaisa)}</p><div className="my-3 flex flex-wrap gap-2">{[["financial","Sales & Profit"],["stock","Recorded Stock Movements"],["cost","Buying-cost History"]].map(([value,label])=><Button key={value} size="sm" variant={tab===value?"default":"outline"} disabled={busy} onClick={()=>void view(detail.product.id,value)}>{label}</Button>)}</div><p className="mb-3 text-xs text-muted-foreground">{tab==="financial"?"Economic event dates; original invoices and every revision remain immutable.":"Recorded dates in Asia/Karachi; these are recorded movements, not invented physical movement dates."}</p><TableRegion label="Product history records"><Table className="min-w-[42rem]"><thead><tr><TableHead>Date / Time</TableHead><TableHead>Type</TableHead>{tab==="financial"?<><TableHead>Net Qty</TableHead><TableHead>Revenue</TableHead><TableHead>COGS</TableHead><TableHead>Gross Profit</TableHead></>:tab==="stock"?<><TableHead>Before</TableHead><TableHead>Change</TableHead><TableHead>After</TableHead><TableHead>Recorded Cost</TableHead></>:<><TableHead>Previous Cost</TableHead><TableHead>New Cost</TableHead></>}</tr></thead><tbody>{detail.items.map(v=><tr key={v.id}><TableCell>{tab==="financial"?v.effectiveDate:recordedTime(v.recordedAtMs!)}{tab==="financial"&&<span className="block text-xs">Recorded {recordedTime(v.recordedAtMs!)}</span>}</TableCell><TableCell>{v.kind!.replaceAll("_"," ")}{v.invoiceId&&<span className="block text-xs" title={v.invoiceId}>Invoice ID {v.invoiceId.slice(0,8)}…</span>}</TableCell>{tab==="financial"?<><TableCell>{v.quantity}</TableCell><TableCell>{rupees(v.revenuePaisa)}</TableCell><TableCell>{rupees(v.cogsPaisa)}</TableCell><TableCell>{rupees(v.grossProfitPaisa)}</TableCell></>:tab==="stock"?<><TableCell>{v.beforeQuantity}</TableCell><TableCell>{v.deltaQuantity}</TableCell><TableCell>{v.afterQuantity}</TableCell><TableCell>{rupees(v.costPaisa)}</TableCell></>:<><TableCell>{rupees(v.oldCostPaisa)}</TableCell><TableCell>{rupees(v.newCostPaisa)}</TableCell></>}</tr>)}</tbody></Table></TableRegion>{!detail.items.length&&<p>No recorded activity in this period.</p>}{detail.nextCursor&&<Button className="mt-3" disabled={busy} variant="outline" onClick={()=>void view(detail.product.id,tab,detail.nextCursor!)}>Older Product Records</Button>}<p className="mt-3 text-sm"><Link href="/admin/sales" className="underline">See original and corrected bills</Link></p></Card>}
 </section>;
}
export function TestReportsExplorer({kind}:{kind:"products"|"expenses"|"stock"}){
 const [from,setFrom]=useState(today),[to,setTo]=useState(today),[month,setMonth]=useState(()=>today().slice(0,7)),[query,setQuery]=useState(""),[applied,setApplied]=useState(""),[overview,setOverview]=useState<Overview|null>(null),[expenses,setExpenses]=useState<ExpensesPage|null>(null),[stock,setStock]=useState<StockPage|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[number,setNumber]=useState(1),generation=useRef(0);
 async function load(start=from,end=to,cursor?:string,search=query){const id=++generation.current,basis=kind==="expenses"?expenses:stock;setBusy(true);setError("");setOverview(null);setExpenses(null);setStock(null);try{let params:URLSearchParams;if(cursor&&basis)params=reportParams(basis,applied,cursor);else params=new URLSearchParams({from:kind==="stock"?"2000-01-01":start,to:kind==="stock"?today():end,...(kind==="products"?{catalog:"YES"}:{query:search})});const value=await reportFetch<Overview|ExpensesPage|StockPage>(kind==="products"?"overview":kind,params);if(id===generation.current){if(kind==="products")setOverview(value as Overview);else if(kind==="expenses")setExpenses(value as ExpensesPage);else setStock(value as StockPage);setApplied(search);setNumber(n=>cursor?n+1:1);}}catch(e){if(id===generation.current)setError((e as Error).message);}finally{if(id===generation.current)setBusy(false);}}
 const stop=useEffectEvent(()=>{generation.current++;});const initial=useEffectEvent(()=>load("today","today"));useEffect(()=>{let live=true;queueMicrotask(()=>{if(live)void initial();});return()=>{live=false;stop();};},[]);
 const title=kind==="products"?"Product-wise Report":kind==="expenses"?"Shop Expenses":"Stock Value",basis=overview??expenses??stock;
 return <div className={kind==="stock"?"investment-workspace":"reports-workspace"}><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-3"><PageHeading route={kind==="stock"?"/admin/investment":"/admin/reports/"+kind}>{title}</PageHeading><Badge>Test mode</Badge></div><p className="mt-1 text-sm text-muted-foreground">Saved shop records · Asia/Karachi</p></div></div>{kind!=="stock"&&<Card className="mb-4"><div className="grid gap-3 sm:grid-cols-3"><Field id="report-from" label="From"><Input id="report-from" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></Field><Field id="report-to" label="To"><Input id="report-to" type="date" value={to} onChange={e=>setTo(e.target.value)}/></Field><Field id="report-month" label="Month"><Input id="report-month" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></Field></div><div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void load()}>Apply Period</Button><Button variant="outline" disabled={busy} onClick={()=>{try{const p=monthRange(month);setFrom(p.from);setTo(p.to);void load(p.from,p.to);}catch(e){setError((e as Error).message);}}}>Show Month</Button><Button variant="outline" disabled={busy} onClick={()=>{setFrom(today());setTo(today());void load("today","today");}}>Today</Button></div></Card>}{error&&<p role="alert">{error}</p>}{busy&&<p role="status">Loading saved report…</p>}{basis&&<p className="mb-3 text-sm">{kind==="stock"?"Current recorded inventory":basis.from+" to "+basis.to} · Records as of {recordedTime(basis.asOfMs)}</p>}
 {overview&&<TestReportsProducts key={overview.snapshot+overview.asOfMs} period={overview} initial={overview.productPage}/>}
 {(kind==="expenses"||kind==="stock")&&<div className="my-3 flex flex-wrap items-end gap-2"><Field id="report-search" label={kind==="stock"?"Search products":"Search expenses"}><Input id="report-search" type="search" value={query} maxLength={120} onChange={e=>setQuery(e.target.value)}/></Field><Button disabled={busy} variant="outline" onClick={()=>void load()}>Search Records</Button><Button disabled={busy} variant="outline" onClick={()=>{setQuery("");void load(from,to,undefined,"");}}>Clear search</Button></div>}
 {expenses&&<><Card aria-label="Expense report totals"><h2 className="section-title">Period Shop Expenses</h2><p className="numeric mt-3 text-xl font-bold">{rupees(expenses.periodExpensesPaisa)}</p><p className="mt-2 text-sm">{expenses.periodEntries} saved entries. Matching {expenses.filtered.entries} entries: {rupees(expenses.filtered.expensesPaisa)}. Corrections/reversals are included once.</p></Card><TableRegion label="Saved expense report"><Table className="mt-4 min-w-[38rem]"><thead><tr><TableHead>Business Date</TableHead><TableHead>Reason</TableHead><TableHead>Amount</TableHead><TableHead>Revision</TableHead><TableHead>Status</TableHead></tr></thead><tbody>{expenses.items.map(e=><tr key={e.id}><TableCell>{e.businessDate}</TableCell><TableCell>{e.reason}</TableCell><TableCell>{rupees(e.amountPaisa)}</TableCell><TableCell>{e.revision}</TableCell><TableCell>{e.status}</TableCell></tr>)}</tbody></Table></TableRegion>{!expenses.items.length&&<p>No saved expenses match this period and search.</p>}{expenses.nextCursor&&<Button className="mt-3" disabled={busy} variant="outline" onClick={()=>void load(from,to,expenses.nextCursor!)}>Next Expenses</Button>}<p className="mt-3 text-sm"><Link className="underline" href="/admin/expenses">View audited Expense History</Link>. Counter cash only; purchases/restocks are excluded.</p></>}
 {stock&&<section aria-label="Stock valuation overview"><Card className="max-w-3xl" aria-label="Total Stock Value"><h2 className="text-sm font-semibold">Total Stock Value</h2><p className="numeric mt-3 break-words text-xl font-bold">{rupees(stock.overall.stockValuePaisa)}</p><p className="mt-2 text-sm">Current recorded sellable stock × current approved buying costs. Captured {recordedTime(stock.capturedAtMs)}; this is not a historical period valuation or profit.</p></Card><details className="mt-4"><summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold">View Product Details</summary><p className="my-2 text-sm">{stock.filtered.products} matching products · Matching Stock Value {rupees(stock.filtered.stockValuePaisa)} · Page {number}</p><TableRegion label="Stock value products"><Table className="min-w-[36rem]"><thead><tr><TableHead>Product</TableHead><TableHead>Available</TableHead><TableHead>Buying Cost</TableHead><TableHead>Stock Value</TableHead></tr></thead><tbody>{stock.items.map(p=><tr key={p.id}><TableCell>{p.name}<span className="block text-xs">{p.code}</span></TableCell><TableCell>{p.quantity}</TableCell><TableCell>{rupees(p.buyingPricePaisa)}</TableCell><TableCell>{rupees(p.stockValuePaisa)}</TableCell></tr>)}</tbody></Table></TableRegion>{!stock.items.length&&<p>No saved products match this search.</p>}{stock.nextCursor&&<Button disabled={busy} className="mt-3" variant="outline" onClick={()=>void load(from,to,stock.nextCursor!)}>Next Stock Products</Button>}</details></section>}
 {number>1&&<Button disabled={busy} className="mt-3" variant="outline" onClick={()=>void load(from,to,undefined,applied)}>First Page</Button>}
 </div>;
}
