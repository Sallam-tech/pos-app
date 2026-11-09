import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { AdminExpensesPreview } from "@/components/demo/admin-expenses-preview";
import { currentKarachiBusinessDate, netProfitAfterExpenses, validateExpenseEntry, validateSimpleExpenseEntry } from "@/lib/demo/expense-preview";
import { demoExpenseTotals, type DemoExpense } from "@/lib/demo/admin-preview";
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
const date = { iso: "2026-11-08", label: "8 November 2026" };
const summary = () => screen.getByRole("dialog", { name: "Expense Summary" });
const entry = (id: number, date: string, amount: bigint): DemoExpense => ({ id, date, amountPaise: amount, type: "Rent", description: "" });
it("uses Karachi civil dates at UTC boundaries rather than the fictional sale day", () => {
  expect(currentKarachiBusinessDate(new Date("2026-11-07T18:59:59Z")).iso).toBe("2026-11-07");
  expect(currentKarachiBusinessDate(new Date("2026-11-07T19:00:00Z")).iso).toBe("2026-11-08");
  expect(currentKarachiBusinessDate(new Date("2026-12-31T19:00:00Z")).iso).toBe("2027-01-01");
});
it.each(["0", "-1", "", "0.001", "1e3", "100.999", "1000000000000"])("rejects invalid/zero/excessive expense %j without changing sales price rules", (value) => {
  expect(validateExpenseEntry(date.iso, "Rent", value).errors.amount).toBeTruthy();
});
it.each(["0.01", "100", "100.50", "1,250.25", "999999999999.99"])("accepts a positive exact expense %s", (value) => {
  expect(validateExpenseEntry(date.iso, "Rent", value).errors).toEqual({});
});
it("validates required date/category and leap days", () => {
  expect(validateExpenseEntry("2026-02-29", "Rent", "1").errors.date).toBeTruthy();
  expect(validateExpenseEntry("", "", "1").errors).toMatchObject({ date: expect.any(String), type: expect.any(String) });
  expect(validateExpenseEntry("2024-02-29", "Electricity", "1").errors).toEqual({});
});
it("guards duplicate submissions, resets fields and keeps summaries/history out of the main form", () => {
  render(<AdminExpensesPreview businessDate={date} />);
  expect(screen.queryByRole("table")).toBeNull(); expect(screen.queryByText("Daily Expenses")).toBeNull();
  expect(screen.getByRole("heading", { name: "Add Expense" })).toBeVisible();
  fireEvent.change(screen.getByLabelText("Amount (Rs.)"), { target: { value: "100.10" } });
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Cleaning supplies" } });
  expect(screen.queryByLabelText("Expense Type")).toBeNull();
  const form = screen.getByRole("form", { name: "Demo expense entry" });
  fireEvent.submit(form); fireEvent.submit(form);
  expect(screen.getByRole("status")).toHaveTextContent("Expense added to demo."); expect(screen.getByLabelText("Amount (Rs.)")).toHaveValue("");
  expect(screen.queryByRole("table")).toBeNull();
  const button = screen.getByRole("button", { name: "View Expense Summary" }); button.focus(); fireEvent.click(button);
  expect(within(summary()).getAllByRole("row")).toHaveLength(2);
  expect(within(summary()).getByText("Daily Expenses").nextElementSibling).toHaveTextContent("Rs. 100.10");
  fireEvent.click(within(summary()).getByRole("button", { name: "Done" })); expect(button).toHaveFocus();
});
it("keeps daily and monthly totals separate, returns an honest empty state and never exposes profit", () => {
  const entries = [entry(1, "2026-11-08", BigInt(10)), entry(2, "2026-11-09", BigInt(20)), entry(3, "2026-12-08", BigInt(100))];
  expect(demoExpenseTotals(entries, "2026-11-08")).toEqual({ daily: BigInt(10), monthly: BigInt(30) });
  render(<AdminExpensesPreview businessDate={date} />); fireEvent.click(screen.getByRole("button", { name: "View Expense Summary" }));
  expect(within(summary()).getByText("No expenses recorded for this date.")).toBeVisible();
  expect(summary()).toHaveTextContent("Nothing is saved or synchronized with Admin.");
  expect(summary()).not.toHaveTextContent(/Gross Profit|COGS|Net Profit:|purchase cost/i);
  fireEvent.change(within(summary()).getByLabelText("Selected Date"), { target: { value: "" } });
  expect(within(summary()).getAllByText("Not available")).toHaveLength(2);
});
it("calculates same-period net profit once from exact recorded operating expenses", () => {
  const gross = { from: "2026-11-08", to: "2026-11-08", grossProfitPaise: BigInt(300000) };
  const expense = { from: gross.from, to: gross.to, complete: true, entries: [entry(1, gross.from, BigInt(50000))] };
  expect(netProfitAfterExpenses(gross, expense)).toBe(BigInt(250000));
  expect(gross.grossProfitPaise).toBe(BigInt(300000));
  expect(netProfitAfterExpenses(gross, { ...expense, entries: [...expense.entries, entry(2, "2026-11-09", BigInt(20000))] })).toBe(BigInt(250000));
  expect(netProfitAfterExpenses({ ...gross, grossProfitPaise: BigInt(10000) }, expense)).toBe(BigInt(-40000));
});
it("never mixes the historical gross profit day with current expenses or assumes missing data is zero", () => {
  const gross = { from: "2026-11-02", to: "2026-11-02", grossProfitPaise: BigInt(514000) };
  const expenses = { from: "2026-11-08", to: "2026-11-08", complete: true, entries: [entry(1, "2026-11-08", BigInt(50000))] };
  expect(netProfitAfterExpenses(gross, expenses)).toBeNull();
  const matched = { ...expenses, from: gross.from, to: gross.to, entries: [entry(1, gross.from, BigInt(50000))] };
  expect(netProfitAfterExpenses(gross, { ...matched, complete: false })).toBeNull();
  expect(netProfitAfterExpenses(gross, { ...matched, entries: null })).toBeNull();
  expect(netProfitAfterExpenses(null, matched)).toBeNull();
  expect(netProfitAfterExpenses(gross, { ...matched, entries: [...matched.entries, ...matched.entries] })).toBeNull();
  expect(netProfitAfterExpenses(gross, { ...matched, entries: [] })).toBe(BigInt(514000));
});

it("requires a short reason without categories and rejects nonfinite amounts", () => {
  for (const amount of ["NaN", "Infinity", "-1", "0", "1e3", "100.999"]) expect(validateSimpleExpenseEntry(amount, "Cleaning").errors.amount).toBeTruthy();
  for (const reason of ["", "  ", "x".repeat(161)]) expect(validateSimpleExpenseEntry("1", reason).errors.reason).toBeTruthy();
  expect(validateSimpleExpenseEntry("0.01", "Cleaning").errors).toEqual({});
});
it("validates and focuses Reason after a valid amount, then clears both fields", () => {
  render(<AdminExpensesPreview businessDate={date} />);
  const reason = screen.getByLabelText("Reason");
  fireEvent.change(screen.getByLabelText("Amount (Rs.)"), { target: { value: "1.25" } });
  fireEvent.click(screen.getByRole("button", { name: "Add Expense" }));
  expect(reason).toHaveFocus(); expect(screen.getByRole("alert")).toHaveTextContent("short reason");
  fireEvent.change(reason, { target: { value: "Counter cleaning" } });
  fireEvent.click(screen.getByRole("button", { name: "Add Expense" }));
  expect(reason).toHaveValue(""); expect(screen.getByLabelText("Amount (Rs.)")).toHaveValue("");
  expect(screen.queryByLabelText("Expense Date")).toBeNull();
});
