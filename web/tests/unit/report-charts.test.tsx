import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportChartsPreview } from "@/components/admin/report-charts-preview";
import { SimpleBarChart } from "@/components/admin/simple-bar-chart";
import { getFictionalProfitSales } from "@/lib/admin/mock-historical-costs";
import { mockSales } from "@/lib/admin/mock-sales";
import { type ChartKind } from "@/lib/admin/report-chart-data";
import SalesChartsPage, { metadata as salesMetadata } from "@/app/admin/reports/sales/page";
import ProfitChartsPage, { metadata as profitMetadata } from "@/app/admin/reports/profit/page";

const sales = getFictionalProfitSales();
const chart = (kind: ChartKind) => screen.getByRole("region", { name: kind === "sales" ? "Which Products Sold the Most?" : "Which Products Earned the Most Profit?" });
const summary = () => screen.getByLabelText(/^(Sales|Profit) summary$/);
const value = (label: string) => within(summary()).getByText(label, { exact: true }).parentElement!.querySelector("dd")!;

describe("simple Sales and Profit Charts pages", () => {
  it("connects both routes to shared fixtures, with meaningful titles and detail links", () => {
    expect(salesMetadata.title).toBe("Sales Charts | Shop POS");
    expect(profitMetadata.title).toBe("Profit Charts | Shop POS");
    const { unmount } = render(<SalesChartsPage />);
    expect(value("Total Sales (Rs.)")).toHaveTextContent("Rs. 25,690.00");
    expect(screen.getByRole("link", { name: "View Detailed Sales Report" })).toHaveAttribute("href", "/admin/sales/today");
    unmount();
    render(<ProfitChartsPage />);
    expect(value("Gross Profit (Rs.)")).toHaveTextContent("Rs. 5,140.00");
    expect(screen.getByRole("link", { name: "View Detailed Profit Report" })).toHaveAttribute("href", "/admin/profit/today");
  });

  it.each(["sales", "profit"] as const)("shows three exact %s summaries, two readable charts, top five/all and a genuine single-date notice", (kind) => {
    render(<ReportChartsPreview kind={kind} sales={sales} />);
    expect(summary().querySelectorAll("dt")).toHaveLength(3);
    expect(screen.getAllByRole("region")).toHaveLength(2);
    expect(screen.getByText("Demo Data")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Reports" })).toHaveAttribute("href", "/admin/reports");
    if (kind === "sales") {
      expect(value("Items Sold")).toHaveTextContent("42 units");
      expect(value("Different Products Sold")).toHaveTextContent("6");
    } else {
      expect(value("Cost of Sold Items (Rs.)")).toHaveTextContent("Rs. 20,550.00");
      expect(value("Highest Profit Product")).toHaveTextContent("Diapers - Rs. 1,299.50");
      expect(screen.getByText(/Purchase costs are fictional demo examples/)).toBeVisible();
    }
    expect(within(chart(kind)).getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(within(chart(kind)).getByRole("button", { name: "Show All" }));
    expect(within(chart(kind)).getAllByRole("listitem")).toHaveLength(6);
    fireEvent.click(within(chart(kind)).getByRole("button", { name: "Show Top 5" }));
    expect(within(chart(kind)).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("More sales dates are needed to compare " + kind + " over time.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Show by"), { target: { value: "monthly" } });
    expect(within(screen.getByRole("region", { name: kind === "sales" ? "Sales Over Time" : "Profit Over Time" })).getByRole("listitem")).toHaveTextContent("November 2026");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it.each(["sales", "profit"] as const)("applies one %s period to every summary and chart, separating empty and invalid results", (kind) => {
    render(<ReportChartsPreview kind={kind} sales={sales} />);
    fireEvent.change(screen.getByLabelText("Reporting period"), { target: { value: "monthly" } });
    fireEvent.change(screen.getByLabelText("Month and year"), { target: { value: "2026-10" } });
    expect(value(kind === "sales" ? "Total Sales (Rs.)" : "Gross Profit (Rs.)")).toHaveTextContent("Rs. 0.00");
    expect(within(chart(kind)).queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getAllByText("No sales for this period.")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Month and year"), { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a valid month and year.");
    expect(value(kind === "sales" ? "Total Sales (Rs.)" : "Gross Profit (Rs.)")).toHaveTextContent("\u2014");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reporting period"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("From Date"), { target: { value: "2026-11-03" } });
    expect(screen.getByRole("alert")).toHaveTextContent("From Date must be on or before To Date.");
    expect(screen.getByLabelText("From Date")).toHaveAttribute("aria-invalid", "true");
    for (const dd of summary().querySelectorAll("dd")) expect(dd).toHaveTextContent("\u2014");
    fireEvent.change(screen.getByLabelText("From Date"), { target: { value: "2026-11-02" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(value(kind === "sales" ? "Total Sales (Rs.)" : "Gross Profit (Rs.)")).toHaveTextContent(kind === "sales" ? "Rs. 25,690.00" : "Rs. 5,140.00");
    expect(within(chart(kind)).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("From: 02 Nov 2026 to 02 Nov 2026 (Asia/Karachi)")).toBeVisible();
  });

  it.each([undefined, -1, 0.1])("does not rank incomplete profit or invent a highest-profit product for cost %s", (cost) => {
    render(<ReportChartsPreview kind="profit" sales={[{ ...sales[0], unitCostSnapshotPaise: cost }, sales[1]]} />);
    expect(value("Gross Profit (Rs.)")).toHaveTextContent("Not available");
    expect(value("Cost of Sold Items (Rs.)")).toHaveTextContent("Not available");
    expect(value("Highest Profit Product")).toHaveTextContent("Not available");
    expect(within(chart("profit")).queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("not treated as zero");
    expect(screen.getByRole("region", { name: "Profit Over Time" })).toHaveTextContent("Not available");
  });

  it("uses sale snapshots for exact losses and displays zero for break-even", () => {
    render(<ReportChartsPreview kind="profit" sales={[
      { ...sales[0], productId: "loss", productName: "Loss example", quantity: 1, unitPricePaise: 99, unitCostSnapshotPaise: 100 },
      { ...sales[1], quantity: 1, unitPricePaise: 100, unitCostSnapshotPaise: 100 },
    ]} />);
    expect(value("Gross Profit (Rs.)")).toHaveTextContent("-Rs. 0.01");
    const list = within(chart("profit")).getAllByRole("listitem");
    expect(list[0]).toHaveTextContent("DiapersRs. 0.00");
    expect(list[1]).toHaveTextContent("Loss example-Rs. 0.01 (Loss)");
    const comparison = chart("profit");
    expect(comparison.querySelector("[data-zero-baseline]")).toHaveClass("left-1/2");
    expect(comparison.querySelector('[data-comparison-bar="loss"]')).toHaveStyle({ right: "50%", width: "50%" });
    expect(within(comparison).getByText("-Rs. 0.01 (Loss)")).toBeVisible();
    expect(within(comparison).queryByRole("img")).not.toBeInTheDocument();
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

  it("sales charts do not expose purchase costs or profits from raw sales", () => {
    render(<ReportChartsPreview kind="sales" sales={mockSales} />);
    expect(screen.queryByText(/gross profit|purchase cost|cost of sold/i)).not.toBeInTheDocument();
  });
  it.each(["sales", "profit"] as const)("shows a trend only when the selected %s period and grouping contain two valid dates", (kind) => {
    // Isolated test-only dates; the application fixtures remain unchanged.
    const dated = [{ ...sales[0], businessDate: "2026-11-01" }, { ...sales[1], businessDate: "2026-11-02" }];
    render(<ReportChartsPreview kind={kind} sales={dated} />);
    const history = () => screen.getByRole("region", { name: kind === "sales" ? "Sales Over Time" : "Profit Over Time" });
    expect(within(history()).queryByRole("img")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reporting period"), { target: { value: "monthly" } });
    expect(within(history()).getByRole("img").querySelectorAll("[data-chart-point]")).toHaveLength(2);
    expect(within(history()).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Show by"), { target: { value: "monthly" } });
    expect(within(history()).queryByRole("img")).not.toBeInTheDocument();
    expect(within(history()).getByRole("listitem")).toHaveTextContent("November 2026");
    expect(within(history()).getByText(kind === "sales" ? "Rs. 7,499.50" : "Rs. 1,299.50")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Show by"), { target: { value: "daily" } });
    expect(within(history()).getByRole("img")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Reporting period"), { target: { value: "custom" } });
    expect(within(history()).queryByRole("img")).not.toBeInTheDocument();
    expect(within(history()).getByText(kind === "sales" ? "Rs. 4,999.00" : "Rs. 799.00")).toBeVisible();
    expect(within(history()).getAllByRole("listitem")).toHaveLength(1);
  });

});
