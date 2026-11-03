import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TodayProfitPage from "@/app/admin/profit/today/page";
import DashboardPage from "@/app/admin/dashboard/page";
import { TodayProfitPreview } from "@/components/admin/today-profit-preview";
import { RecordSaleForm } from "@/components/pos/record-sale-form";
import * as historicalCosts from "@/lib/admin/mock-historical-costs";
import { mockSales } from "@/lib/admin/mock-sales";
import type { ProfitSale } from "@/lib/admin/mock-profit";

function expectTotals(overall: string, selected: string) {
  const totals = screen.getByLabelText("Gross profit totals");
  for (const [name, value] of [["Total Gross Profit", overall], ["Selected Products Gross Profit", selected]]) {
    expect(within(totals).getByText(name).nextElementSibling?.firstElementChild).toHaveTextContent(value);
  }
}
const table = () => screen.getByRole("table", { name: "Mock product-wise gross profit" });

describe("read-only Admin profit report", () => {
  it("links the calculated fictional Dashboard profit without restoring the old placeholder", () => {
    render(<DashboardPage />);
    const card = screen.getByRole("group", { name: "Today's Profit" });
    expect(within(card).getByRole("link")).toHaveAttribute("href", "/admin/profit/today");
    expect(within(card).getByRole("link")).toHaveAccessibleDescription(/Example purchase costs for demo sales/);
    expect(within(card).getByText("Rs. 5,140.00")).toBeVisible();
    expect(card.querySelector("data")).toHaveAttribute("value", "5140.00");
    expect(screen.queryByText("Rs. 4,860.00")).not.toBeInTheDocument();
  });

  it("shows six reconciled product rows with fictional costs, calculated profit and fixed-date context", () => {
    render(<TodayProfitPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Profit Report" })).toBeVisible();
    expect(screen.getByText("Demo Data")).toBeVisible();
    expect(screen.getByText("2 November 2026")).toHaveAttribute("datetime", "2026-11-02");
    expect(screen.getByText(/Fixed demo Today:/)).toHaveTextContent("Asia/Karachi");
    expect(screen.getByRole("link", { name: "Back to Dashboard" })).toHaveAttribute("href", "/admin/dashboard");
    expectTotals("Rs. 5,140.00", "Rs. 5,140.00");
    expect(within(table()).getAllByRole("rowheader")).toHaveLength(6);
    const diapers = within(table()).getByRole("rowheader", { name: "Diapers" }).closest("tr")!;
    expect(within(diapers).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["6", "Rs. 7,499.50", "Rs. 6,200.00", "Rs. 1,299.50"]);
    expect(within(table()).queryAllByText("Not available")).toHaveLength(0);
    expect(screen.getByText("Profit calculated using example purchase costs for demo sales.")).toBeVisible();
    expect(screen.getByText(/Authentication and Admin authorization are not implemented/)).toBeInTheDocument();
  });

  it("searches names case-insensitively, keeps overall scope, and resets with restored focus", () => {
    render(<TodayProfitPage />);
    const search = screen.getByRole("searchbox", { name: "Search by product name" });
    fireEvent.change(search, { target: { value: "  DIAPERS  " } });
    expect(within(table()).getAllByRole("rowheader")).toHaveLength(1);
    expect(within(table()).getByText("Rs. 7,499.50")).toBeVisible();
    expectTotals("Rs. 5,140.00", "Rs. 1,299.50");
    fireEvent.change(search, { target: { value: "not-a-product" } });
    expect(screen.getByText("No products match your search in this period.")).toBeVisible();
    expectTotals("Rs. 5,140.00", "Rs. 0.00");
    expect(screen.getByText("Matching product names")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveFocus();
    expect(search).toHaveValue("");
    expect(within(table()).getAllByRole("rowheader")).toHaveLength(6);
  });

  it("reuses monthly and inclusive custom date boundaries with readable dates and true no-sales zero", () => {
    render(<TodayProfitPage />);
    const period = screen.getByLabelText("Reporting period");
    fireEvent.change(period, { target: { value: "monthly" } });
    const month = screen.getByLabelText("Month and year");
    expect(screen.getByText("Selected month: November 2026")).toBeVisible();
    expectTotals("Rs. 5,140.00", "Rs. 5,140.00");
    fireEvent.change(month, { target: { value: "2026-10" } });
    expectTotals("Rs. 0.00", "Rs. 0.00");
    expect(screen.getByText("No sales for this period.")).toBeVisible();
    fireEvent.change(period, { target: { value: "custom" } });
    const from = screen.getByLabelText("From Date");
    const to = screen.getByLabelText("To Date");
    expect(screen.getByText("From: 02 Nov 2026")).toBeVisible();
    expect(screen.getByText("To: 02 Nov 2026")).toBeVisible();
    expectTotals("Rs. 5,140.00", "Rs. 5,140.00");
    fireEvent.change(from, { target: { value: "2026-11-03" } });
    expect(screen.getByRole("alert")).toHaveTextContent("From Date must be on or before To Date.");
    expect(from).toHaveAttribute("aria-invalid", "true");
    expectTotals("\u2014", "\u2014");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.change(to, { target: { value: "2026-11-03" } });
    expectTotals("Rs. 0.00", "Rs. 0.00");
    expect(screen.getByText("No sales for this period.")).toBeVisible();
    fireEvent.change(from, { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Enter valid From and To dates.");
    expectTotals("\u2014", "\u2014");
    fireEvent.change(period, { target: { value: "monthly" } });
    fireEvent.change(screen.getByLabelText("Month and year"), { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a valid month and year.");
    expectTotals("\u2014", "\u2014");
    fireEvent.change(period, { target: { value: "today" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expectTotals("Rs. 5,140.00", "Rs. 5,140.00");
  });

  it("keeps a mixed-cost overall total unavailable even when search selects a fully costed product", () => {
    // Explicitly synthetic cost, confined to this test.
    const sales: ProfitSale[] = [{ ...mockSales[0], id: "synthetic-known", unitCostSnapshotPaise: 100000 }, mockSales[2]];
    render(<TodayProfitPreview sales={sales} />);
    expectTotals("Not available", "Not available");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "diapers" } });
    expectTotals("Not available", "Rs. 500.50");
    const cells = within(table()).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["2", "Rs. 2,500.50", "Rs. 2,000.00", "Rs. 500.50"]);
  });

  it("preserves unavailable report totals for raw sales without historical costs", () => {
    render(<TodayProfitPreview sales={mockSales} />);
    expectTotals("Not available", "Not available");
    expect(screen.getByText(/Historical purchase costs are not recorded for all included sales/)).toBeVisible();
  });

  it("preserves the Dashboard unavailable fallback when historical costs are absent", () => {
    const source = vi.spyOn(historicalCosts, "getFictionalProfitSales").mockReturnValue([...mockSales]);
    try {
      render(<DashboardPage />);
      const card = screen.getByRole("group", { name: "Today's Profit" });
      expect(within(card).getByText("Unavailable")).toBeVisible();
      expect(card.querySelector("data")).toBeNull();
      expect(within(card).getByRole("link")).toHaveAttribute("href", "/admin/profit/today");
    } finally { source.mockRestore(); }
  });

  it("does not expose purchase costs or profit on the unchanged POS", () => {
    render(<RecordSaleForm />);
    const product = screen.getByRole("combobox", { name: "Product" });
    fireEvent.change(product, { target: { value: "Diapers" } });
    fireEvent.keyDown(product, { key: "Enter" });
    expect(screen.getByText("Suggested: Rs. 1,250.00")).toBeVisible();
    expect(document.body.textContent).not.toMatch(/purchase cost|gross profit|historical cost|margin|remaining stock/i);
    expect(document.body.innerHTML).not.toMatch(/unitCostSnapshotPaise|costOfGoodsSoldPaise|grossProfitPaise/);
  });
});
