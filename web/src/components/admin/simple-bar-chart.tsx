"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ReportChartGraphic } from "@/components/admin/report-chart-graphic";
import type { ChartMeasure } from "@/lib/admin/chart-axis";
import type { ChartGrouping, ChartRow } from "@/lib/admin/report-chart-data";

const pageSize = 10;

export function SimpleBarChart({ title, rows, ranked = false, controls, unavailable = false, measure = "quantity", variant = "bar", grouping = "daily" }: {
  title: string; rows: readonly ChartRow[]; ranked?: boolean; controls?: ReactNode; unavailable?: boolean;
  measure?: ChartMeasure; variant?: "bar" | "time"; grouping?: ChartGrouping;
}) {
  const id = useId();
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(0);
  const available = ranked && !showAll ? rows.slice(0, 5) : rows;
  const pageCount = Math.max(1, Math.ceil(available.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = available.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  return <Card role="region" aria-labelledby={id} className="flex flex-col">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <CardTitle id={id}>{title}</CardTitle>
      {controls}
      {ranked && !unavailable && rows.length > 5 && <Button variant="outline" aria-pressed={showAll}
        onClick={() => { setShowAll(!showAll); setPage(0); }}>{showAll ? "Show Top 5" : "Show All"}</Button>}
    </div>
    {unavailable ? <p className="text-sm leading-6 text-muted-foreground">Not available. Some values are missing or unsupported, so products cannot be compared.</p>
      : rows.length === 0 ? <p className="text-sm text-muted-foreground">No sales for this period.</p>
      : <>
        <ReportChartGraphic title={title} rows={visible} scaleRows={rows} measure={measure} variant={variant} grouping={grouping} />
        {ranked && <p className="mt-4 text-xs leading-5 text-muted-foreground">{showAll ? "All products" : "Top 5 products"}</p>}
        {pageCount > 1 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-sm text-muted-foreground">Page {currentPage + 1} of {pageCount}</p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button>
            <Button variant="outline" disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button>
          </div>
        </div>}
      </>}
  </Card>;
}
