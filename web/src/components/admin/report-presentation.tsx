"use client";

import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SimpleBarChart } from "@/components/admin/simple-bar-chart";
import type { ProfitSale } from "@/lib/admin/mock-profit";
import { formatMockBusinessDate, formatMockReportMonth, type MockReportPeriod } from "@/lib/admin/mock-sales-report";
import { timeChartRows, type ChartGrouping, type ChartKind } from "@/lib/admin/report-chart-data";

type PeriodControlsProps = {
  kind: ChartKind;
  period: MockReportPeriod["kind"]; month: string; from: string; to: string; error?: string;
  onPeriodChange: (value: MockReportPeriod["kind"]) => void;
  onMonthChange: (value: string) => void; onFromChange: (value: string) => void; onToChange: (value: string) => void;
  detailsRef: RefObject<HTMLHeadingElement | null>;
};

export function ReportPeriodControls({ kind, period, month, from, to, error, onPeriodChange, onMonthChange, onFromChange, onToChange, detailsRef }: PeriodControlsProps) {
  return <div className="mb-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="w-48 max-w-full">
        <label htmlFor={kind + "-period"} className="mb-1.5 block text-sm font-medium">Reporting period</label>
        <Select id={kind + "-period"} value={period} onChange={(event) => onPeriodChange(event.target.value as MockReportPeriod["kind"])}>
          <option value="today">Today</option><option value="monthly">Monthly</option><option value="custom">Custom Date Range</option>
        </Select>
      </div>
      <Button onClick={() => {
        detailsRef.current?.scrollIntoView({ block: "start" });
        detailsRef.current?.focus({ preventScroll: true });
      }} aria-controls={kind === "sales" ? "sales-details" : "profit-details"}>View {kind === "sales" ? "Sales" : "Profit"} Details</Button>
    </div>
    {period !== "today" && <div className="mt-3 flex flex-wrap gap-3">
      {period === "monthly" ? <div className="w-full sm:w-56">
        <label htmlFor={kind + "-month"} className="mb-1.5 block text-sm font-medium">Month and year</label>
        <Input id={kind + "-month"} type="month" value={month} onChange={(event) => onMonthChange(event.target.value)}
          aria-invalid={Boolean(error)} aria-describedby={kind + "-month-readable" + (error ? " " + kind + "-period-error" : "")} />
        <p id={kind + "-month-readable"} className="mt-1 text-xs text-muted-foreground">Selected month: {formatMockReportMonth(month)}</p>
      </div> : <>
        <div className="w-full sm:w-56">
          <label htmlFor={kind + "-from"} className="mb-1.5 block text-sm font-medium">From Date</label>
          <Input id={kind + "-from"} type="date" value={from} onChange={(event) => onFromChange(event.target.value)}
            aria-invalid={Boolean(error)} aria-describedby={kind + "-from-readable" + (error ? " " + kind + "-period-error" : "")} />
          <p id={kind + "-from-readable"} className="mt-1 text-xs text-muted-foreground">From: {formatMockBusinessDate(from)}</p>
        </div>
        <div className="w-full sm:w-56">
          <label htmlFor={kind + "-to"} className="mb-1.5 block text-sm font-medium">To Date</label>
          <Input id={kind + "-to"} type="date" value={to} onChange={(event) => onToChange(event.target.value)}
            aria-invalid={Boolean(error)} aria-describedby={kind + "-to-readable" + (error ? " " + kind + "-period-error" : "")} />
          <p id={kind + "-to-readable"} className="mt-1 text-xs text-muted-foreground">To: {formatMockBusinessDate(to)}</p>
        </div>
      </>}
    </div>}
    {error && <p id={kind + "-period-error"} role="alert" className="mt-3 rounded-md border border-danger bg-danger/10 p-3 text-sm text-danger">{error}</p>}
  </div>;
}

export function ReportPeriodComparison({ kind, sales }: { kind: ChartKind; sales: readonly ProfitSale[] }) {
  const [grouping, setGrouping] = useState<ChartGrouping>("daily");
  const daily = timeChartRows(sales, kind, "daily");
  // A single genuine date is already identified in the report header. No fake trend.
  if (daily.length < 2) return null;
  return <details className="my-4 rounded-lg border bg-surface p-4">
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{kind === "sales" ? "Sales" : "Profit"} over time</summary>
    <SimpleBarChart title={kind === "sales" ? "Sales Over Time" : "Profit Over Time"} rows={timeChartRows(sales, kind, grouping)} variant="time" measure="money" grouping={grouping}
      controls={<div className="flex items-center gap-2">
        <label htmlFor={kind + "-grouping"} className="text-sm font-medium">Show by</label>
        <Select id={kind + "-grouping"} className="w-auto" value={grouping} onChange={(event) => setGrouping(event.target.value as ChartGrouping)}>
          <option value="daily">Daily</option><option value="monthly">Monthly</option>
        </Select>
      </div>} />
  </details>;
}
