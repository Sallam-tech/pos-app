"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SimpleBarChart } from "@/components/admin/simple-bar-chart";
import { aggregateMockProfit, calculateMockProfitTotals, formatProfitMoney, type ProfitSale } from "@/lib/admin/mock-profit";
import { mockSalesBusinessDate } from "@/lib/admin/mock-sales";
import { formatMockBusinessDate, formatMockReportMonth, selectMockSalesPeriod, type MockReportPeriod } from "@/lib/admin/mock-sales-report";
import { productChartRows, timeChartRows, type ChartGrouping, type ChartKind } from "@/lib/admin/report-chart-data";

export function ReportChartsPreview({ kind, sales }: { kind: ChartKind; sales: readonly ProfitSale[] }) {
  const [period, setPeriod] = useState<MockReportPeriod["kind"]>("today");
  const [month, setMonth] = useState(mockSalesBusinessDate.iso.slice(0, 7));
  const [from, setFrom] = useState<string>(mockSalesBusinessDate.iso);
  const [to, setTo] = useState<string>(mockSalesBusinessDate.iso);
  const [grouping, setGrouping] = useState<ChartGrouping>("daily");
  const selection: MockReportPeriod = period === "today" ? { kind: "today" }
    : period === "monthly" ? { kind: "monthly", month } : { kind: "custom", from, to };
  const report = selectMockSalesPeriod(sales, selection);
  const totals = calculateMockProfitTotals(report.sales as readonly ProfitSale[]);
  const products = aggregateMockProfit(report.sales as readonly ProfitSale[]);
  const ranked = productChartRows(report.sales as readonly ProfitSale[], kind);
  const points = timeChartRows(report.sales as readonly ProfitSale[], kind, grouping);
  const profit = kind === "profit";
  const title = profit ? "Profit Charts" : "Sales Charts";
  const errorId = kind + "-charts-period-error";
  const captionId = kind + "-charts-period-caption";
  const key = JSON.stringify(selection);
  const unavailable = profit ? totals.grossProfitPaise === null : totals.quantity === null;
  const highest = totals.grossProfitPaise === null ? "Not available"
    : ranked.length === 0 ? "No sales" : ranked[0].label + " - " + ranked[0].display;
  const summary = profit ? [
    { label: "Gross Profit (Rs.)", value: formatProfitMoney(totals.grossProfitPaise) },
    { label: "Cost of Sold Items (Rs.)", value: formatProfitMoney(totals.costOfGoodsSoldPaise) },
    { label: "Highest Profit Product", value: highest },
  ] : [
    { label: "Total Sales (Rs.)", value: formatProfitMoney(totals.revenuePaise) },
    { label: "Items Sold", value: totals.quantity === null ? "Not available" : totals.quantity + " units" },
    { label: "Different Products Sold", value: String(products.length) },
  ];
  const caption = period === "today" ? "Today: " + mockSalesBusinessDate.label
    : period === "monthly" ? "Selected month: " + formatMockReportMonth(month)
    : "From: " + formatMockBusinessDate(from) + " to " + formatMockBusinessDate(to);

  return <>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-3"><h1 className="page-title">{title}</h1><Badge>Demo Data</Badge></div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Demo today: {mockSalesBusinessDate.label} ({mockSalesBusinessDate.timeZone}).</p>
      </div>
      <Button asChild variant="outline"><Link href="/admin/reports">Back to Reports</Link></Button>
    </div>
    <div className="mb-3 flex flex-wrap items-start gap-3">
      <div className="w-full sm:w-56">
        <label htmlFor={kind + "-charts-period"} className="mb-2 block text-sm font-semibold">Reporting period</label>
        <Select id={kind + "-charts-period"} value={period} onChange={(event) => setPeriod(event.target.value as MockReportPeriod["kind"])}>
          <option value="today">Today</option><option value="monthly">Monthly</option><option value="custom">Custom Date Range</option>
        </Select>
      </div>
      {period === "monthly" && <div className="w-full sm:w-56">
        <label htmlFor={kind + "-charts-month"} className="mb-2 block text-sm font-semibold">Month and year</label>
        <Input id={kind + "-charts-month"} type="month" value={month} onChange={(event) => setMonth(event.target.value)}
          aria-invalid={Boolean(report.error)} aria-describedby={captionId + (report.error ? " " + errorId : "")} />
      </div>}
      {period === "custom" && <>
        <div className="w-full sm:w-56">
          <label htmlFor={kind + "-charts-from"} className="mb-2 block text-sm font-semibold">From Date</label>
          <Input id={kind + "-charts-from"} type="date" value={from} onChange={(event) => setFrom(event.target.value)}
            aria-invalid={Boolean(report.error)} aria-describedby={captionId + (report.error ? " " + errorId : "")} />
        </div>
        <div className="w-full sm:w-56">
          <label htmlFor={kind + "-charts-to"} className="mb-2 block text-sm font-semibold">To Date</label>
          <Input id={kind + "-charts-to"} type="date" value={to} onChange={(event) => setTo(event.target.value)}
            aria-invalid={Boolean(report.error)} aria-describedby={captionId + (report.error ? " " + errorId : "")} />
        </div>
      </>}
    </div>
    <p id={captionId} className="mb-4 text-sm text-muted-foreground">{report.error ? "Choose a valid reporting period." : caption + " (Asia/Karachi)"}</p>
    {report.error && <p id={errorId} role="alert" className="mb-4 rounded-md border border-danger bg-danger/10 p-3 text-sm text-danger">{report.error}</p>}
    <dl aria-label={profit ? "Profit summary" : "Sales summary"} className="mb-5 grid gap-3 md:grid-cols-3">
      {summary.map((item) => <div key={item.label} className="min-w-0 rounded-lg border bg-card p-4">
        <dt className="text-sm text-muted-foreground">{item.label}</dt>
        <dd className="numeric mt-2 break-words text-xl font-bold">{report.error ? "\u2014" : item.value}</dd>
      </div>)}
    </dl>
    {profit && <p className="mb-5 text-sm leading-6 text-muted-foreground">Purchase costs are fictional demo examples saved with each sale.</p>}
    {!report.error && unavailable && <p role="status" className="mb-4 text-sm leading-6 text-muted-foreground">
      Some sale values{profit ? " or historical costs" : ""} are missing or unsupported. Unavailable amounts are not treated as zero.
    </p>}
    {report.error ? <p className="rounded-md border bg-card p-4 text-sm">Choose a valid reporting period to view charts.</p> : <>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <SimpleBarChart key={key + "-products"} title={profit ? "Which Products Earned the Most Profit?" : "Which Products Sold the Most?"}
          rows={ranked} ranked unavailable={unavailable} measure={profit ? "money" : "quantity"} />
        <SimpleBarChart key={key + "-" + grouping} title={profit ? "Profit Over Time" : "Sales Over Time"} rows={points} variant="time" measure="money" grouping={grouping}
          controls={<div className="flex items-center gap-2">
            <label htmlFor={kind + "-charts-grouping"} className="text-sm font-medium">Show by</label>
            <Select id={kind + "-charts-grouping"} className="w-auto" value={grouping} onChange={(event) => setGrouping(event.target.value as ChartGrouping)}>
              <option value="daily">Daily</option><option value="monthly">Monthly</option>
            </Select>
          </div>} />
      </div>
    </>}
    <Button asChild variant="outline" className="mt-5"><Link href={profit ? "/admin/profit/today" : "/admin/sales/today"}>
      {profit ? "View Detailed Profit Report" : "View Detailed Sales Report"}
    </Link></Button>
    <p className="sr-only">Read-only Admin demo. No transactions or inventory changes. Real authentication and Admin authorization are not implemented.</p>
  </>;
}
