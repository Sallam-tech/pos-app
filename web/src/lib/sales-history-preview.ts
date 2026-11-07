import { isDemoCalendarDate } from "@/lib/demo/admin-preview";
/** Allowlisted historical sale fields only; no stock, purchase cost or profit. */
export type HistoricalSalePreview = Readonly<{
  id: string; businessDate: string; productName: string; quantity: number; unitPricePaise: number;
  receiptNumber?: string; recordedAt?: string; customerName?: string; customerPhone?: string;
  shopName?: string; shopAddress?: string; shopPhone?: string; receiptMessage?: string;
}>;
export function recordedSaleAmount(sale: HistoricalSalePreview): bigint | null {
  if (!Number.isSafeInteger(sale.quantity) || sale.quantity <= 0 || !Number.isSafeInteger(sale.unitPricePaise) || sale.unitPricePaise < 0) return null;
  return BigInt(sale.quantity) * BigInt(sale.unitPricePaise);
}
export function filterHistoricalSales(sales: readonly HistoricalSalePreview[], reference: string, product: string, date: string) {
  if (date && !isDemoCalendarDate(date)) return [];
  const ref = reference.trim().toLowerCase(), name = product.trim().toLowerCase();
  return sales.filter((sale) => (sale.id.toLowerCase().includes(ref) || Boolean(sale.receiptNumber?.toLowerCase().includes(ref)))
    && sale.productName.toLowerCase().includes(name) && (!date || sale.businessDate === date));
}
export function historicalDateLabel(date: string): string {
  if (!isDemoCalendarDate(date)) return "Not recorded";
  const [year, month, day] = date.split("-").map(Number);
  return day + " " + ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month - 1] + " " + year;
}

/** Unknown time never becomes midnight or an ordering guess based on demo ID. */
function recordedTimestamp(sale: HistoricalSalePreview): number | null {
  const value = sale.recordedAt;
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  if (!isDemoCalendarDate(value.slice(0, 10))) return null;
  const time = Date.parse(value); return Number.isFinite(time) ? time : null;
}
export function historicalTimeLabel(sale: HistoricalSalePreview): string {
  const time = recordedTimestamp(sale);
  return time === null ? "Not recorded" : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" }).format(new Date(time));
}
export function orderHistoricalSales(sales: readonly HistoricalSalePreview[]): HistoricalSalePreview[] {
  return [...sales].sort((a, b) => {
    const left = recordedTimestamp(a), right = recordedTimestamp(b);
    if (left !== null && right !== null) return right - left;
    return b.businessDate.localeCompare(a.businessDate);
  });
}
