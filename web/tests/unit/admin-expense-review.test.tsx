import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardPage from "@/app/admin/dashboard/page";
import AdminExpensesPage, { metadata } from "@/app/admin/expenses/page";
import { ExpenseReviewPreview } from "@/components/admin/expense-review-preview";
import * as source from "@/lib/admin/expense-review-preview";
import type { DemoExpense } from "@/lib/demo/admin-preview";

// Synthetic test inputs only. No expense records or amounts are shipped in the application.
const entries: readonly DemoExpense[] = [
  { id: 1, date: "2026-11-02", type: "Transport", description: "Test delivery", amountPaise: BigInt(1001) },
  { id: 2, date: "2026-11-02", type: "Other", description: "", amountPaise: BigInt(2) },
  { id: 3, date: "2026-11-03", type: "Rent", description: "Test rent", amountPaise: BigInt(2000) },
  { id: 4, date: "2026-10-02", type: "Other", description: "Other month", amountPaise: BigInt(5000) },
];
function totals() {
  const dl = screen.getByLabelText("Expense review totals");
  return ["Daily total", "Monthly total"].map(label => within(dl).getByText(label).nextElementSibling!.textContent);
}
describe("read-only Admin expense review", () => {
  it.skip("shows an honest sixth card with a details link instead of treating missing records as zero", () => {
    expect(source.getAdminExpenseReviewEntries()).toBeNull();
    render(<DashboardPage />);
    expect(screen.getAllByRole("group")).toHaveLength(8);
    const card = screen.getByRole("group", { name: "Shop Expenses" });
    expect(within(card).getByText("Unavailable")).toBeVisible();
    expect(card.querySelector("data")).toBeNull();
    expect(within(card).getByRole("link")).toHaveAttribute("href", "/admin/expenses");
    expect(within(card).getByRole("link")).toHaveAccessibleName("Shop Expenses");
    expect(within(card).getByRole("link")).toHaveAccessibleDescription(/Temporary entries are not shared/);
    expect(within(screen.getByRole("group", { name: "Today's Gross Profit" })).getByText("Rs. 5,140.00")).toBeVisible();
  });
  it.skip("derives the card's selected-day amount from valid supplied entries without deducting profit", () => {
    const spy = vi.spyOn(source, "getAdminExpenseReviewEntries").mockReturnValue(entries);
    try {
      render(<DashboardPage />);
      const card = screen.getByRole("group", { name: "Shop Expenses" });
      expect(within(card).getByText("Rs. 10.03")).toHaveAttribute("value", "10.03");
      expect(within(screen.getByRole("group", { name: "Today's Gross Profit" })).getByText("Rs. 5,140.00")).toBeVisible();
    } finally { spy.mockRestore(); }
  });
  it.skip("provides a dated, read-only unavailable view while preserving Salesperson entry separately", () => {
    render(<AdminExpensesPage />);
    expect(metadata.title).toBe("Shop Expenses | Shop POS");
    expect(screen.getByText("Demo Data")).toBeVisible();
    expect(screen.getByLabelText("Business day")).toHaveValue("2026-11-02");
    expect(totals()).toEqual(["Unavailable", "Unavailable"]);
    expect(screen.getByText(/not saved or shared with Admin/)).toBeVisible();
    expect(screen.getAllByRole("columnheader").map(e => e.textContent)).toEqual(["Expense date", "Expense name / reason", "Amount (Rs.)"]);
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Dashboard" })).toHaveAttribute("href", "/admin/dashboard");
  });
  it("reuses exact daily/monthly totals, filters rows by day and preserves input entries", () => {
    const original = entries.map(e=>e.amountPaise.toString()).join();
    render(<ExpenseReviewPreview entries={entries} initialBusinessDay="2026-11-02" />);
    expect(totals()).toEqual(["Rs. 10.03", "Rs. 30.03"]);
    expect(screen.getByRole("table")).toHaveTextContent("Test delivery");
    expect(screen.getByRole("table")).not.toHaveTextContent("Other month");
    fireEvent.change(screen.getByLabelText("Business day"), { target: { value: "2026-11-03" } });
    expect(totals()).toEqual(["Rs. 20.00", "Rs. 30.03"]);
    expect(screen.getByRole("table")).toHaveTextContent("Test rent");
    fireEvent.change(screen.getByLabelText("Business day"), { target: { value: "2026-11-04" } });
    expect(totals()).toEqual(["Rs. 0.00", "Rs. 30.03"]);
    expect(screen.getByText("No expenses recorded for this business day.")).toBeVisible();
    expect(entries.map(e=>e.amountPaise.toString()).join()).toBe(original);
  });
  it("distinguishes known empty records from unavailable data and rejects invalid dates", () => {
    expect(source.reviewExpenses([], "2026-11-02").daily).toBe(BigInt(0));
    expect(source.reviewExpenses(null, "2026-11-02").daily).toBeNull();
    expect(source.reviewExpenses(entries, "2026-02-30").daily).toBeNull();
    render(<ExpenseReviewPreview entries={null} initialBusinessDay="2026-11-02" />);
    fireEvent.change(screen.getByLabelText("Business day"), { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a valid business day.");
    expect(totals()).toEqual(["Unavailable", "Unavailable"]);
  });
  it.each([
    { ...entries[0], amountPaise: BigInt(-1) },
    { ...entries[0], date: "2026-02-30" },
    { ...entries[0], amountPaise: "100" as unknown as bigint },
  ])("does not present partial totals for invalid source data %#", invalid => {
    const result = source.reviewExpenses([entries[1], invalid], "2026-11-02");
    expect(result.daily).toBeNull(); expect(result.monthly).toBeNull(); expect(result.entries).toEqual([]);
    expect(result.error).toBe("Expense data is invalid. Totals are unavailable.");
  });
});
