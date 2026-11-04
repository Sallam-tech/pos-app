import {
  aggregateMockProfit, calculateMockProfitTotals, formatProfitMoney, type ProfitSale,
} from "@/lib/admin/mock-profit";
import { formatMockBusinessDate, formatMockReportMonth } from "@/lib/admin/mock-sales-report";

export type ChartRow = Readonly<{ id: string; label: string; value: bigint | null; display: string }>;
export type ChartKind = "sales" | "profit";
export type ChartGrouping = "daily" | "monthly";

// Quantities here are canonical strings returned by the approved exact helper.
// This scale is only for comparing/drawing quantity bars, never money totals.
function quantityValue(quantity: string | null): bigint | null {
  if (quantity === null || !/^\d+(\.\d{1,6})?$/.test(quantity)) return null;
  const [whole, fraction = ""] = quantity.split(".");
  return BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0"));
}
function compareText(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
function descending(a: ChartRow, b: ChartRow) {
  if (a.value === null && b.value !== null) return 1;
  if (b.value === null && a.value !== null) return -1;
  if (a.value !== null && b.value !== null && a.value !== b.value) return a.value > b.value ? -1 : 1;
  return compareText(a.label.toLowerCase(), b.label.toLowerCase()) || compareText(a.id, b.id);
}

export function productChartRows(sales: readonly ProfitSale[], kind: ChartKind): ChartRow[] {
  return aggregateMockProfit(sales).map((product) => ({
    id: product.productId, label: product.productName,
    value: kind === "sales" ? quantityValue(product.quantity) : product.grossProfitPaise,
    display: kind === "sales" ? (product.quantity === null ? "Not available" : product.quantity + " units") : formatProfitMoney(product.grossProfitPaise),
  })).sort(descending);
}

export function timeChartRows(sales: readonly ProfitSale[], kind: ChartKind, grouping: ChartGrouping): ChartRow[] {
  const groups = new Map<string, ProfitSale[]>();
  // Already-filtered shop business dates are calendar strings, not instants.
  // Do not fill gaps or manufacture transactions for absent dates.
  for (const sale of sales) {
    const key = grouping === "daily" ? sale.businessDate : sale.businessDate.slice(0, 7);
    const group = groups.get(key) ?? [];
    group.push(sale);
    groups.set(key, group);
  }
  return [...groups].sort(([a], [b]) => compareText(a, b)).map(([id, group]) => {
    const totals = calculateMockProfitTotals(group);
    const value = kind === "sales" ? totals.revenuePaise : totals.grossProfitPaise;
    return { id, label: grouping === "daily" ? formatMockBusinessDate(id) : formatMockReportMonth(id), value, display: formatProfitMoney(value) };
  });
}

// Only a bounded ratio becomes a Number, after exact BigInt division.
// Financial labels/aggregation never pass through floating point.
export function chartWidthPercent(value: bigint | null, maximum: bigint): number {
  if (value === null || maximum <= BigInt(0)) return 0;
  const magnitude = value < BigInt(0) ? -value : value;
  const bounded = magnitude > maximum ? maximum : magnitude;
  return Number(bounded * BigInt(10_000) / maximum) / 100;
}
