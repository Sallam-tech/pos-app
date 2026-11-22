import { fireEvent, render, screen, within } from "@testing-library/react";
import { isValidElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportChartsPreview } from "@/components/admin/report-charts-preview";
import { TestSavedFinancialReport } from "@/components/admin/test-saved-financial-report";
import { TestExpenseFinancials } from "@/components/admin/test-expense-financials";
import { LiveDataRequired } from "@/components/shell/live-data-required";
import { SimpleBarChart } from "@/components/admin/simple-bar-chart";
import { getFictionalProfitSales } from "@/lib/admin/mock-historical-costs";
import { mockSales } from "@/lib/admin/mock-sales";
import type { ChartKind } from "@/lib/admin/report-chart-data";
import SalesReportPage, { metadata as salesMetadata } from "@/app/admin/reports/sales/page";
import ProfitReportPage, { metadata as profitMetadata } from "@/app/admin/reports/profit/page";
import LegacySalesPage from "@/app/admin/sales/today/page";
import LegacyProfitPage from "@/app/admin/profit/today/page";

const renderFlags = vi.hoisted(() => ({ reports: false, expenses: false, invoices: false }));
vi.mock("@/server/hosting/reports-render", () => ({ readTestReportsRender: () => renderFlags.reports }));
vi.mock("@/server/hosting/expenses-render", () => ({ readTestExpensesRender: () => renderFlags.expenses }));
vi.mock("@/server/hosting/invoices-render", () => ({ readTestInvoicesRender: () => renderFlags.invoices }));
vi.mock("next/server", () => ({ connection: async () => {} }));

const sales = getFictionalProfitSales();
const chart = (kind: ChartKind) => screen.getByRole("region", { name: kind === "sales" ? "Sales by Product" : "Profit by Product" });
const summary = (kind: ChartKind) => screen.getByLabelText(kind === "sales" ? "Revenue totals" : "Gross profit totals");
const value = (kind: ChartKind, label: string) => within(summary(kind)).getByText(label, { exact: true }).parentElement!.querySelector("dd")!;

describe("unified Sales and Profit Reports", () => {
  afterEach(() => {
    renderFlags.reports = false;
    renderFlags.expenses = false;
    renderFlags.invoices = false;
  });

  it.each([
    ["sales", SalesReportPage],
    ["profit", ProfitReportPage],
  ] as const)("uses saved authorized reports for authenticated %s rendering", async (_kind, route) => {
    renderFlags.reports = true;
    const result = await route();
    expect(isValidElement(result)).toBe(true);
    expect(result.type).toBe(TestSavedFinancialReport);
  });

  it.each([
    ["sales", SalesReportPage],
    ["profit", ProfitReportPage],
  ] as const)("uses the existing %s fallback only in its matching TEST runtime", async (kind, route) => {
    if (kind === "sales") renderFlags.invoices = true;
    else renderFlags.expenses = true;
    const result = await route();
    expect(isValidElement(result)).toBe(true);
    expect(result.type).toBe(TestExpenseFinancials);
    expect(result.props).toMatchObject({ mode: kind, authoritativeReports: false });
  });

  it.each([
    ["sales", SalesReportPage, "/admin/reports/sales", "Sales Report"],
    ["profit", ProfitReportPage, "/admin/reports/profit", "Profit Report"],
  ] as const)("shows a disconnected state, not demo financial data, for %s", async (_kind, route, path, title) => {
    const result = await route();
    expect(isValidElement(result)).toBe(true);
    expect(result.type).toBe(LiveDataRequired);
    expect(result.props).toMatchObject({ route: path, title });
  });

  it("reuses the canonical reports at both legacy URLs with their original titles", () => {
    expect(LegacySalesPage).toBe(SalesReportPage);
    expect(LegacyProfitPage).toBe(ProfitReportPage);
    expect(salesMetadata.title).toBe("Sales Report | Shop POS");
    expect(profitMetadata.title).toBe("Profit Report | Shop POS");
  });

  it.each(["sales", "profit"] as const)("shows three %s summary cards, six vertical comparisons and all details in one page", (kind) => {
    render(<ReportChartsPreview kind={kind} sales={sales} />);
    expect(summary(kind).querySelectorAll("dt")).toHaveLength(3);
    expect(screen.getByRole("combobox", { name: "Reporting period" })).toHaveValue("today");
    expect(screen.getByText("Demo Data")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Reports" })).toHaveAttribute("href", "/admin/reports");
    const comparison = chart(kind);
    expect(within(comparison).getAllByRole("listitem")).toHaveLength(6);
    expect(comparison.querySelectorAll("rect[data-comparison-bar]")).toHaveLength(6);
    expect(comparison.querySelector('[data-axis="PKR"]')).not.toBeNull();
    expect(screen.getAllByRole("rowheader")).toHaveLength(6);
    if (kind === "sales") {
      expect(value(kind, "Items Sold")).toHaveTextContent("42");
      expect(value(kind, "Products Sold")).toHaveTextContent("6");
      expect(within(comparison).getAllByRole("listitem").map((entry) => entry.textContent)).toEqual([
        "Diapers: Rs. 7,499.50", "Milk Powder: Rs. 6,001.00", "Rice: Rs. 4,250.00",
        "Baby Wipes: Rs. 3,499.50", "Shampoo: Rs. 3,185.00", "Hand Soap: Rs. 1,255.00",
      ]);
    } else {
      expect(value(kind, "Cost of Sold Items")).toHaveTextContent("Rs. 20,550.00");
      expect(value(kind, "Highest Profit Product")).toHaveTextContent("DiapersRs. 1,299.50");
      expect(screen.getByText(/Purchase costs are fictional demo examples/)).toBeVisible();
    }
    fireEvent.click(within(comparison).getByRole("button", { name: "Show Top 5" }));
    expect(within(comparison).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getAllByRole("rowheader")).toHaveLength(6);
    fireEvent.click(within(comparison).getByRole("button", { name: "Show All" }));
    expect(within(comparison).getAllByRole("listitem")).toHaveLength(6);
    expect(screen.queryByRole("img", { name: /Over Time trend/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Show by")).not.toBeInTheDocument();
  });

  it.each(["sales", "profit"] as const)("uses the same %s date and search filters for the chart and details while keeping overall totals separate", (kind) => {
    render(<ReportChartsPreview kind={kind} sales={sales} />);
    const totalLabel = kind === "sales" ? "Total Sales" : "Gross Profit";
    const normalTotal = kind === "sales" ? "Rs. 25,690.00" : "Rs. 5,140.00";
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  DIAPERS  " } });
    expect(screen.getAllByRole("rowheader")).toHaveLength(1);
    expect(within(chart(kind)).getAllByRole("listitem")).toHaveLength(1);
    expect(value(kind, totalLabel)).toHaveTextContent(normalTotal);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("searchbox")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Reporting period"), { target: { value: "monthly" } });
    fireEvent.change(screen.getByLabelText("Month and year"), { target: { value: "2026-10" } });
    expect(value(kind, totalLabel)).toHaveTextContent("Rs. 0.00");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(within(chart(kind)).queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(kind === "sales" ? "No sales found for this period." : "No sales for this period.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Month and year"), { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a valid month and year.");
    for (const dd of summary(kind).querySelectorAll("dd")) expect(dd).toHaveTextContent("—");
    fireEvent.change(screen.getByLabelText("Reporting period"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("From Date"), { target: { value: "2026-11-03" } });
    expect(screen.getByRole("alert")).toHaveTextContent("From Date must be on or before To Date.");
    expect(screen.getByLabelText("From Date")).toHaveAttribute("aria-invalid", "true");
    for (const dd of summary(kind).querySelectorAll("dd")) expect(dd).toHaveTextContent("—");
    fireEvent.change(screen.getByLabelText("From Date"), { target: { value: "2026-11-02" } });
    expect(value(kind, totalLabel)).toHaveTextContent(normalTotal);
    expect(within(chart(kind)).getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getAllByRole("rowheader")).toHaveLength(6);
  });

  it.each(["sales", "profit"] as const)("scrolls to and focuses %s details without clearing the current period or search", (kind) => {
    render(<ReportChartsPreview kind={kind} sales={sales} />);
    fireEvent.change(screen.getByLabelText("Reporting period"), { target: { value: "monthly" } });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "diapers" } });
    const heading = screen.getByRole("heading", { name: kind === "sales" ? "Sales Details" : "Profit Details" });
    heading.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: kind === "sales" ? "View Sales Details" : "View Profit Details" }));
    expect(heading).toHaveFocus();
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(screen.getByLabelText("Reporting period")).toHaveValue("monthly");
    expect(screen.getByRole("searchbox")).toHaveValue("diapers");
  });

  it.each([undefined, -1, 0.1])("preserves unavailable totals, rankings and product costs for invalid historical cost %s", (cost) => {
    render(<ReportChartsPreview kind="profit" sales={[{ ...sales[0], unitCostSnapshotPaise: cost }, sales[1]]} />);
    for (const label of ["Gross Profit", "Cost of Sold Items", "Highest Profit Product"]) expect(value("profit", label)).toHaveTextContent("Not available");
    expect(chart("profit").querySelector("rect")).toBeNull();
    expect(screen.getByText(/Missing or unsupported values are not treated as zero/)).toBeVisible();
    expect(within(screen.getByRole("table")).getAllByText("Not available")).toHaveLength(2);
  });

  it("draws exact losses below zero, labels them and keeps break-even at zero", () => {
    render(<ReportChartsPreview kind="profit" sales={[
      { ...sales[0], productId: "loss", productName: "Loss example", quantity: 1, unitPricePaise: 99, unitCostSnapshotPaise: 100 },
      { ...sales[1], quantity: 1, unitPricePaise: 100, unitCostSnapshotPaise: 100 },
    ]} />);
    expect(value("profit", "Gross Profit")).toHaveTextContent("-Rs. 0.01");
    const comparison = chart("profit");
    const baseline = Number(comparison.querySelector("[data-zero-baseline]")!.getAttribute("y1"));
    const loss = comparison.querySelector('[data-comparison-bar="loss"]')!;
    expect(Number(loss.getAttribute("y"))).toBe(baseline);
    expect(Number(loss.getAttribute("height"))).toBeGreaterThan(0);
    expect(comparison.querySelector('[data-zero-value="diapers"]')).not.toBeNull();
    expect(within(screen.getByRole("table")).getByText("-Rs. 0.01 (Loss)")).toBeVisible();
  });

  it("keeps hundreds of products bounded and accessible when Show All is selected", () => {
    const rows = Array.from({ length: 203 }, (_, index) => ({
      id: String(index), label: "Test product " + index, value: BigInt(203 - index) * BigInt(1_000_000), display: String(203 - index) + " units",
    }));
    render(<SimpleBarChart title="Test products" rows={rows} ranked />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Show All" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByRole("status")).toHaveTextContent("Page 1 of 21");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Show Top 5" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("shows every original sale and no buying-cost or profit fields in the Sales Report", () => {
    render(<ReportChartsPreview kind="sales" sales={mockSales} />);
    for (const button of screen.getAllByRole("button", { name: /^View sales for/ })) fireEvent.click(button);
    const regions = screen.getAllByRole("region", { name: /^Individual sales for/ });
    expect(regions.flatMap((region) => within(region).getAllByRole("rowheader").map((row) => row.textContent))).toEqual(mockSales.map((sale) => sale.id));
    expect(document.body.textContent).not.toMatch(/gross profit|purchase cost|cost of sold/i);
  });

  it.each(["sales", "profit"] as const)("retains genuine multi-period %s comparison without manufacturing single-date trends", (kind) => {
    const dated = [{ ...sales[0], businessDate: "2026-11-01" }, { ...sales[1], businessDate: "2026-11-02" }];
    render(<ReportChartsPreview kind={kind} sales={dated} />);
    expect(screen.queryByText(kind === "sales" ? "Sales over time" : "Profit over time")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reporting period"), { target: { value: "monthly" } });
    fireEvent.click(screen.getByText(kind === "sales" ? "Sales over time" : "Profit over time"));
    const history = screen.getByRole("region", { name: kind === "sales" ? "Sales Over Time" : "Profit Over Time" });
    expect(within(history).getByRole("img").querySelectorAll("[data-chart-point]")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Show by"), { target: { value: "monthly" } });
    expect(within(history).queryByRole("img")).not.toBeInTheDocument();
    expect(within(history).getByRole("listitem")).toHaveTextContent("November 2026");
    fireEvent.change(screen.getByLabelText("Reporting period"), { target: { value: "today" } });
    expect(screen.queryByRole("img", { name: /Over Time trend/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Show by")).not.toBeInTheDocument();
  });
});
