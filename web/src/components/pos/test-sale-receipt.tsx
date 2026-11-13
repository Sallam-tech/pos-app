"use client";
import type {Receipt} from "@/server/sales/service";
import {InvoicePaperHeader,InvoiceItemsTable} from "./invoice-presentation";
import {ReceiptPreview} from "@/components/demo/receipt-preview";
import {decimalMoney,displayMoney} from "@/lib/sales/client";
export function TestSaleReceipt({receipt,onDone}:{receipt:Receipt;onDone:()=>void}){
 return <ReceiptPreview backLabel="Acknowledge saved invoice" open onOpenChange={()=>{}} title="Saved TEST Invoice" description="Read-only saved invoice. Done acknowledges this saved result; it does not create another sale." onDone={onDone} actionsAbove developerCredit initialLayout={receipt.branding?.receiptLayout??"ordinary"}>
  <article className="grid gap-4 bg-white text-black">
   <InvoicePaperHeader shopName={receipt.shopName} address={receipt.branding?.address} phone={receipt.branding?.phone} notice="SAVED / ISOLATED TEST - NOT A TAX INVOICE"/>
   <p className="break-all text-xs">Invoice: {receipt.number}<br/>Date: {receipt.businessDate} / {new Date(Number(receipt.recordedAtMs)).toLocaleTimeString("en-PK",{timeZone:"Asia/Karachi"})}</p>
   {receipt.customerName&&<p>Customer: {receipt.customerName} {receipt.customerPhone}</p>}
   <InvoiceItemsTable caption="Saved invoice items" items={receipt.lines.map(l=>({product:{name:[l.name,l.sizeLabel,l.code].filter(Boolean).join(" / ")},quantity:l.quantity,unitPrice:decimalMoney(l.unitPricePaisa),total:decimalMoney(l.totalPaisa),discountPercent:l.discountPercent,discountAmount:decimalMoney((BigInt(l.unitPricePaisa)*BigInt(l.quantity)-BigInt(l.totalPaisa)).toString())}))}/>
   <dl className="invoice-summary"><div className="invoice-total"><dt>Total</dt><dd data-testid="saved-sale-total">{displayMoney(receipt.totalPaisa)}</dd></div>
    {receipt.payment?<><div><dt>Cash received</dt><dd>{displayMoney(receipt.payment.tenderedPaisa)}</dd></div><div><dt>Change</dt><dd>{displayMoney(receipt.payment.changePaisa)}</dd></div></>:<div><dt>Cash payment</dt><dd>UNRECORDED</dd></div>}
   </dl>
   {receipt.branding?.footer&&<p className="text-center">{receipt.branding.footer}</p>}
  </article>
 </ReceiptPreview>;
}
