"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { inspectCounterCash, type CounterCashSource } from "@/lib/counter-cash-preview";
import { formatDemoMoney } from "@/lib/demo/money";

/** Source stays null in the real demo: no recorded opening cash or cash-flow ledger. */
export function CounterCashSummary({ businessDate, source = null }: { businessDate: string; source?: CounterCashSource | null }) {
  const [actual, setActual] = useState("");
  const result = inspectCounterCash(source, businessDate, actual);
  const trusted = result.expectedPaise !== null;
  const rows = [
    ["Opening Cash", source?.openingCashPaise],
    ["Today's Cash Sales", source?.cashSalesPaise],
    ["Cash Refunds", source?.cashRefundsPaise],
    ["Shop Expenses Paid from Counter", source?.counterExpensesPaise],
    ["Expected Counter Cash", result.expectedPaise],
  ] as const;
  const difference = result.differencePaise;
  return <Card className="mt-5" role="region" aria-label="Counter Cash Summary">
    <h2 className="section-title">Counter Cash Summary</h2>
    <dl className="mt-4 grid gap-3 text-sm">
      {rows.map(([label, value], index) => <div key={label} className={"flex flex-wrap justify-between gap-x-4 gap-y-1 " + (index === 4 ? "border-t pt-3 font-bold" : "")}>
        <dt>{label}</dt><dd className="numeric font-semibold">{trusted && typeof value === "bigint" ? formatDemoMoney(value) : "Not available"}</dd>
      </div>)}
    </dl>
    <div className="mt-4 max-w-sm"><Field id="closing-actual-cash" label="Actual Cash Counted (Rs.)" error={result.error}>
      <Input id="closing-actual-cash" inputMode="decimal" autoComplete="off" maxLength={32} value={actual} placeholder="Enter counted cash"
        aria-invalid={Boolean(result.error) || undefined} aria-describedby={result.error ? "closing-actual-cash-error counter-cash-note" : "counter-cash-note"}
        onChange={(event) => setActual(event.target.value)} />
    </Field></div>
    <div className="mt-4 flex flex-wrap justify-between gap-2 border-t pt-3 text-sm">
      <span className="font-semibold">Cash Difference</span>
      <output aria-label="Cash Difference" aria-live="polite" className={"numeric font-bold " + (difference === null ? "text-muted-foreground" : difference < BigInt(0) ? "text-danger" : "text-success")}>
        {difference === null ? "Not available" : difference === BigInt(0) ? "Cash matches" : difference < BigInt(0) ? "Short by " + formatDemoMoney(-difference) : "Extra " + formatDemoMoney(difference)}
      </output>
    </div>
    <p id="counter-cash-note" className="mt-3 text-xs leading-5 text-muted-foreground">{trusted ? "Preview only. A cash difference is not recorded as an expense." : "Opening cash and complete cash records are not recorded in this demo. Expected cash and the difference are not available."}</p>
  </Card>;
}
