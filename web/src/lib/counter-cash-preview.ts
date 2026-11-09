import { isDemoCalendarDate } from "@/lib/demo/admin-preview";
import { parseDemoMoney } from "@/lib/demo/money";

export type CounterCashSource = Readonly<{
  businessDate: string;
  complete: boolean;
  openingCashPaise: bigint | null;
  cashSalesPaise: bigint | null;
  cashRefundsPaise: bigint | null;
  counterExpensesPaise: bigint | null;
}>;

/** Only recorded cash flows for one day. Revenue is not proof of cash received. */
export function expectedCounterCash(source: CounterCashSource | null, businessDate: string): bigint | null {
  if (!source || !source.complete || !isDemoCalendarDate(businessDate) || source.businessDate !== businessDate) return null;
  const { openingCashPaise: opening, cashSalesPaise: sales, cashRefundsPaise: refunds, counterExpensesPaise: expenses } = source;
  if ([opening, sales, refunds, expenses].some((amount) => typeof amount !== "bigint" || amount < BigInt(0))) return null;
  return opening! + sales! - refunds! - expenses!;
}

export function inspectCounterCash(source: CounterCashSource | null, businessDate: string, actual: string) {
  const expectedPaise = expectedCounterCash(source, businessDate);
  const actualPaise = actual.trim() ? parseDemoMoney(actual) : null;
  return {
    expectedPaise, actualPaise,
    differencePaise: expectedPaise !== null && actualPaise !== null ? actualPaise - expectedPaise : null,
    error: actual.trim() && actualPaise === null ? "Enter zero or a positive PKR amount with no more than 2 decimal places." : undefined,
  };
}
