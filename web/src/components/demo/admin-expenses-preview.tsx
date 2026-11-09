"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { WorkspacePage } from "@/components/shell/workspace-page";
import { demoExpenseTotals, isDemoCalendarDate, type DemoExpense } from "@/lib/demo/admin-preview";
import { demoMoneyDecimal, formatDemoMoney } from "@/lib/demo/money";
import { currentKarachiBusinessDate, validateSimpleExpenseEntry } from "@/lib/demo/expense-preview";

const subscribe = () => () => {};
type BusinessDate = { iso: string; label: string };
export function AdminExpensesPreview({ businessDate }: { businessDate?: BusinessDate }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  if (!ready && !businessDate) return <p role="status" className="text-sm text-muted-foreground">Loading expense form…</p>;
  return <ExpenseSession businessDate={businessDate} />;
}
function ExpenseSession({ businessDate }: { businessDate?: BusinessDate }) {
  const [today, setToday] = useState(() => businessDate ?? currentKarachiBusinessDate());
  const [entries, setEntries] = useState<DemoExpense[]>([]);
  const [summaryDate, setSummaryDate] = useState(today.iso);
  const [description, setDescription] = useState(""), [amount, setAmount] = useState("");
  const [editing, setEditing] = useState<DemoExpense | null>(null);
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});
  const [message, setMessage] = useState(""), [summaryOpen, setSummaryOpen] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null), reasonRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1), submitting = useRef(false);
  const totals = demoExpenseTotals(entries, summaryDate);
  const dailyEntries = entries.filter((entry) => entry.date === summaryDate);
  useEffect(() => {
    if (businessDate) return;
    const timer = setInterval(() => setToday(currentKarachiBusinessDate()), 60_000);
    return () => clearInterval(timer);
  }, [businessDate]);
  useEffect(() => { if (!summaryOpen && editing !== null) amountRef.current?.focus(); }, [summaryOpen, editing]);
  function clearForm() { setDescription(""); setAmount(""); setEditing(null); setErrors({}); }
  function changed() { submitting.current = false; setMessage(""); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return;
    const { amountPaise, errors: next } = validateSimpleExpenseEntry(amount, description);
    setErrors(next); setMessage("");
    if (Object.keys(next).length || amountPaise === null) {
      (next.amount ? amountRef : reasonRef).current?.focus(); return;
    }
    submitting.current = true;
    // Refresh at submission too: an idle form can cross Karachi midnight.
    const recordedDay = businessDate ?? currentKarachiBusinessDate(); setToday(recordedDay);
    // "Other" preserves the legacy typed contract, not a category selection.
    const entry: DemoExpense = { id: editing?.id ?? nextId.current++, date: editing?.date ?? recordedDay.iso,
      type: editing?.type ?? "Other", description: description.trim(), amountPaise };
    setEntries((previous) => editing === null ? [...previous, entry] : previous.map((item) => item.id === editing.id ? entry : item));
    setSummaryDate(entry.date);
    setMessage(editing === null ? "Expense added to demo." : "Expense updated in demo.");
    clearForm(); amountRef.current?.focus();
  }
  function edit(entry: DemoExpense) {
    submitting.current = false; setEditing(entry); setDescription(entry.description);
    setAmount(demoMoneyDecimal(entry.amountPaise)); setErrors({}); setMessage(""); setSummaryOpen(false);
  }
  function reset() {
    submitting.current = false; setEntries([]); setSummaryDate(today.iso); clearForm();
    setMessage("Demo expenses reset. No shop records were changed.");
  }
  return <WorkspacePage route="/pos/expenses" title="Shop Expenses"
    action={<Button variant="outline" size="sm" className="border-primary text-primary" onClick={() => setSummaryOpen(true)}>View Expense Summary</Button>}>
    <Card className="mx-auto w-full max-w-3xl p-4 sm:p-5">
      <h2 className="text-lg font-bold">{editing === null ? "Add Expense" : "Correct Expense"}</h2>
      <p className="mb-4 mt-1 text-xs leading-5 text-muted-foreground">Temporary demo only. Entries clear when you leave or reload; not shared with Admin.</p>
      <form data-unsaved-changes={entries.length > 0 || amount !== "" || description !== "" || editing !== null}
        noValidate onSubmit={submit} onKeyDown={(event) => { if (event.key === "Enter" && event.repeat) event.preventDefault(); }}
        className="grid gap-4" aria-label="Demo expense entry">
        <Field id="expense-amount" label="Amount (Rs.)" error={errors.amount}>
          <Input ref={amountRef} id="expense-amount" required inputMode="decimal" value={amount} maxLength={32} autoComplete="off"
            onChange={(event) => { changed(); setAmount(event.target.value); }} aria-invalid={Boolean(errors.amount) || undefined} aria-describedby={errors.amount ? "expense-amount-error" : undefined} />
        </Field>
        <Field id="expense-description" label="Reason" error={errors.reason}>
          <Input ref={reasonRef} id="expense-description" required value={description} placeholder="What was the money spent on?" maxLength={160} autoComplete="off"
            onChange={(event) => { changed(); setDescription(event.target.value); }} aria-invalid={Boolean(errors.reason) || undefined} aria-describedby={errors.reason ? "expense-description-error" : undefined} />
        </Field>
        <p className="text-sm text-muted-foreground">Date: {editing ? "Original entry" : "Today (automatic)"} — <time dateTime={editing?.date ?? today.iso}>{editing?.date ?? today.label}</time> <span className="text-xs">(Asia/Karachi)</span></p>
        <div className="flex flex-wrap gap-3 border-t pt-4">
          <Button type="submit">{editing === null ? "Add Expense" : "Update Expense"}</Button>
          {editing !== null && <Button variant="outline" onClick={() => { submitting.current = false; clearForm(); amountRef.current?.focus(); }}>Cancel Correction</Button>}
        </div>
      </form>
      {!summaryOpen && <p role="status" className="mt-3 text-sm text-success">{message}</p>}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Operating shop expenses reduce net profit. Purchases and personal withdrawals are separate. This demo does not update reported profit.</p>
    </Card>
    {summaryOpen && <Dialog open onOpenChange={setSummaryOpen} title="Expense Summary"
      description="Temporary demo entries only. Nothing is saved or synchronized with Admin.">
      <Field id="expense-summary-date" label="Selected Date" error={isDemoCalendarDate(summaryDate) ? undefined : "Choose a valid date to show the totals."}>
        <Input id="expense-summary-date" type="date" value={summaryDate} onChange={(event) => setSummaryDate(event.target.value)}
          aria-invalid={!isDemoCalendarDate(summaryDate) || undefined} aria-describedby={!isDemoCalendarDate(summaryDate) ? "expense-summary-date-error" : undefined} />
      </Field>
      <dl className="my-4 grid gap-3 rounded-md border bg-muted/40 p-3 sm:grid-cols-2" aria-live="polite">
        <div><dt className="text-sm text-muted-foreground">Daily Expenses</dt><dd className="numeric mt-1 text-xl font-bold">{totals.daily === null ? "Not available" : formatDemoMoney(totals.daily)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Monthly Expenses</dt><dd className="numeric mt-1 text-xl font-bold">{totals.monthly === null ? "Not available" : formatDemoMoney(totals.monthly)}</dd></div>
      </dl>
      {dailyEntries.length ? <TableRegion label="Temporary demo expenses">
        <Table className="min-w-[26rem]"><caption className="sr-only">Temporary demo expenses, not saved shop records</caption>
          <thead><tr><TableHead>Date</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Action</TableHead></tr></thead>
          <tbody>{dailyEntries.map((entry) => <tr key={entry.id}>
            <TableCell><time dateTime={entry.date}>{entry.date}</time></TableCell>
            <TableCell className="max-w-xs break-words">{entry.description}</TableCell>
            <TableCell className="numeric whitespace-nowrap text-right font-semibold">{formatDemoMoney(entry.amountPaise)}</TableCell>
            <TableCell><div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" aria-label={"Correct expense: " + entry.description} onClick={() => edit(entry)}>Correct</Button>
              <Button variant="outline" size="sm" aria-label={"Remove expense: " + entry.description} onClick={() => { setEntries((previous) => previous.filter((item) => item.id !== entry.id)); if (editing?.id === entry.id) clearForm(); setMessage("Removed from this temporary demo only."); }}>Remove</Button>
            </div></TableCell>
          </tr>)}</tbody>
        </Table>
      </TableRegion> : isDemoCalendarDate(summaryDate) && <p className="rounded-md border p-3 text-sm">No expenses recorded for this date.</p>}
      <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>
      <div className="mt-4 flex flex-wrap gap-3 border-t pt-4"><Button onClick={() => setSummaryOpen(false)}>Done</Button><Button variant="outline" onClick={reset}>Reset Demo Expenses</Button></div>
    </Dialog>}
  </WorkspacePage>;
}
