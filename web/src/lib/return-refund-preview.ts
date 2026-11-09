import type { DemoReturnSale } from "@/lib/demo/admin-preview";
import { calculateDemoCheckout } from "@/lib/demo/checkout";
import { demoMoneyDecimal } from "@/lib/demo/money";

/** Optional values must come from the original sale line and trustworthy recorded returns, never today's catalog. */
export type RefundSaleLine = DemoReturnSale & Readonly<{
  receiptNumber?: string; saleLineId?: string; paidAmountPaise?: number; discountPercent?: string;
  priorReturns?: readonly Readonly<{ id: string; quantity: string; refundPaise: number }>[];
}>;
export type CashRefundPreview = { error?: string; reason?: string; returnedQuantity?: string; refundPaise: bigint | null; remainingQuantity?: string; cumulativeKnown: boolean };
const scale = BigInt(1000000);
function units(raw: string): bigint | null {
  const value = raw.trim();
  if (value.length > 32 || !/^(?:\d+(?:\.\d{0,6})?|\.\d{1,6})$/.test(value)) return null;
  const [whole = "", fraction = ""] = value.split(".");
  const significant = whole.replace(/^0+/, "") || "0";
  if (significant.length > 12) return null;
  return BigInt(significant + fraction.padEnd(6, "0"));
}
function quantityString(value: bigint) {
  const raw = value.toString().padStart(7, "0"), fraction = raw.slice(-6).replace(/0+$/, "");
  return raw.slice(0, -6) + (fraction ? "." + fraction : "");
}
function safeMoney(value: number) { return Number.isSafeInteger(value) && value >= 0; }
function supported(sale: DemoReturnSale) { return Number.isSafeInteger(sale.quantity) && sale.quantity > 0 && safeMoney(sale.unitPricePaise); }
export function recordedPaidAmount(sale: RefundSaleLine): bigint | null {
  if (!supported(sale)) return null;
  const base = BigInt(sale.quantity) * BigInt(sale.unitPricePaise);
  const hasDiscount = sale.discountPercent !== undefined && sale.discountPercent.trim() !== "";
  const discounted = hasDiscount && sale.discountPercent!.trim() ? calculateDemoCheckout(demoMoneyDecimal(base), sale.discountPercent).value : null;
  if (hasDiscount && !discounted) return null;
  const fromDiscount = discounted ? BigInt(discounted.total.replace(".", "")) : null;
  if (sale.paidAmountPaise !== undefined) {
    if (!safeMoney(sale.paidAmountPaise)) return null;
    const paid = BigInt(sale.paidAmountPaise);
    return paid > base || (fromDiscount !== null && paid !== fromDiscount) ? null : paid;
  }
  return fromDiscount;
}
export function findReturnSales(sales: readonly RefundSaleLine[], query: string) {
  const text = query.trim().toLowerCase();
  return sales.filter((sale) => [sale.id, sale.receiptNumber ?? "", sale.productName].some((value) => value.toLowerCase().includes(text)));
}
/** Exact allocation only. A sub-paisa refund is unavailable rather than silently rounded. No transaction is performed. */
export function inspectCashRefund(sale: RefundSaleLine | undefined, raw: string): CashRefundPreview {
  const cumulativeKnown = sale?.priorReturns !== undefined;
  const empty = { refundPaise: null, cumulativeKnown };
  if (!sale) return { ...empty, error: "Choose an original sale from the search results." };
  if (!supported(sale)) return { ...empty, error: "This original sale has unsupported quantity or price details." };
  const sold = BigInt(sale.quantity) * scale, requested = units(raw);
  if (requested === null) return { ...empty, error: "Enter a positive quantity with no more than 6 decimal places." };
  if (requested <= BigInt(0)) return { ...empty, error: "Enter a quantity greater than zero." };
  let returned = BigInt(0), refunded = BigInt(0);
  const ids = new Set<string>();
  for (const prior of sale.priorReturns ?? []) {
    const q = units(prior.quantity);
    if (!prior.id || ids.has(prior.id) || q === null || q <= BigInt(0) || !safeMoney(prior.refundPaise)) return { ...empty, error: "Recorded prior-return information is inconsistent." };
    ids.add(prior.id); returned += q; refunded += BigInt(prior.refundPaise);
  }
  if (returned > sold) return { ...empty, error: "Recorded prior-return information is inconsistent." };
  const remaining = sold - returned;
  const result = { ...empty, returnedQuantity: raw.trim(), remainingQuantity: quantityString(remaining) };
  if (requested > remaining) return { ...result, error: cumulativeKnown ? "Return quantity cannot exceed the remaining returnable quantity." : "Return quantity cannot exceed the original quantity sold." };
  const paid = recordedPaidAmount(sale);
  if (paid === null) return { ...result, reason: "Original paid amount or discount information is missing or inconsistent." };
  if (refunded > paid) return { ...result, reason: "Recorded refunds exceed the original paid amount." };
  const remainingPaid = paid - refunded;
  // On a final remaining return use the recorded residual, including prior allocation differences.
  if (requested === remaining) return { ...result, refundPaise: remainingPaid };
  const proportional = paid * requested;
  if (proportional % sold !== BigInt(0)) return { ...result, reason: "This partial refund needs fractions of a paisa. This demo never rounds." };
  const refund = proportional / sold;
  if (refund > remainingPaid) return { ...result, reason: "The requested refund exceeds the remaining recorded amount paid." };
  return { ...result, refundPaise: refund };
}

export type RefundInvoice = Readonly<{ id: string; receiptNumber?: string; lines: readonly RefundSaleLine[]; error?: string }>;
export const refundLineKey = (line: RefundSaleLine) => JSON.stringify([line.id, line.saleLineId ?? null]);

/** Group by the real sale identity, never by product name or a guessed invoice number. */
export function groupReturnInvoices(lines: readonly RefundSaleLine[]): RefundInvoice[] {
  const groups = new Map<string, RefundSaleLine[]>();
  for (const line of lines) {
    const group = groups.get(line.id);
    if (group) group.push(line); else groups.set(line.id, [line]);
  }
  return [...groups].map(([id, items]) => {
    const keys = items.map(refundLineKey);
    const numbers = new Set(items.map((line) => line.receiptNumber).filter(Boolean));
    const invalid = !id.trim() || new Set(keys).size !== keys.length || numbers.size > 1
      || (items.length > 1 && items.some((line) => !line.saleLineId?.trim()));
    return { id, receiptNumber: items.find((line) => line.receiptNumber)?.receiptNumber, lines: items,
      ...(invalid ? { error: "Original invoice line identities are incomplete or inconsistent." } : {}) };
  });
}
export function findReturnInvoices(invoices: readonly RefundInvoice[], query: string) {
  const text = query.trim().toLowerCase();
  return invoices.filter((invoice) => [invoice.id, invoice.receiptNumber ?? "", ...invoice.lines.map((line) => line.productName)]
    .some((value) => value.toLowerCase().includes(text)));
}

/** Known prior returns are validated even when every unit has already been returned. */
export function remainingReturnQuantity(sale: RefundSaleLine): string | null {
  if (!supported(sale)) return null;
  let returned = BigInt(0);
  const ids = new Set<string>();
  for (const prior of sale.priorReturns ?? []) {
    const quantity = units(prior.quantity);
    if (!prior.id || ids.has(prior.id) || quantity === null || quantity <= BigInt(0) || !safeMoney(prior.refundPaise)) return null;
    ids.add(prior.id); returned += quantity;
  }
  const remaining = BigInt(sale.quantity) * scale - returned;
  return remaining < BigInt(0) ? null : quantityString(remaining);
}

export type InvoiceRefundSelection = Readonly<Record<string, string>>;
export function inspectInvoiceRefund(invoice: RefundInvoice | undefined, selection: InvoiceRefundSelection) {
  const rows = invoice?.lines.filter((line) => selection[refundLineKey(line)] !== undefined)
    .map((line) => ({ line, key: refundLineKey(line), preview: inspectCashRefund(line, selection[refundLineKey(line)]) })) ?? [];
  const bad = rows.find((row) => row.preview.error);
  const error = !invoice ? "Choose an original sale from the search results." : invoice.error
    ?? (Object.keys(selection).some((key) => !invoice.lines.some((line) => refundLineKey(line) === key)) ? "Selection does not belong to this invoice." : undefined)
    ?? (!rows.length ? "Select at least one item to return." : undefined) ?? bad?.preview.error;
  const totalRefundPaise = error ? null : rows.reduce<bigint | null>((total, row) =>
    total === null || row.preview.refundPaise === null ? null : total + row.preview.refundPaise, BigInt(0));
  return { error, errorLineKey: bad?.key, rows, totalRefundPaise };
}
