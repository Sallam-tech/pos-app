"use client";
import type {Receipt} from "@/server/sales/service";
import {ReceiptPreview} from "@/components/demo/receipt-preview";
import {displayMoney} from "@/lib/sales/client";
// Saved-sale receipt laid out for an 80 mm thermal printer (about 72 mm printable width).
export function TestSaleReceipt({receipt,onDone}:{receipt:Receipt;onDone:()=>void}){
 const time=new Date(Number(receipt.recordedAtMs)).toLocaleTimeString("en-PK",{timeZone:"Asia/Karachi",hour:"2-digit",minute:"2-digit"});
 return <ReceiptPreview backLabel="Finish this sale" open onOpenChange={()=>{}} title="Invoice Saved" description="Print the receipt, then press Done for the next sale." onDone={onDone} actionsAbove developerCredit thermalOnly>
  <article className="thermal-receipt">
   <header className="thermal-center"><strong className="thermal-shop">{receipt.shopName}</strong>{receipt.branding?.address&&<div>{receipt.branding.address}</div>}{receipt.branding?.phone&&<div>Ph: {receipt.branding.phone}</div>}<div className="thermal-small">TEST - NOT A TAX INVOICE</div></header>
   <div className="thermal-rule"/>
   <div className="thermal-row"><span>Inv: {receipt.number}</span></div>
   <div className="thermal-row"><span>{receipt.businessDate}</span><span>{time}</span></div>
   {receipt.customerName&&<div className="thermal-row"><span>{receipt.customerName} {receipt.customerPhone}</span></div>}
   <div className="thermal-rule"/>
   {receipt.lines.map((l,n)=>{const gross=BigInt(l.unitPricePaisa)*BigInt(l.quantity),off=gross-BigInt(l.totalPaisa);return <div key={n} className="thermal-item">
    <div className="thermal-name">{l.name}{l.sizeLabel?" "+l.sizeLabel:""} <span className="thermal-small">{l.code}</span></div>
    <div className="thermal-row"><span>{l.quantity} x {displayMoney(l.unitPricePaisa)}</span><span>{displayMoney(l.totalPaisa)}</span></div>
    {off>BigInt(0)&&<div className="thermal-row thermal-small"><span>Discount {l.discountPercent}%</span><span>-{displayMoney(off.toString())}</span></div>}
   </div>;})}
   <div className="thermal-rule"/>
   <div className="thermal-row thermal-total"><span>TOTAL</span><span data-testid="saved-sale-total">{displayMoney(receipt.totalPaisa)}</span></div>
   {receipt.payment?<><div className="thermal-row"><span>Cash</span><span>{displayMoney(receipt.payment.tenderedPaisa)}</span></div><div className="thermal-row"><span>Change</span><span>{displayMoney(receipt.payment.changePaisa)}</span></div></>:<div className="thermal-row thermal-small"><span>Cash payment</span><span>Not recorded</span></div>}
   <div className="thermal-rule"/>
   {receipt.branding?.footer&&<p className="thermal-center">{receipt.branding.footer}</p>}
  </article>
 </ReceiptPreview>;
}
