import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AdminExpensesPreview as ExpensesPage } from "@/components/demo/admin-expenses-preview";
import ReturnsPage from "@/app/pos/returns/page";
import InvestmentPage from "@/app/admin/investment/page";
import { mockSales } from "@/lib/admin/mock-sales";
import { demoExpenseTotals, inspectDemoReturn, isDemoCalendarDate, type DemoExpense } from "@/lib/demo/admin-preview";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
function enterExpense(amount: string, reason = "Cleaning") {
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: reason } });
  fireEvent.change(screen.getByLabelText("Amount (Rs.)"), { target: { value: amount } });
  fireEvent.click(screen.getByRole("button", { name: "Add Expense" }));
}

describe("role-placed temporary demo previews", () => {
  it("projects only the permitted original-sale details into the Salesperson return preview", () => {
    const page = ReturnsPage();
    const preview = page.props.children;
    expect(preview.props.sales).toHaveLength(8);
    for (const sale of preview.props.sales) expect(Object.keys(sale)).toEqual(["id", "productName", "quantity", "unitPricePaise"]);
    render(page);
    expect(screen.getByRole("heading", { level: 1, name: "Return & Refund" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Find Original Sale"), { target: { value: "demo-sale" } });
    expect(screen.getAllByRole("button", { name: /^Select demo-sale-/ })).toHaveLength(8);
    expect(screen.queryByText(/purchase cost|gross profit|investment|remaining stock|Demo Tools/i)).not.toBeInTheDocument();
  });
  it("validates real calendar dates without timezone conversion", () => {
    expect(isDemoCalendarDate("2024-02-29")).toBe(true);
    expect(isDemoCalendarDate("2000-02-29")).toBe(true);
    for (const date of ["1900-02-29", "2026-02-29", "2026-11-31", "0000-01-01", "2026-13-01", "2026-1-02", ""]) expect(isDemoCalendarDate(date)).toBe(false);
  });
  it("sums exact paise separately for the selected day and month", () => {
    const entries: DemoExpense[] = [
      { id: 1, date: "2026-11-02", type: "Rent", description: "", amountPaise: BigInt(10) },
      { id: 2, date: "2026-11-02", type: "Other", description: "", amountPaise: BigInt(20) },
      { id: 3, date: "2026-11-03", type: "Transport", description: "", amountPaise: BigInt(10000) },
      { id: 4, date: "2026-12-02", type: "Electricity", description: "", amountPaise: BigInt(50000) },
    ];
    expect(demoExpenseTotals(entries, "2026-11-02")).toEqual({ daily: BigInt(30), monthly: BigInt(10030) });
    expect(demoExpenseTotals(entries, "2026-11-04")).toEqual({ daily: BigInt(0), monthly: BigInt(10030) });
    expect(demoExpenseTotals(entries, "")).toEqual({ daily: null, monthly: null });
  });
  it("adds, corrects, removes and resets temporary expenses through the Summary dialog", () => {
    const original = JSON.stringify(mockSales); render(<ExpensesPage businessDate={{ iso: "2026-11-02", label: "2 November 2026" }} />);
    expect(screen.queryByRole("table")).toBeNull();
    enterExpense("100.10"); enterExpense("0.20", "Transport");
    expect(screen.queryByRole("table")).toBeNull();
    const summary = () => screen.getByRole("dialog", { name: "Expense Summary" });
    fireEvent.click(screen.getByRole("button", { name: "View Expense Summary" }));
    fireEvent.change(within(summary()).getByLabelText("Selected Date"), { target: { value: "2026-11-02" } });
    expect(within(summary()).getByText("Daily Expenses").nextElementSibling).toHaveTextContent("Rs. 100.30");
    expect(within(summary()).getByText("Monthly Expenses").nextElementSibling).toHaveTextContent("Rs. 100.30");
    fireEvent.click(screen.getByRole("button", { name: "Correct expense: Cleaning" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Amount (Rs.)")).toHaveValue("100.10");
    fireEvent.change(screen.getByLabelText("Amount (Rs.)"), { target: { value: "200.20" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Expense" }));
    fireEvent.click(screen.getByRole("button", { name: "View Expense Summary" }));
    expect(within(summary()).getByText("Monthly Expenses").nextElementSibling).toHaveTextContent("Rs. 200.40");
    fireEvent.change(within(summary()).getByLabelText("Selected Date"), { target: { value: "2026-11-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove expense: Transport" }));
    expect(within(summary()).getAllByRole("row")).toHaveLength(2);
    expect(within(summary()).getByText("Monthly Expenses").nextElementSibling).toHaveTextContent("Rs. 200.20");
    fireEvent.click(screen.getByRole("button", { name: "Reset Demo Expenses" }));
    expect(screen.queryByRole("table")).toBeNull(); expect(JSON.stringify(mockSales)).toBe(original);
  });
  it.each(["0", "-1", "0.001", "100.999", "1e3", ""])("rejects unsafe expense amount %s and focuses its error", (amount) => {
    render(<ExpensesPage businessDate={{ iso: "2026-11-02", label: "2 November 2026" }} />); enterExpense(amount);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a positive PKR amount");
    expect(screen.getByLabelText("Amount (Rs.)")).toHaveFocus(); expect(screen.queryByRole("table")).toBeNull();
  });
  it("rejects an empty reason and clears temporary state on leaving", () => {
    const view = render(<ExpensesPage businessDate={{ iso: "2026-11-02", label: "2 November 2026" }} />); enterExpense("1", "");
    expect(screen.getByRole("alert")).toHaveTextContent("short reason"); expect(screen.getByLabelText("Reason")).toHaveFocus();
    view.unmount(); render(<ExpensesPage businessDate={{ iso: "2026-11-02", label: "2 November 2026" }} />); fireEvent.click(screen.getByRole("button", { name: "View Expense Summary" }));
    expect(screen.getByText("No expenses recorded for this date.")).toBeVisible();
  });
  it("shows incomplete purchase information without arbitrary owner investment entry", () => {
    render(<InvestmentPage />);
    expect(screen.getByText("Not available — buying costs not recorded")).toBeVisible();
    fireEvent.click(screen.getByText("View Product Details"));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("rowheader")).toHaveLength(7);
    expect(screen.queryByText("Rs. 0.00")).not.toBeInTheDocument();
  });
  it("validates return limits and sub-paisa amounts exactly, without inferring missing refund terms", () => {
    const original = JSON.stringify(mockSales);
    expect(inspectDemoReturn(undefined, "1").error).toMatch(/Choose/);
    for (const quantity of ["0", "-1", "2.000001", "3", "1e0", "0.0000001", ""]) expect(inspectDemoReturn(mockSales[0], quantity).error).toBeDefined();
    expect(inspectDemoReturn(mockSales[0], "0.1").error).toMatch(/one-paisa precision/);
    expect(inspectDemoReturn(mockSales[0], "0.2")).toEqual({ originalAmountPaise: BigInt(25005), returnedQuantity: "0.2", refundPaise: null });
    expect(inspectDemoReturn(mockSales[0], "2")).toEqual({ originalAmountPaise: BigInt(250050), returnedQuantity: "2", refundPaise: null });
    expect(inspectDemoReturn({ ...mockSales[0], quantity: 1.5 }, "1").error).toMatch(/unsupported/);
    expect(JSON.stringify(mockSales)).toBe(original);
  });
  it("shows an honest read-only cash-refund review and resets without changing original sales", () => {
    render(<ReturnsPage />); const submit = screen.getByRole("button", { name: "Review Refund" });
    fireEvent.click(submit); expect(screen.getByRole("alert")).toHaveTextContent("Choose an original sale"); expect(screen.getByLabelText("Find Original Sale")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Find Original Sale"), { target: { value: "demo-sale-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Select demo-sale-1 — Diapers" }));
    fireEvent.change(screen.getByLabelText("Return Quantity — Diapers, item 1"), { target: { value: "3" } }); fireEvent.click(submit);
    expect(screen.getByRole("alert")).toHaveTextContent("cannot exceed"); expect(screen.getByLabelText("Return Quantity — Diapers, item 1")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Return Quantity — Diapers, item 1"), { target: { value: "2" } }); submit.focus(); fireEvent.click(submit);
    const review = screen.getByRole("dialog", { name: "Refund Review — Demo Only" });
    expect(review).toHaveTextContent("Refund amount unavailable"); expect(review).toHaveTextContent("missing or inconsistent");
    expect(within(review).queryByRole("button", { name: /confirm|pay/i })).toBeNull();
    fireEvent.click(within(review).getByRole("button", { name: "Done" })); expect(submit).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByLabelText("Find Original Sale")).toHaveValue("");
  });
});
