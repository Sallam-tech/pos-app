"use client";
import {Button} from "@/components/ui/button";
import {shortInvoiceReference} from "./invoice-reference";

export type ReturnSearchLine={saleLineId:string;name:string;code:string;sizeLabel:string|null;quantity:string;remainingQuantity:string;unitPayablePaisa:string;paidPaisa:string|null;matched:boolean};
export type ReturnSearchInvoice={invoiceId:string;invoiceNumber:string;paymentRecorded:boolean;businessDate:string;customerName:string|null;customerPhone:string|null;lines:ReturnSearchLine[]};
/** Sale line id -> quantity to return, as typed in the existing return table. */
export type ReturnSelection=Record<string,string>;

const returnable=(line:ReturnSearchLine)=>BigInt(line.remainingQuantity)>BigInt(0);
/** Everything still returnable on the bill: the full remaining quantity of every line. */
export const wholeBillSelection=(invoice:ReturnSearchInvoice):ReturnSelection=>Object.fromEntries(invoice.lines.filter(returnable).map(line=>[line.saleLineId,line.remainingQuantity]));

// Picking a bill, one product or the whole bill only fills the existing return table; the
// refund is still quoted by the server and approved by Admin before any cash is handed over.
export function ReturnSearchResults({invoices,onChoose}:{invoices:ReturnSearchInvoice[];onChoose:(invoice:ReturnSearchInvoice,selection:ReturnSelection)=>void}){
 if(!invoices.length)return null;
 return <ul aria-label="Matching original sales" className="divide-y rounded-md border">{invoices.map(invoice=>{
  const reference=shortInvoiceReference(invoice.invoiceNumber),anyLeft=invoice.lines.some(returnable);
  return <li key={invoice.invoiceId} className="space-y-2 p-3">
   <div className="flex flex-wrap items-start justify-between gap-2">
    <Button variant="ghost" aria-label={invoice.invoiceNumber} className="h-auto flex-col items-start px-2 text-left" onClick={()=>onChoose(invoice,{})}>
     <span title={invoice.invoiceNumber}>{reference}</span>
     <span className="text-sm font-normal">{[invoice.businessDate,invoice.customerName,invoice.customerPhone].filter(Boolean).join(" · ")}</span>
    </Button>
    <Button variant="outline" size="sm" aria-label={"Return whole bill "+reference} disabled={!invoice.paymentRecorded||!anyLeft} onClick={()=>onChoose(invoice,wholeBillSelection(invoice))}>Return whole bill</Button>
   </div>
   <ul aria-label={"Products on bill "+reference} className="space-y-1 text-sm">{invoice.lines.map(line=><li key={line.saleLineId} className={"flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1"+(line.matched?" border-l-4 border-primary bg-accent":"")}>
    <span>
     <span className={line.matched?"font-semibold":undefined}>{line.name}</span>
     {line.matched&&<span className="ml-2 rounded border px-1 text-xs">Match</span>}
     <small className="block text-muted-foreground">{[line.code&&"Code "+line.code,line.sizeLabel,"Sold "+line.quantity,returnable(line)?"Can return "+line.remainingQuantity:"Already returned"].filter(Boolean).join(" · ")}</small>
    </span>
    <Button variant="outline" size="sm" aria-label={"Return this item — "+line.name+" ("+reference+")"} disabled={!invoice.paymentRecorded||!returnable(line)} onClick={()=>onChoose(invoice,{[line.saleLineId]:"1"})}>Return this item</Button>
   </li>)}</ul>
   {!invoice.paymentRecorded&&<p className="text-sm">Cash received was not entered for this bill, so it cannot be refunded.</p>}
  </li>;
 })}</ul>;
}
