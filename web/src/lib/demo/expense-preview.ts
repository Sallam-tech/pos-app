import { demoExpenseTypes, isDemoCalendarDate, type DemoExpense } from "@/lib/demo/admin-preview";
import { parseDemoMoney } from "@/lib/demo/money";

export function currentKarachiBusinessDate(now = new Date()): { iso: string; label: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  const iso = part("year") + "-" + part("month") + "-" + part("day");
  return { iso, label: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", dateStyle: "long" }).format(now) };
}
export function validateExpenseEntry(date: string, type: string, amount: string) {
  const price = parseDemoMoney(amount);
  return {
    amountPaise: price,
    errors: {
      ...(!isDemoCalendarDate(date) ? { date: "Enter a valid expense date." } : {}),
      ...(!demoExpenseTypes.includes(type as typeof demoExpenseTypes[number]) ? { type: "Choose an expense type." } : {}),
      ...(price === null || price <= BigInt(0) ? { amount: "Enter a positive PKR amount with no more than 2 decimal places (up to 12 whole-number digits)." } : {}),
    },
  };
}
type ProfitPeriod = Readonly<{ from: string; to: string; grossProfitPaise: bigint | null }>;
/** Pure future-backend contract. Unknown/incomplete or different-period data never becomes net profit. */
export function netProfitAfterExpenses(
  gross: ProfitPeriod | null,
  expenses: Readonly<{ from: string; to: string; complete: boolean; entries: readonly DemoExpense[] | null }> | null,
): bigint | null {
  if (!gross || !expenses || !expenses.complete || expenses.entries === null || typeof gross.grossProfitPaise !== "bigint"
    || !isDemoCalendarDate(gross.from) || !isDemoCalendarDate(gross.to) || gross.from > gross.to
    || gross.from !== expenses.from || gross.to !== expenses.to) return null;
  if (expenses.entries.some((entry) => !isDemoCalendarDate(entry.date) || typeof entry.amountPaise !== "bigint" || entry.amountPaise <= BigInt(0)
    || !demoExpenseTypes.includes(entry.type))) return null;
  const inPeriod = expenses.entries.filter((entry) => entry.date >= gross.from && entry.date <= gross.to);
  if (new Set(inPeriod.map((entry) => entry.id)).size !== inPeriod.length) return null;
  return gross.grossProfitPaise - inPeriod.reduce((sum, entry) => sum + entry.amountPaise, BigInt(0));
}

/** Category-free operating-expense entry; legacy categorized records remain readable. */
export function validateSimpleExpenseEntry(amount: string, reason: string) {
  const price = parseDemoMoney(amount);
  return {
    amountPaise: price,
    errors: {
      ...(price === null || price <= BigInt(0) ? { amount: "Enter a positive PKR amount with no more than 2 decimal places (up to 12 whole-number digits)." } : {}),
      ...(!reason.trim() || reason.trim().length > 160 ? { reason: "Enter a short reason (up to 160 characters)." } : {}),
    },
  };
}
