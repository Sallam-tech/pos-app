import type { RefundSaleLine } from "@/lib/return-refund-preview";
/** Isolated verification data. Never imported by production pages or original history. */
export const refundInvoiceFixture: readonly RefundSaleLine[] = [
  { id: "isolated-invoice", receiptNumber: "TEST-INVOICE", saleLineId: "a", productName: "Diapers", quantity: 2, unitPricePaise: 125000, discountPercent: "10", priorReturns: [] },
  { id: "isolated-invoice", receiptNumber: "TEST-INVOICE", saleLineId: "b", productName: "Milk Powder", quantity: 1, unitPricePaise: 80000, discountPercent: "5", priorReturns: [] },
  { id: "isolated-invoice", receiptNumber: "TEST-INVOICE", saleLineId: "c", productName: "Hand Soap", quantity: 3, unitPricePaise: 12500, discountPercent: "0", priorReturns: [{ id: "soap-return", quantity: "1", refundPaise: 12500 }] },
  { id: "isolated-invoice", receiptNumber: "TEST-INVOICE", saleLineId: "d", productName: "Baby Wipes", quantity: 1, unitPricePaise: 50000, discountPercent: "0", priorReturns: [] },
  { id: "isolated-invoice", receiptNumber: "TEST-INVOICE", saleLineId: "e", productName: "Rice", quantity: 5, unitPricePaise: 10000, discountPercent: "0", priorReturns: [{ id: "rice-return-1", quantity: "1", refundPaise: 10000 }, { id: "rice-return-2", quantity: "1", refundPaise: 10000 }] },
];
