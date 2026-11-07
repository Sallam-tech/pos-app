import { demoExpenseTotals, demoExpenseTypes, isDemoCalendarDate, type DemoExpense } from "@/lib/demo/admin-preview";

/** No recorded/shared expense source exists. Salesperson entries remain page-local. */
export function getAdminExpenseReviewEntries(): readonly DemoExpense[] | null { return null; }

export function reviewExpenses(entries: readonly DemoExpense[] | null, businessDay: string) {
  const empty = { daily: null, monthly: null, entries: [] } as const;
  if (!isDemoCalendarDate(businessDay)) return { ...empty, error: "Choose a valid business day.", unavailable: entries === null };
  if (entries === null) return { ...empty, error: undefined, unavailable: true };
  // Preserve the existing entry contract. Never display partial totals for invalid source data.
  if (entries.some((entry) => !isDemoCalendarDate(entry.date) || typeof entry.amountPaise !== "bigint" || entry.amountPaise < BigInt(0)
    || !demoExpenseTypes.includes(entry.type) || typeof entry.description !== "string")) {
    return { ...empty, error: "Expense data is invalid. Totals are unavailable.", unavailable: false };
  }
  return { ...demoExpenseTotals(entries, businessDay), entries: entries.filter((entry) => entry.date === businessDay), error: undefined, unavailable: false };
}
