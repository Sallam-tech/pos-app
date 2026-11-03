import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DashboardPage from "@/app/admin/dashboard/page";
import TodaySalesPage from "@/app/admin/sales/today/page";
import { TodaySalesPreview } from "@/components/admin/today-sales-preview";
import { aggregateMockSales, formatMockRevenue, getMockRevenuePaise, mockRevenueDecimal, mockSales, mockSalesBusinessDate, type MockSale } from "@/lib/admin/mock-sales";
import { formatMockBusinessDate, formatMockReportMonth, selectMockSalesPeriod } from "@/lib/admin/mock-sales-report";

function expectTotals(overall: string, filtered: string) {
  const totals = screen.getByLabelText("Revenue totals");
  expect(within(totals).getByText("Total Sales Revenue").nextElementSibling).toHaveTextContent(overall);
  expect(within(totals).getByText("Selected Products Revenue").nextElementSibling).toHaveTextContent(filtered);
}

describe("exact read-only mock sales revenue", () => {
  it("aggregates repeated products and distinct prices to exactly Rs. 25,690.00 without changing records", () => {
    const before = JSON.stringify(mockSales);
    const products = aggregateMockSales(mockSales);
    expect(products.map(({ productName, quantity, revenuePaise }) => [productName, quantity, revenuePaise.toString()])).toEqual([
      ["Diapers", 6, "749950"], ["Milk Powder", 4, "600100"], ["Baby Wipes", 10, "349950"],
      ["Hand Soap", 10, "125500"], ["Rice", 5, "425000"], ["Shampoo", 7, "318500"],
    ]);
    expect(products[0].unitPrices).toEqual([{ unitPricePaise: 125025, quantity: 2 }, { unitPricePaise: 124975, quantity: 4 }]);
    expect(products[1].unitPrices).toEqual([{ unitPricePaise: 150025, quantity: 4 }]);
    expect(products.reduce((total, product) => total + product.revenuePaise, BigInt(0))).toBe(getMockRevenuePaise());
    expect(getMockRevenuePaise()).toBe(BigInt(2569000));
    expect(formatMockRevenue(getMockRevenuePaise())).toBe("Rs. 25,690.00");
    expect(mockRevenueDecimal(getMockRevenuePaise())).toBe("25690.00");
    expect(JSON.stringify(mockSales)).toBe(before);
    expect(mockSalesBusinessDate.iso).toBe("2026-11-02");
  });

  it("keeps decimal paise exact and groups by product identity rather than display name", () => {
    const sales: readonly MockSale[] = [
      { id: "a", businessDate: "2026-11-02", productId: "one", productName: "Example", quantity: 3, unitPricePaise: 10 },
      { id: "b", businessDate: "2026-11-02", productId: "one", productName: "Example", quantity: 2, unitPricePaise: 20 },
      { id: "c", businessDate: "2026-11-02", productId: "two", productName: "Example", quantity: 2, unitPricePaise: 125025 },
    ];
    const products = aggregateMockSales(sales);
    expect(products).toHaveLength(2);
    expect(formatMockRevenue(products[0].revenuePaise)).toBe("Rs. 0.70");
    expect(formatMockRevenue(products[1].revenuePaise)).toBe("Rs. 2,500.50");
    expect(formatMockRevenue(getMockRevenuePaise(sales))).toBe("Rs. 2,501.20");
  });

  it.each([
    ["0", "Rs. 0.00"], ["1", "Rs. 0.01"], ["10", "Rs. 0.10"],
    ["100", "Rs. 1.00"], ["900719925474099301", "Rs. 9,007,199,254,740,993.01"],
  ])("formats %s paise with exactly two decimal places", (paise, expected) => {
    expect(formatMockRevenue(BigInt(paise))).toBe(expected);
  });

  it("handles an empty mock day without stale rows or revenue", () => {
    expect(aggregateMockSales([])).toEqual([]);
    expect(getMockRevenuePaise([])).toBe(BigInt(0));
    render(<TodaySalesPreview sales={[]} />);
    expectTotals("Rs. 0.00", "Rs. 0.00");
    expect(screen.getByText("No sales found for this period.")).toBeVisible();
  });
});

describe("Sales Report card and simple product summary", () => {
  it("preserves the revenue-card destination alongside the unavailable profit report", () => {
    render(<DashboardPage />);
    const card = screen.getByRole("group", { name: "Today's Sales Revenue (PKR)" });
    expect(within(card).getByRole("link", { name: "Today's Sales Revenue (PKR)" })).toHaveAttribute("href", "/admin/sales/today");
    expect(within(card).getByText("Rs. 25,690.00")).toHaveAttribute("value", "25690.00");
    expect(within(screen.getByRole("group", { name: "Today's Profit" })).getByRole("link")).toHaveAttribute("href", "/admin/profit/today");
  });

  it("shows fixed-date demo context, six simple summary rows and no selling prices until disclosure", () => {
    render(<TodaySalesPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Sales Report" })).toBeVisible();
    expect(screen.getByText("Demo Data", { exact: true })).toBeVisible();
    expect(screen.getByText("2 November 2026")).toHaveAttribute("datetime", "2026-11-02");
    expect(screen.getByText(/Fixed demo Today:/)).toHaveTextContent("Fixed examples, not live sales.");
    const region = screen.getByRole("region", { name: "Product-wise revenue" });
    expect(region).toHaveAccessibleDescription(/Read-only mock revenue/);
    expect(within(region).queryByText(/purchase cost|margin|profit/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Product Name", "Quantity Sold", "Total Revenue (PKR)", "Sale details",
    ]);
    expect(screen.getAllByRole("rowheader")).toHaveLength(6);
    for (const product of aggregateMockSales(mockSales)) {
      const row = screen.getByRole("rowheader", { name: product.productName }).closest("tr")!;
      const cells = within(row).getAllByRole("cell");
      expect(cells[0]).toHaveTextContent(String(product.quantity));
      expect(cells[1]).toHaveTextContent(formatMockRevenue(product.revenuePaise));
      expect(within(row).getByRole("button", { name: "View sales for " + product.productName })).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryByText("Rs. 1,250.25", { exact: true })).not.toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.getByRole("combobox", { name: "Reporting period" })).toHaveValue("today");
    expect(screen.queryByLabelText("Month and year")).not.toBeInTheDocument();
    expect(screen.getByText("All products", { exact: true })).toBeVisible();
    expectTotals("Rs. 25,690.00", "Rs. 25,690.00");
    expect(screen.getByRole("link", { name: "Back to Dashboard" })).toHaveAttribute("href", "/admin/dashboard");
  });

  it("searches product names and clears search without resetting the reporting period or mutating sales", () => {
    const before = JSON.stringify(mockSales);
    render(<TodaySalesPage />);
    const period = screen.getByRole("combobox", { name: "Reporting period" });
    fireEvent.change(period, { target: { value: "monthly" } });
    const search = screen.getByRole("searchbox", { name: "Search by product name" });
    fireEvent.change(search, { target: { value: "  MILK  " } });
    expect(screen.getAllByRole("rowheader").map((header) => header.textContent)).toEqual(["Milk Powder"]);
    expectTotals("Rs. 25,690.00", "Rs. 6,001.00");
    fireEvent.change(search, { target: { value: "no-such-product" } });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No products match your search in this period.")).toBeVisible();
    expectTotals("Rs. 25,690.00", "Rs. 0.00");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    expect(period).toHaveValue("monthly");
    expect(screen.getAllByRole("rowheader")).toHaveLength(6);
    expectTotals("Rs. 25,690.00", "Rs. 25,690.00");
    expect(JSON.stringify(mockSales)).toBe(before);
  });

  it("discloses each original Diapers sale and exact prices, using one accessible View/Hide sales control", () => {
    render(<TodaySalesPage />);
    const trigger = screen.getByRole("button", { name: "View sales for Diapers" });
    trigger.focus();
    expect(document.getElementById(trigger.getAttribute("aria-controls")!)).not.toBeVisible();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const details = screen.getByRole("region", { name: "Individual sales for Diapers" });
    const table = within(details).getByRole("table", { name: "Original mock sales for Diapers" });
    const rows = within(table).getAllByRole("rowheader");
    expect(rows.map((row) => row.textContent)).toEqual(["demo-sale-1", "demo-sale-2"]);
    expect(within(rows[0].closest("tr")!).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["2026-11-02", "2", "Rs. 1,250.25", "Rs. 2,500.50"]);
    expect(within(rows[1].closest("tr")!).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["2026-11-02", "4", "Rs. 1,249.75", "Rs. 4,999.00"]);
    expect(within(details).queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close sales" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /sales for Diapers/ })).toHaveLength(1);
    fireEvent.click(trigger);
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Individual sales for Diapers" })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});

describe("shop-calendar reporting periods", () => {
  const dates = ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-30", "2026-12-01"];
  const datedSales: readonly MockSale[] = dates.map((businessDate, index) => ({
    ...mockSales[0], id: "test-date-" + index, quantity: 1, unitPricePaise: 100, businessDate,
  }));

  it("filters Today and calendar months without converting civil dates through UTC", () => {
    expect(selectMockSalesPeriod(datedSales, { kind: "today" }).sales.map((sale) => sale.businessDate)).toEqual(["2026-11-02"]);
    const november = selectMockSalesPeriod(datedSales, { kind: "monthly", month: "2026-11" });
    expect(november.sales.map((sale) => sale.businessDate)).toEqual(["2026-11-01", "2026-11-02", "2026-11-30"]);
    expect(formatMockRevenue(getMockRevenuePaise(november.sales))).toBe("Rs. 3.00");
    expect(selectMockSalesPeriod(datedSales, { kind: "monthly", month: "2026-12" }).sales.map((sale) => sale.businessDate)).toEqual(["2026-12-01"]);
  });

  it("includes both custom boundaries, including a same-day range", () => {
    expect(selectMockSalesPeriod(datedSales, { kind: "custom", from: "2026-10-31", to: "2026-11-01" }).sales.map((sale) => sale.businessDate)).toEqual(["2026-10-31", "2026-11-01"]);
    expect(selectMockSalesPeriod(datedSales, { kind: "custom", from: "2026-11-02", to: "2026-11-02" }).sales).toHaveLength(1);
    expect(selectMockSalesPeriod(datedSales, { kind: "custom", from: "2026-11-30", to: "2026-12-01" }).sales).toHaveLength(2);
  });

  it("rejects reversed, missing and impossible dates and accepts a valid leap date", () => {
    expect(selectMockSalesPeriod(mockSales, { kind: "custom", from: "2026-11-03", to: "2026-11-02" })).toEqual({ sales: [], error: "From Date must be on or before To Date." });
    for (const from of ["", "2026-02-30", "2026-02-29", "0000-01-01"]) {
      expect(selectMockSalesPeriod(mockSales, { kind: "custom", from, to: "2026-11-02" }).error).toBeDefined();
    }
    expect(selectMockSalesPeriod([], { kind: "custom", from: "2024-02-29", to: "2024-02-29" })).toEqual({ sales: [] });
    expect(selectMockSalesPeriod(mockSales, { kind: "monthly", month: "" }).error).toBeDefined();
    expect(selectMockSalesPeriod(mockSales, { kind: "monthly", month: "2026-13" }).error).toBeDefined();
  });

  it("updates totals, products and details together for monthly/custom changes and empty dates", () => {
    render(<TodaySalesPage />);
    const period = screen.getByRole("combobox", { name: "Reporting period" });
    fireEvent.click(screen.getByRole("button", { name: "View sales for Diapers" }));
    fireEvent.change(period, { target: { value: "monthly" } });
    expect(screen.queryByRole("region", { name: "Individual sales for Diapers" })).not.toBeInTheDocument();
    const month = screen.getByLabelText("Month and year");
    expect(month).toHaveValue("2026-11");
    expect(screen.getByText("Selected month: November 2026")).toBeVisible();
    expectTotals("Rs. 25,690.00", "Rs. 25,690.00");
    fireEvent.change(month, { target: { value: "2026-10" } });
    expectTotals("Rs. 0.00", "Rs. 0.00");
    expect(screen.getByText("No sales found for this period.")).toBeVisible();
    fireEvent.change(period, { target: { value: "custom" } });
    expect(screen.queryByLabelText("Month and year")).not.toBeInTheDocument();
    expectTotals("Rs. 25,690.00", "Rs. 25,690.00");
    const from = screen.getByLabelText("From Date");
    const to = screen.getByLabelText("To Date");
    expect(from).toHaveAttribute("type", "date");
    expect(to).toHaveAttribute("type", "date");
    expect(from).toHaveAccessibleDescription("From: 02 Nov 2026");
    expect(to).toHaveAccessibleDescription("To: 02 Nov 2026");
    fireEvent.change(from, { target: { value: "2026-11-03" } });
    expect(screen.getByRole("alert")).toHaveTextContent("From Date must be on or before To Date.");
    expect(from).toHaveAttribute("aria-invalid", "true");
    expectTotals("—", "—");
    expect(within(screen.getByLabelText("Revenue totals")).queryByText("Rs. 0.00", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("No sales found for this period.")).not.toBeInTheDocument();
    fireEvent.change(to, { target: { value: "2026-11-04" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expectTotals("Rs. 0.00", "Rs. 0.00");
    expect(screen.getByText("No sales found for this period.")).toBeVisible();
    fireEvent.change(from, { target: { value: "2026-11-02" } });
    fireEvent.change(to, { target: { value: "2026-11-02" } });
    expectTotals("Rs. 25,690.00", "Rs. 25,690.00");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search by product name" }), { target: { value: "diap" } });
    expectTotals("Rs. 25,690.00", "Rs. 7,499.50");
    fireEvent.click(screen.getByRole("button", { name: "View sales for Diapers" }));
    expect(within(screen.getByRole("region", { name: "Individual sales for Diapers" })).getAllByRole("rowheader")).toHaveLength(2);
    fireEvent.change(period, { target: { value: "today" } });
    expect(screen.queryByLabelText("From Date")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Individual sales for Diapers" })).not.toBeInTheDocument();
  });
});

it("paginates a synthetic 100-sale product ten at a time without changing the demo fixture", () => {
  const before = JSON.stringify(mockSales);
  const synthetic: readonly MockSale[] = Array.from({ length: 100 }, (_, index) => ({
    ...mockSales[0], id: "test-sale-" + (index + 1), quantity: 1, unitPricePaise: 101,
  }));
  render(<TodaySalesPreview sales={synthetic} />);
  expectTotals("Rs. 101.00", "Rs. 101.00");
  const trigger = screen.getByRole("button", { name: "View sales for Diapers" });
    trigger.focus();
  fireEvent.click(trigger);
  const details = screen.getByRole("region", { name: "Individual sales for Diapers" });
  const rows = () => within(details).getAllByRole("rowheader").map((row) => row.textContent);
  expect(rows()).toHaveLength(10);
  expect(rows()[0]).toBe("test-sale-1");
  expect(within(details).getByRole("button", { name: "Previous" })).toBeDisabled();
  for (let page = 1; page < 10; page++) {
    fireEvent.click(within(details).getByRole("button", { name: "Next" }));
    expect(rows()).toHaveLength(10);
    expect(rows()[0]).toBe("test-sale-" + (page * 10 + 1));
  }
  expect(rows()[9]).toBe("test-sale-100");
  expect(within(details).getByRole("button", { name: "Next" })).toBeDisabled();
  fireEvent.click(within(details).getByRole("button", { name: "Previous" }));
  expect(rows()[0]).toBe("test-sale-81");
  expect(screen.queryByRole("button", { name: "Close sales" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /sales for Diapers/ })).toHaveLength(1);
    fireEvent.click(trigger);
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  expect(within(screen.getByRole("region", { name: "Individual sales for Diapers" })).getAllByRole("rowheader")[0]).toHaveTextContent("test-sale-1");
  expect(getMockRevenuePaise()).toBe(BigInt(2569000));
  expect(JSON.stringify(mockSales)).toBe(before);
});

describe("readable shop-calendar labels", () => {
  it.each([
    ["2026-11-02", "02 Nov 2026"], ["2026-01-01", "01 Jan 2026"],
    ["2026-12-31", "31 Dec 2026"], ["2024-02-29", "29 Feb 2024"],
    ["2026-02-29", "—"], ["", "—"],
  ])("formats %s without UTC conversion or day shifts", (date, expected) => {
    expect(formatMockBusinessDate(date)).toBe(expected);
  });

  it.each([
    ["2026-11", "November 2026"], ["2026-01", "January 2026"], ["", "—"],
  ])("labels the selected month %s unambiguously", (month, expected) => {
    expect(formatMockReportMonth(month)).toBe(expected);
  });

  it("treats a missing month as unavailable and restores valid totals when corrected", () => {
    render(<TodaySalesPage />);
    fireEvent.change(screen.getByRole("combobox", { name: "Reporting period" }), { target: { value: "monthly" } });
    const month = screen.getByLabelText("Month and year");
    expect(month).toHaveAttribute("type", "month");
    expect(screen.getByText("Selected month: November 2026")).toBeVisible();
    fireEvent.change(month, { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a valid month and year.");
    expectTotals("—", "—");
    expect(within(screen.getByLabelText("Revenue totals")).queryByText("Rs. 0.00", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.change(month, { target: { value: "2026-11" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expectTotals("Rs. 25,690.00", "Rs. 25,690.00");
  });
});
