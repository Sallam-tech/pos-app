"use client";

import { PageHeading } from "@/components/shell/page-heading";
import { CounterCashSummary } from "./counter-cash-summary";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getDailyClosingPreview } from "@/lib/admin/daily-closing-preview";
import { mockSalesBusinessDate } from "@/lib/admin/mock-sales";
import { formatMockBusinessDate } from "@/lib/admin/mock-sales-report";
import { formatProfitMoney } from "@/lib/admin/mock-profit";

export function DailyClosingPreview() {
  const [date, setDate] = useState<string>(mockSalesBusinessDate.iso);
  const closing = getDailyClosingPreview(date);
  const metrics = [
    ["Total Sales", closing.revenuePaise],
    ["Cost of Sold Items", closing.costOfGoodsSoldPaise],
    ["Gross Profit", closing.grossProfitPaise],
    ["Shop Expenses", closing.expensesPaise],
    ["Returns / Refunds", closing.refundsPaise],
    ["Profit After Expenses", closing.profitAfterExpensesPaise],
  ] as const;
  return <div className="mx-auto w-full max-w-5xl">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex flex-wrap items-center gap-3"><PageHeading route={"/admin/daily-closing"}>Daily Closing</PageHeading><Badge>Demo Data</Badge></div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Review a business day. This preview cannot close or reset your shop.</p></div>
    </div>
    <Card className="mb-5">
      <div className="max-w-xs"><Field id="closing-business-date" label="Business Date (Asia/Karachi)" error={closing.error}>
        <Input id="closing-business-date" type="date" value={date} aria-invalid={Boolean(closing.error) || undefined}
          aria-describedby={closing.error ? "closing-business-date-error closing-date-note" : "closing-date-note"} onChange={(event) => setDate(event.target.value)} />
      </Field></div>
      <p id="closing-date-note" className="mt-3 text-sm leading-6 text-muted-foreground">Demo records use {mockSalesBusinessDate.label}. This is an example business day, not the shop’s current day.</p>
      <p className="mt-1 text-sm font-semibold">Selected day: {formatMockBusinessDate(date)}</p>
    </Card>
    <section aria-label="Daily closing summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {metrics.map(([label, amount]) => <Card key={label} role="group" aria-label={label} className="p-4 sm:p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">{label}</h2><p className="numeric mt-2 break-words text-2xl font-bold">{formatProfitMoney(amount)}</p>
      </Card>)}
    </section>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Buying costs are fictional examples for the original demo sales. Saved expenses and returns are incomplete, so Profit After Expenses is not available.</p>
    <CounterCashSummary key={date} businessDate={date} />
    <Card className="mt-5">
      <h2 className="section-title">Closing is not available yet</h2>
      <p id="closing-backend-note" className="mt-2 text-sm leading-6 text-muted-foreground">A secure local database must save and confirm the closing record first. Nothing is deleted, reset or closed here.</p>
      <Button className="mt-4" disabled aria-describedby="closing-backend-note">Confirm Closing — setup required</Button>
    </Card>
  </div>;
}
