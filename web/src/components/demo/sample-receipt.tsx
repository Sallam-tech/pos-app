"use client";

import { ReceiptShopHeader, ReceiptShopFooter } from "@/components/settings/shop-identity";
import { useShopSettings } from "@/components/settings/use-shop-settings";
import { ReceiptPreview } from "@/components/demo/receipt-preview";
import { formatPreviewPKR, type SaleSimulation } from "@/lib/pos-preview";
import type { DemoCheckout } from "@/lib/demo/checkout";

export function SampleReceipt({ sale, checkout }: { sale: SaleSimulation; checkout: DemoCheckout }) {
  const settings = useShopSettings();
  const content = <article className="sample-receipt-content grid min-w-0 gap-5 text-base">
    <div className="border-b pb-4 text-center">
      <ReceiptShopHeader />
      <p className="mt-2 text-sm font-bold tracking-wide">SAMPLE RECEIPT - DEMO ONLY</p>
      <p className="mt-1 text-sm">Current sale preview - Not dated or saved as a transaction</p>
    </div>
    <table className="receipt-items"><caption className="sr-only">Sample invoice items</caption>
      <thead><tr><th scope="col">Product</th><th scope="col">Qty</th><th scope="col">Unit price</th><th scope="col">Amount</th></tr></thead>
      <tbody><tr><th scope="row">{sale.product.name}</th><td className="numeric">{sale.quantity}</td><td className="numeric">{formatPreviewPKR(sale.unitPrice)}</td><td className="numeric">{formatPreviewPKR(checkout.subtotal)}</td></tr></tbody>
    </table>
    <dl className="grid gap-3 text-sm sm:text-base">
      <div className="flex flex-wrap justify-between gap-x-3"><dt>Subtotal</dt><dd className="numeric break-all">{formatPreviewPKR(checkout.subtotal)}</dd></div>
      <div className="flex flex-wrap justify-between gap-x-3"><dt>Discount ({checkout.discountPercent}%)</dt><dd className="numeric break-all">{formatPreviewPKR(checkout.discountAmount)}</dd></div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t pt-4 text-lg font-bold"><dt>TOTAL</dt><dd className="numeric break-all" data-testid="receipt-total">{formatPreviewPKR(checkout.total)}</dd></div>
      {checkout.cashReceived !== null && <>
        <div className="flex flex-wrap justify-between gap-x-3"><dt>Cash received (demo)</dt><dd className="numeric break-all">{formatPreviewPKR(checkout.cashReceived)}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-3"><dt>Change to return</dt><dd className="numeric break-all">{checkout.change === null ? "Cash is short" : formatPreviewPKR(checkout.change)}</dd></div>
      </>}
    </dl>
    {checkout.cashWarning && <p className="text-sm">{checkout.cashWarning}</p>}
    <ReceiptShopFooter fallback="Thank you for shopping with us." />
    <p className="border-t pt-3 text-center text-sm">No sale, payment or stock change was saved. Not a tax invoice.</p>
  </article>;
  return <ReceiptPreview developerCredit initialLayout={settings.receiptLayout} triggerLabel="View Sample Receipt" backLabel="Back to Sale Preview" triggerClassName="min-h-12 w-full text-base">{content}</ReceiptPreview>;
}
