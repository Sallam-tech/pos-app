"use client";

import { PageHeading } from "@/components/shell/page-heading";
import "@/app/admin/reports/reports.css";
import { TodaySalesPreview } from "@/components/admin/today-sales-preview";
import { TodayProfitPreview } from "@/components/admin/today-profit-preview";
import { Badge } from "@/components/ui/badge";
import type { ProfitSale } from "@/lib/admin/mock-profit";
import { mockSalesBusinessDate } from "@/lib/admin/mock-sales";
import type { ChartKind } from "@/lib/admin/report-chart-data";

// Both canonical report routes and their older URLs render this same report.
export function ReportChartsPreview({ kind, sales }: { kind: ChartKind; sales: readonly ProfitSale[] }) {
  return <div className="reports-workspace">
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3"><PageHeading route={"/admin/reports/" + kind}>{kind === "sales" ? "Sales Report" : "Profit Report"}</PageHeading><Badge>Demo Data</Badge></div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Fixed demo Today: <time dateTime={mockSalesBusinessDate.iso}>{mockSalesBusinessDate.label}</time> ({mockSalesBusinessDate.timeZone}). Fixed examples, not live sales.</p>
    </div>
    {kind === "sales" ? <TodaySalesPreview sales={sales} /> : <TodayProfitPreview sales={sales} />}
    <p className="sr-only">Read-only Admin demo. No transactions or inventory changes. Real authentication and Admin authorization are not implemented.</p>
  </div>;
}
