import { useId } from "react";
import { chartAxis, chartCoordinate, chartDateOrdinal, type ChartMeasure } from "@/lib/admin/chart-axis";
import { chartWidthPercent, type ChartGrouping, type ChartRow } from "@/lib/admin/report-chart-data";
import { formatMockReportMonth } from "@/lib/admin/mock-sales-report";

function ProductComparison({ title, rows, scaleRows }: {
  title: string; rows: readonly ChartRow[]; scaleRows: readonly ChartRow[];
}) {
  const signed = scaleRows.some((row) => row.value !== null && row.value < BigInt(0));
  const maximum = scaleRows.reduce((largest, row) => {
    const value = row.value === null ? BigInt(0) : row.value < BigInt(0) ? -row.value : row.value;
    return value > largest ? value : largest;
  }, BigInt(0));

  return <ol aria-label={title + " values"} className="grid gap-4">
    {rows.map((row) => {
      const negative = row.value !== null && row.value < BigInt(0);
      return <li key={row.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(7rem,1fr)_minmax(6rem,2fr)_7rem]">
        <span className="min-w-0 break-words text-sm font-medium">{row.label}</span>
        <div aria-hidden="true" className="relative col-span-2 row-start-2 h-4 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          {signed && <span data-zero-baseline="" className="absolute inset-y-0 left-1/2 border-l border-muted-foreground" />}
          {row.value !== null && <span data-comparison-bar={row.id}
            className={"absolute inset-y-0 rounded-sm " + (negative ? "bg-danger" : "bg-primary")}
            style={{
              width: chartWidthPercent(row.value, maximum) / (signed ? 2 : 1) + "%",
              ...(signed ? negative ? { right: "50%" } : { left: "50%" } : { left: 0 }),
            }} />}
        </div>
        <span className={"numeric col-start-2 row-start-1 min-w-0 text-right text-sm font-semibold [overflow-wrap:anywhere] sm:col-start-3 " + (negative ? "text-danger" : "")}>
          {row.display}{negative ? " (Loss)" : ""}
        </span>
      </li>;
    })}
  </ol>;
}

function readablePeriod(row: ChartRow, grouping: ChartGrouping) {
  return grouping === "daily" && chartDateOrdinal(row.id, grouping) !== null
    ? Number(row.id.slice(8)) + " " + formatMockReportMonth(row.id.slice(0, 7))
    : row.label;
}

function HistoryComparison({ title, rows, scaleRows, measure, grouping }: {
  title: string; rows: readonly ChartRow[]; scaleRows: readonly ChartRow[];
  measure: ChartMeasure; grouping: ChartGrouping;
}) {
  const id = useId();
  const validPeriods = (entries: readonly ChartRow[]) => new Set(entries
    .filter((row) => row.value !== null && chartDateOrdinal(row.id, grouping) !== null).map((row) => row.id)).size;
  const canCompare = validPeriods(rows) >= 2;
  const dates = rows.map((row) => chartDateOrdinal(row.id, grouping));
  const canDraw = canCompare && dates.every((date) => date !== null);
  const axis = chartAxis(scaleRows, measure);
  const start = dates[0] ?? 0, end = dates[dates.length - 1] ?? 0;
  const signed = scaleRows.some((row) => row.value !== null && row.value < BigInt(0));
  const valueLabel = title.startsWith("Profit") ? "Gross Profit" : "Total Sales";
  const points = rows.map((row, index) => ({
    row,
    x: end === start ? 250 : 12 + ((dates[index] ?? start) - start) / (end - start) * 476,
    y: row.value === null ? null : 154 - chartCoordinate(row.value, axis, 138),
  }));

  return <>
    {canDraw && <svg role="img" aria-labelledby={id + "-title"} aria-describedby={id + "-description"}
      viewBox="0 0 500 170" className="mb-4 block h-auto max-h-48 w-full text-foreground">
      <title id={id + "-title"}>{title + " trend"}</title>
      <desc id={id + "-description"}>Changes between recorded dates only. Every date and exact value is listed below. Missing values are not joined.</desc>
      {signed && <line data-zero-baseline="" x1="12" x2="488"
        y1={154 - chartCoordinate(BigInt(0), axis, 138)} y2={154 - chartCoordinate(BigInt(0), axis, 138)}
        stroke="currentColor" strokeOpacity="0.4" />}
      {points.map((point, index) => {
        const previous = points[index - 1];
        return point.y !== null && previous?.y !== null && previous?.y !== undefined
          ? <line key={point.row.id} data-trend-segment="" x1={previous.x} y1={previous.y} x2={point.x} y2={point.y}
            stroke="var(--primary)" strokeWidth="2.5" /> : null;
      })}
      {points.map((point) => point.y !== null && <circle key={point.row.id} data-chart-point={point.row.id} cx={point.x} cy={point.y} r="4"
        fill={point.row.value !== null && point.row.value < BigInt(0) ? "var(--danger)" : "var(--primary)"} />)}
    </svg>}
    <ol aria-label={title + " values"} className="grid gap-3">
      {rows.map((row) => <li key={row.id} className="min-w-0 rounded-md bg-muted/40 p-3">
        <p className="text-sm font-medium">{readablePeriod(row, grouping)}</p>
        <p className="mt-1 text-sm">{valueLabel}: <span className={"numeric break-words font-semibold " + (row.value !== null && row.value < BigInt(0) ? "text-danger" : "")}>
          {row.display}{row.value !== null && row.value < BigInt(0) ? " (Loss)" : ""}
        </span></p>
      </li>)}
    </ol>
    {!canCompare && <p className="mt-3 text-sm leading-6 text-muted-foreground">
      {validPeriods(scaleRows) < 2 ? "More sales dates are needed to compare " + (valueLabel === "Gross Profit" ? "profit" : "sales") + " over time."
        : "This page has fewer than two recorded values to compare."}
    </p>}
  </>;
}

export function ReportChartGraphic({ variant, ...props }: {
  title: string; rows: readonly ChartRow[]; scaleRows: readonly ChartRow[];
  measure: ChartMeasure; variant: "bar" | "time"; grouping: ChartGrouping;
}) {
  return variant === "bar" ? <ProductComparison {...props} /> : <HistoryComparison {...props} />;
}
