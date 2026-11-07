import { getFictionalProfitSales } from "./mock-historical-costs";
import { calculateMockProfitTotals } from "./mock-profit";
import { selectMockSalesPeriod } from "./mock-sales-report";
import { getAdminExpenseReviewEntries, reviewExpenses } from "./expense-review-preview";

/** Read-only demo review. This helper cannot close, reset or mutate a business day. */
export function getDailyClosingPreview(businessDate: string) {
  const selected = selectMockSalesPeriod(getFictionalProfitSales(), { kind: "custom", from: businessDate, to: businessDate });
  const totals = selected.error ? null : calculateMockProfitTotals(selected.sales);
  const expenses = reviewExpenses(getAdminExpenseReviewEntries(), businessDate);
  return {
    error: selected.error ? "Choose a valid business date." : undefined,
    revenuePaise: totals?.revenuePaise ?? null,
    costOfGoodsSoldPaise: totals?.costOfGoodsSoldPaise ?? null,
    grossProfitPaise: totals?.grossProfitPaise ?? null,
    expensesPaise: selected.error ? null : expenses.daily,
    // No recorded return/refund ledger exists. Do not infer net profit or zeros.
    refundsPaise: null,
    profitAfterExpensesPaise: null,
  };
}
