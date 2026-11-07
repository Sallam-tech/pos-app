"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { reviewExpenses } from "@/lib/admin/expense-review-preview";
import type { DemoExpense } from "@/lib/demo/admin-preview";
import { formatDemoMoney } from "@/lib/demo/money";
import { formatMockBusinessDate } from "@/lib/admin/mock-sales-report";

export function ExpenseReviewPreview({ entries, initialBusinessDay }: { entries: readonly DemoExpense[] | null; initialBusinessDay: string }) {
  const [businessDay, setBusinessDay] = useState(initialBusinessDay);
  const review = reviewExpenses(entries, businessDay);
  return <section aria-label="Admin expense review">
    <div className="filter-toolbar">
      <div className="w-full sm:w-56">
        <label htmlFor="admin-expense-day" className="mb-2 block text-sm font-semibold">Business day</label>
        <Input id="admin-expense-day" type="date" value={businessDay} onChange={(event) => setBusinessDay(event.target.value)}
          aria-invalid={Boolean(review.error) || undefined} aria-describedby={review.error ? "admin-expense-error" : "admin-expense-day-label"} />
      </div>
      <p id="admin-expense-day-label" className="pb-3 text-sm text-muted-foreground">Demo business day: {formatMockBusinessDate(businessDay)}</p>
    </div>
    {review.error && <p id="admin-expense-error" role="alert" className="mt-3 text-sm text-danger">{review.error}</p>}
    {review.unavailable && <p className="mt-4 text-sm leading-6 text-muted-foreground">Salesperson expenses are temporary and page-local. They clear on leave or reload and are not saved or shared with Admin.</p>}
    <dl aria-label="Expense review totals" className="report-totals my-4">
      <div><dt className="text-sm text-muted-foreground">Daily total</dt><dd className="numeric mt-2 text-2xl font-bold">{review.daily === null ? "Unavailable" : formatDemoMoney(review.daily)}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Monthly total</dt><dd className="numeric mt-2 text-2xl font-bold">{review.monthly === null ? "Unavailable" : formatDemoMoney(review.monthly)}</dd></div>
    </dl>
    <TableRegion label="Expense details">
      <Table className="min-w-[28rem]">
        <caption className="sr-only">Read-only expense details for the selected business day</caption>
        <thead><tr><TableHead>Expense date</TableHead><TableHead>Expense name / reason</TableHead><TableHead className="text-right">Amount (Rs.)</TableHead></tr></thead>
        <tbody>{review.entries.length > 0 ? review.entries.map((entry) => <tr key={entry.id}>
          <TableCell><time dateTime={entry.date}>{formatMockBusinessDate(entry.date)}</time></TableCell>
          <TableCell className="max-w-md break-words"><span className="font-medium">{entry.description || entry.type}</span>{entry.description && <span className="mt-1 block text-sm text-muted-foreground">{entry.type}</span>}</TableCell>
          <TableCell className="numeric whitespace-nowrap text-right">{formatDemoMoney(entry.amountPaise)}</TableCell>
        </tr>) : <tr><TableCell colSpan={3} className="text-muted-foreground">{review.error ? "Choose a valid day and valid expense data to view details." : review.unavailable ? "No recorded expense data is available to this Admin preview." : "No expenses recorded for this business day."}</TableCell></tr>}</tbody>
      </Table>
    </TableRegion>
    <p className="mt-3 text-sm text-muted-foreground">Review only. Expenses are not deducted from gross profit.</p>
  </section>;
}
