"use client";

import { ReceiptPreview } from "@/components/demo/receipt-preview";
import { InvoiceItemsTable, InvoicePaperHeader } from "./invoice-presentation";
import { demoMoneyDecimal, formatDemoMoney } from "@/lib/demo/money";
import { historicalDateLabel, historicalTimeLabel, recordedSaleAmount, type HistoricalSalePreview } from "@/lib/sales-history-preview";

export function HistoricalReceipt({ sale }: { sale: HistoricalSalePreview }) {
  const amount = recordedSaleAmount(sale);
  const unitPrice = Number.isSafeInteger(sale.unitPricePaise) && sale.unitPricePaise >= 0 ? demoMoneyDecimal(BigInt(sale.unitPricePaise)) : null;
  return <ReceiptPreview developerCredit triggerLabel="View" triggerDescription={"View Receipt for " + sale.id} triggerClassName="min-h-11 px-3 text-sm" backLabel="Back to Sales History">
    <article className="sample-receipt-content grid min-w-0 gap-4 text-sm !text-black">
      <InvoicePaperHeader shopName={sale.shopName || "Shop POS"} address={sale.shopAddress} phone={sale.shopPhone} notice="SAMPLE / DEMO — NOT A TAX INVOICE" />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="font-semibold">{sale.receiptNumber ? "Invoice #" : "Demo sale reference"}</dt><dd className="break-all">{sale.receiptNumber || sale.id}</dd>
        {!sale.receiptNumber && <><dt className="font-semibold">Official invoice number</dt><dd>Not recorded</dd></>}
        <dt className="font-semibold">Recorded date</dt><dd>{historicalDateLabel(sale.businessDate)} (Karachi)</dd>
        <dt className="font-semibold">Recorded time</dt><dd>{historicalTimeLabel(sale)}</dd>
        {sale.customerName?.trim() && <><dt className="font-semibold">Customer</dt><dd className="break-words [overflow-wrap:anywhere]">{sale.customerName}</dd></>}
        {sale.customerPhone?.trim() && <><dt className="font-semibold">Customer Phone</dt><dd className="break-words">{sale.customerPhone}</dd></>}
      </dl>
      <InvoiceItemsTable items={[{ product: { name: sale.productName }, quantity: sale.quantity, unitPrice, total: amount === null ? null : demoMoneyDecimal(amount) }]} />
      <dl className="invoice-summary numeric"><div className="invoice-total"><dt>TOTAL</dt><dd data-testid="historical-receipt-total">{amount === null ? "Unavailable" : formatDemoMoney(amount)}</dd></div></dl>
      <div className="border-t border-dashed border-[#9ca3af] pt-3 text-center">
        <p className="break-words font-semibold [overflow-wrap:anywhere]">{sale.receiptMessage || "Thank you for shopping with us."}</p>
        <p className="mt-2 text-[10px]">Read-only sample copy. Original discount, cash received, change and tax: Not recorded. No new sale, payment or refund is saved.</p>
      </div>
    </article>
  </ReceiptPreview>;
}
