"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { WorkspacePage } from "@/components/shell/workspace-page";
import { demoExpenseTotals, demoExpenseTypes, isDemoCalendarDate, type DemoExpense, type DemoExpenseType } from "@/lib/demo/admin-preview";
import { demoMoneyDecimal, formatDemoMoney } from "@/lib/demo/money";
import { currentKarachiBusinessDate, validateExpenseEntry } from "@/lib/demo/expense-preview";

const subscribe = () => () => {};
/** Client date is chosen at entry, never the fixed historical sale day or build-time date. */
export function AdminExpensesPreview({ businessDate }: { businessDate?: { iso: string; label: string } }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  if (!ready && !businessDate) return <p role="status" className="text-sm text-muted-foreground">Loading expense form…</p>;
  return <ExpenseSession businessDate={businessDate ?? currentKarachiBusinessDate()} />;
}
function ExpenseSession({ businessDate }: { businessDate: { iso: string; label: string } }) {
  const [entries, setEntries] = useState<DemoExpense[]>([]);
  const [date, setDate] = useState(businessDate.iso), [summaryDate, setSummaryDate] = useState(businessDate.iso);
  const [type, setType] = useState<DemoExpenseType>("Rent");
  const [description, setDescription] = useState(""), [amount, setAmount] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ date?: string; type?: string; amount?: string }>({});
  const [message, setMessage] = useState(""), [summaryOpen, setSummaryOpen] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null), amountRef = useRef<HTMLInputElement>(null), typeRef = useRef<HTMLSelectElement>(null);
  const nextId = useRef(1), submitting = useRef(false);
  const totals = demoExpenseTotals(entries, summaryDate);
  const dailyEntries = entries.filter((entry) => entry.date === summaryDate);
  useEffect(() => { if (!summaryOpen && editingId !== null) dateRef.current?.focus(); }, [summaryOpen, editingId]);
  function clearForm() { setDate(businessDate.iso); setType("Rent"); setDescription(""); setAmount(""); setEditingId(null); setErrors({}); }
  function changed() { submitting.current = false; setMessage(""); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return;
    const { amountPaise, errors: next } = validateExpenseEntry(date, type, amount);
    setErrors(next); setMessage("");
    if (Object.keys(next).length || amountPaise === null) {
      if (next.date) dateRef.current?.focus(); else if (next.type) typeRef.current?.focus(); else amountRef.current?.focus(); return;
    }
    submitting.current = true;
    const entry: DemoExpense = { id: editingId ?? nextId.current++, date, type, description: description.trim(), amountPaise };
    setEntries((previous) => editingId === null ? [...previous, entry] : previous.map((item) => item.id === editingId ? entry : item));
    setSummaryDate(date);
    setMessage(editingId === null ? "Expense added to demo." : "Expense updated in demo.");
    clearForm(); dateRef.current?.focus();
  }
  function edit(entry: DemoExpense) {
    submitting.current = false; setEditingId(entry.id); setDate(entry.date); setType(entry.type); setDescription(entry.description);
    setAmount(demoMoneyDecimal(entry.amountPaise)); setErrors({}); setMessage(""); setSummaryOpen(false);
  }
  function reset() {
    submitting.current = false; setEntries([]); setSummaryDate(businessDate.iso); clearForm();
    setMessage("Demo expenses reset. No shop records were changed.");
  }
  return <WorkspacePage route="/pos/expenses" title="Shop Expenses"
    action={<Button variant="outline" size="sm" className="border-primary text-primary" onClick={() => setSummaryOpen(true)}>View Expense Summary</Button>}>
    <Card className="mx-auto w-full max-w-3xl p-4 sm:p-5">
      <h2 className="text-lg font-bold">{editingId === null ? "Add Expense" : "Correct Expense"}</h2>
      <p className="mb-4 mt-1 text-xs leading-5 text-muted-foreground">Temporary demo only. Entries clear when you leave or reload; not shared with Admin.</p>
      <form data-unsaved-changes={entries.length > 0 || amount !== "" || description !== "" || date !== businessDate.iso || type !== "Rent" || editingId !== null}
        noValidate onSubmit={submit} onKeyDown={(event) => { if (event.key === "Enter" && event.repeat) event.preventDefault(); }}
        className="grid gap-4" aria-label="Demo expense entry">
        <Field id="expense-date" label="Expense Date" error={errors.date}>
          <Input ref={dateRef} id="expense-date" type="date" required value={date} onChange={(event) => { changed(); setDate(event.target.value); }}
            aria-invalid={Boolean(errors.date) || undefined} aria-describedby={errors.date ? "expense-date-error" : "expense-date-note"} />
        </Field>
        <p id="expense-date-note" className="-mt-2 text-xs text-muted-foreground">Business date in Asia/Karachi.</p>
        <Field id="expense-type" label="Expense Type" error={errors.type}>
          <Select ref={typeRef} id="expense-type" required value={type} onChange={(event) => { changed(); setType(event.target.value as DemoExpenseType); }}
            aria-invalid={Boolean(errors.type) || undefined} aria-describedby={errors.type ? "expense-type-error" : undefined}>
            {demoExpenseTypes.map((option) => <option key={option}>{option}</option>)}
          </Select>
        </Field>
        <Field id="expense-amount" label="Amount (Rs.)" error={errors.amount}>
          <Input ref={amountRef} id="expense-amount" required inputMode="decimal" value={amount} maxLength={32} autoComplete="off"
            onChange={(event) => { changed(); setAmount(event.target.value); }} aria-invalid={Boolean(errors.amount) || undefined} aria-describedby={errors.amount ? "expense-amount-error" : undefined} />
        </Field>
        <Field id="expense-description" label="Note (optional)">
          <Input id="expense-description" value={description} maxLength={160} autoComplete="off" onChange={(event) => { changed(); setDescription(event.target.value); }} />
        </Field>
        <div className="flex flex-wrap gap-3 border-t pt-4">
          <Button type="submit">{editingId === null ? "Add Expense" : "Update Expense"}</Button>
          {editingId !== null && <Button variant="outline" onClick={() => { submitting.current = false; clearForm(); dateRef.current?.focus(); }}>Cancel Correction</Button>}
        </div>
      </form>
      {!summaryOpen && <p role="status" className="mt-3 text-sm text-success">{message}</p>}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Recorded shop expenses reduce net profit. This temporary demo does not update reported profit.</p>
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
      <p className="mb-3 text-xs leading-5 text-muted-foreground">Daily total and entries for the selected date. Monthly total covers its calendar month.</p>
      {dailyEntries.length ? <TableRegion label="Temporary demo expenses">
        <Table className="min-w-[28rem]"><caption className="sr-only">Temporary demo expenses, not saved shop records</caption>
          <thead><tr><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Note</TableHead></tr></thead>
          <tbody>{dailyEntries.map((entry) => <tr key={entry.id}>
            <TableCell><time dateTime={entry.date}>{entry.date}</time></TableCell><TableCell>{entry.type}</TableCell>
            <TableCell className="numeric whitespace-nowrap text-right font-semibold">{formatDemoMoney(entry.amountPaise)}</TableCell>
            <TableCell className="max-w-xs break-words">{entry.description || "—"}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" aria-label={"Correct " + entry.type + " expense on " + entry.date} onClick={() => edit(entry)}>Correct</Button>
                <Button variant="outline" size="sm" aria-label={"Remove " + entry.type + " expense on " + entry.date} onClick={() => { setEntries((previous) => previous.filter((item) => item.id !== entry.id)); if (editingId === entry.id) clearForm(); setMessage("Removed from this temporary demo only."); }}>Remove</Button>
              </div>
            </TableCell>
          </tr>)}</tbody>
        </Table>
      </TableRegion> : isDemoCalendarDate(summaryDate) && <p className="rounded-md border p-3 text-sm">No expenses recorded for this date.</p>}
      <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>
      <div className="mt-4 flex flex-wrap gap-3 border-t pt-4"><Button onClick={() => setSummaryOpen(false)}>Done</Button><Button variant="outline" onClick={reset}>Reset Demo Expenses</Button></div>
    </Dialog>}
  </WorkspacePage>;
}
