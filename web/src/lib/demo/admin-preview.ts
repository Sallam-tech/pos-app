import type { MockSale } from "@/lib/admin/mock-sales";
import { previewTotal } from "@/lib/pos-preview";
import { demoMoneyDecimal as mockRevenueDecimal, parseDemoMoney } from "./money";

export const demoExpenseTypes = ["Rent", "Electricity", "Transport", "Other"] as const;
export type DemoExpenseType = typeof demoExpenseTypes[number];
export type DemoExpense = Readonly<{ id: number; date: string; type: DemoExpenseType; description: string; amountPaise: bigint }>;

export function isDemoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function demoExpenseTotals(entries: readonly DemoExpense[], date: string): { daily: bigint | null; monthly: bigint | null } {
  if (!isDemoCalendarDate(date)) return { daily: null, monthly: null };
  return entries.reduce((totals, entry) => ({
    daily: totals.daily + (entry.date === date ? entry.amountPaise : BigInt(0)),
    monthly: totals.monthly + (entry.date.slice(0, 7) === date.slice(0, 7) ? entry.amountPaise : BigInt(0)),
  }), { daily: BigInt(0), monthly: BigInt(0) });
}

export type DemoReturnSale = Pick<MockSale, "id" | "productName" | "quantity" | "unitPricePaise">;

export type ReturnPreview = { error?: string; originalAmountPaise?: bigint; returnedQuantity?: string; refundPaise: null };
/**
 * The original fixture has no recorded discount/refund terms. Calculate only its
 * already recorded line amount; never infer an approved refund.
 */
export function inspectDemoReturn(sale: Pick<DemoReturnSale, "quantity" | "unitPricePaise"> | undefined, quantity: string): ReturnPreview {
  if (!sale) return { error: "Choose an original demo sale.", refundPaise: null };
  if (!Number.isSafeInteger(sale.quantity) || sale.quantity <= 0 || !Number.isSafeInteger(sale.unitPricePaise) || sale.unitPricePaise < 0) return { error: "This original sale has unsupported quantity or price details.", refundPaise: null };
  const value = quantity.trim();
  if (value.length > 32 || !/^(?:\d+(?:\.\d{0,6})?|\.\d{1,6})$/.test(value)) {
    return { error: "Enter a positive quantity with no more than 6 decimal places.", refundPaise: null };
  }
  const [whole = "", fraction = ""] = value.split(".");
  const significant = whole.replace(/^0+/, "") || "0";
  if (significant.length > 12) return { error: "Enter a smaller return quantity.", refundPaise: null };
  const units = BigInt(significant + fraction);
  if (units <= BigInt(0)) return { error: "Enter a quantity greater than zero.", refundPaise: null };
  const sold = sale.quantity.toString().split(".");
  const soldFraction = sold[1] ?? "";
  const scale = Math.max(fraction.length, soldFraction.length);
  const requestedUnits = units * BigInt(10) ** BigInt(scale - fraction.length);
  const soldUnits = BigInt(sold[0] + soldFraction) * BigInt(10) ** BigInt(scale - soldFraction.length);
  if (requestedUnits > soldUnits) return { error: "Return quantity cannot exceed the original quantity sold.", refundPaise: null };
  const recorded = previewTotal(value, mockRevenueDecimal(BigInt(sale.unitPricePaise)));
  const amount = recorded === null ? null : parseDemoMoney(recorded);
  if (amount === null) return { error: "This quantity produces less than one-paisa precision. Choose a quantity that gives an exact two-decimal amount.", refundPaise: null };
  return { originalAmountPaise: amount, returnedQuantity: value, refundPaise: null };
}
