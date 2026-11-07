import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportChartGraphic } from "@/components/admin/report-chart-graphic";
import { SimpleBarChart } from "@/components/admin/simple-bar-chart";
import { getFictionalProfitSales } from "@/lib/admin/mock-historical-costs";
import { formatProfitMoney } from "@/lib/admin/mock-profit";
import { productChartRows, timeChartRows, type ChartRow } from "@/lib/admin/report-chart-data";

const sales = getFictionalProfitSales();
const point = (id: string, label: string, value: bigint | null): ChartRow => ({ id, label, value, display: formatProfitMoney(value) });
const renderTime = (rows: ChartRow[]) => render(<ReportChartGraphic title="Profit Over Time" rows={rows} scaleRows={rows} measure="money" variant="time" grouping="daily" />);

describe("plain-language report comparisons", () => {
  it("keeps names and exact values accessible with vertical bars and a readable axis", () => {
    const rows = productChartRows(sales, "sales");
    render(<SimpleBarChart title="Most sold" rows={rows} ranked />);
    const entries = screen.getAllByRole("listitem");
    expect(entries).toHaveLength(5);
    expect(entries[0]).toHaveTextContent("Baby Wipes: 10 units");
    expect(entries[1]).toHaveTextContent("Hand Soap: 10 units");
    expect(entries[4]).toHaveTextContent("Rice: 5 units");
    const graphic = screen.getByRole("img", { name: "Most sold chart" });
    const largest = Number(graphic.querySelector('[data-comparison-bar="baby-wipes"]')!.getAttribute("height"));
    const rice = Number(graphic.querySelector('[data-comparison-bar="rice"]')!.getAttribute("height"));
    expect(largest / rice).toBeCloseTo(2);
    expect(graphic.querySelector('[data-axis="quantity"]')).not.toBeNull();
  });

  it("extends a loss below the zero baseline and exposes its exact negative amount", () => {
    const rows = [point("gain", "Gain", BigInt(1000)), point("loss", "Loss example", BigInt(-100))];
    render(<ReportChartGraphic title="Profit by product" rows={rows} scaleRows={rows} measure="money" variant="bar" grouping="daily" />);
    const graphic = screen.getByRole("img");
    const baseline = Number(graphic.querySelector("[data-zero-baseline]")!.getAttribute("y1"));
    const gain = graphic.querySelector('[data-comparison-bar="gain"]')!;
    const loss = graphic.querySelector('[data-comparison-bar="loss"]')!;
    expect(Number(gain.getAttribute("y"))).toBeLessThan(baseline);
    expect(Number(loss.getAttribute("y"))).toBe(baseline);
    expect(Number(loss.getAttribute("height"))).toBeGreaterThan(0);
    expect(screen.getByRole("list")).toHaveTextContent("Loss example: -Rs. 1.00 (Loss)");
  });

  it("shows the sole recorded date and exact profit as a compact summary without a chart", () => {
    renderTime(timeChartRows(sales, "profit", "daily"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("2 November 2026")).toBeVisible();
    expect(screen.getByRole("listitem")).toHaveTextContent("Gross Profit: Rs. 5,140.00");
    expect(screen.getByText("More sales dates are needed to compare profit over time.")).toBeVisible();
    expect(document.querySelector("[data-chart-point],[data-trend-segment]")).toBeNull();
  });

  it("shows a real trend only for multiple recorded periods, spaced by calendar distance with every value visible", () => {
    renderTime([
      point("2026-11-01", "01 Nov 2026", BigInt(10000)),
      point("2026-11-02", "02 Nov 2026", BigInt(20000)),
      point("2026-11-11", "11 Nov 2026", BigInt(15000)),
    ]);
    const graphic = screen.getByRole("img", { name: "Profit Over Time trend" });
    const dots = graphic.querySelectorAll("[data-chart-point]");
    const x = [...dots].map((dot) => Number(dot.getAttribute("cx")));
    expect(dots).toHaveLength(3);
    expect((x[1] - x[0]) / (x[2] - x[0])).toBeCloseTo(0.1);
    expect(graphic.querySelectorAll("[data-trend-segment]")).toHaveLength(2);
    expect(document.querySelector("[data-axis]")).toBeNull();
    const entries = screen.getAllByRole("listitem");
    expect(entries).toHaveLength(3);
    expect(entries[0]).toHaveTextContent("1 November 2026Gross Profit: Rs. 100.00");
    expect(entries[1]).toHaveTextContent("2 November 2026Gross Profit: Rs. 200.00");
    expect(entries[2]).toHaveTextContent("11 November 2026Gross Profit: Rs. 150.00");
    for (const entry of entries) expect(entry).toBeVisible();
    expect(screen.queryByText("3 November 2026")).not.toBeInTheDocument();
    expect(screen.queryByText(/More sales dates/)).not.toBeInTheDocument();
  });

  it("leaves missing costs unplotted and does not join a trend across an unavailable date", () => {
    renderTime([
      point("2026-11-01", "01 Nov 2026", BigInt(100)),
      point("2026-11-02", "02 Nov 2026", null),
      point("2026-11-03", "03 Nov 2026", BigInt(300)),
    ]);
    const graphic = screen.getByRole("img");
    expect(graphic.querySelectorAll("[data-chart-point]")).toHaveLength(2);
    expect(graphic.querySelectorAll("[data-trend-segment]")).toHaveLength(0);
    expect(screen.getByRole("list", { name: "Profit Over Time values" })).toHaveTextContent("2 November 2026Gross Profit: Not available");
    expect(screen.getByText("Not available")).toBeVisible();
  });

  it("keeps negative and zero trend values on the correct side of zero with exact visible amounts", () => {
    renderTime([point("2026-11-01", "01 Nov 2026", BigInt(-1)), point("2026-11-02", "02 Nov 2026", BigInt(0))]);
    const graphic = screen.getByRole("img");
    const zero = Number(graphic.querySelector("[data-zero-baseline]")!.getAttribute("y1"));
    const dots = graphic.querySelectorAll("[data-chart-point]");
    expect(Number(dots[0].getAttribute("cy"))).toBeGreaterThan(zero);
    expect(Number(dots[1].getAttribute("cy"))).toBe(zero);
    expect(screen.getByText("-Rs. 0.01 (Loss)")).toBeVisible();
    expect(screen.getByText("Rs. 0.00")).toBeVisible();
  });

  it.each([null, BigInt(0)])("shows one missing/zero value %s honestly without a meaningless graph", (value) => {
    renderTime([point("2026-11-02", "02 Nov 2026", value)]);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent(value === null ? "Not available" : "Rs. 0.00");
    expect(screen.getByText(/More sales dates are needed to compare profit/)).toBeVisible();
  });

  it("does not treat two dates as a complete profit trend when only one has a valid cost", () => {
    renderTime([point("2026-11-01", "01 Nov 2026", null), point("2026-11-02", "02 Nov 2026", BigInt(100))]);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Not available")).toBeVisible();
    expect(screen.getByText("Rs. 1.00")).toBeVisible();
  });

  it("keeps large exact values readable without unsafe conversions or truncated labels", () => {
    const row = point("test", "Large fictional example", BigInt(10) ** BigInt(100));
    render(<ReportChartGraphic title="Large values" rows={[row]} scaleRows={[row]} measure="money" variant="bar" grouping="daily" />);
    for (const label of screen.getAllByText(row.display)) expect(label).toBeVisible();
    expect(Number(document.querySelector("[data-comparison-bar]")!.getAttribute("height"))).toBeGreaterThan(0);
  });

  it("shows full long product names and genuine zero comparisons without fake full-width bars", () => {
    const name = "A long test product name with many words for comparison label wrapping";
    const row = { id: "test-only", label: name, value: BigInt(0), display: "0 units" };
    render(<ReportChartGraphic title="Product names" rows={[row]} scaleRows={[row]} measure="quantity" variant="bar" grouping="daily" />);
    expect(screen.getByLabelText(name + ": 0 units")).toBeInTheDocument();
    expect(screen.getByText("0 units")).toBeVisible();
    expect(document.querySelector("[data-comparison-bar]")).toBeNull();
    expect(document.querySelector("[data-zero-value]")).not.toBeNull();
  });
});
