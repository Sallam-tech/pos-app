import { useEffect, useId, useRef, useState } from "react";
import { chartAxis, chartCoordinate, chartDateOrdinal, chartTick, type ChartMeasure } from "@/lib/admin/chart-axis";
import { type ChartGrouping, type ChartRow } from "@/lib/admin/report-chart-data";
import { formatMockReportMonth } from "@/lib/admin/mock-sales-report";

function ProductComparison({ title, rows, scaleRows, measure }: {
  title: string; rows: readonly ChartRow[]; scaleRows: readonly ChartRow[]; measure: ChartMeasure;
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(800);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measureWidth = () => { if (element.clientWidth > 0) setAvailableWidth(Math.round(element.clientWidth)); };
    measureWidth();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const axis = chartAxis(scaleRows, measure);
  const labelLines = (label: string) => {
    const lines: string[] = [];
    for (const word of label.split(" ")) {
      for (const chunk of word.match(/.{1,13}/gu) ?? []) {
        const last = lines.length - 1;
        if (last >= 0 && (lines[last] + " " + chunk).length <= 13) lines[last] += " " + chunk;
        else lines.push(chunk);
      }
    }
    return lines;
  };
  const left = Math.max(100, ...axis.ticks.map((tick) => (chartTick(tick, measure).length + (measure === "money" ? 4 : 0)) * 7 + 16));
  const minimumSlot = Math.max(92, ...rows.map((row) => row.display.length * 7 + 20));
  const width = Math.max(640, rows.length * minimumSlot + left + 16, availableWidth);
  const height = Math.max(330, 318 + Math.max(1, ...rows.map((row) => labelLines(row.label).length)) * 16);
  const right = width - 16, top = 28, bottom = 260;
  const y = (value: bigint) => bottom - chartCoordinate(value, axis, bottom - top);
  const zero = y(BigInt(0));
  const slot = (right - left) / Math.max(1, rows.length);
  const barWidth = Math.min(110, slot * 0.78);

  return <>
    <div ref={container} role="region" aria-label={title + " chart area"} tabIndex={0} className="max-w-full overflow-x-auto rounded-md">
      <svg role="img" aria-labelledby={id + "-title"} aria-describedby={id + "-description"}
        viewBox={"0 0 " + width + " " + height} height={height} className="block w-full text-foreground" style={{ minWidth: width }}>
        <title id={id + "-title"}>{title + " chart"}</title>
        <desc id={id + "-description"}>Vertical product comparison. {measure === "money" ? "Amounts in Pakistani Rupees." : "Quantity sold."} Exact values are printed above each bar and available in the product details. Losses extend below zero.</desc>
        <g data-axis={measure === "money" ? "PKR" : "quantity"}>
          {axis.ticks.map((tick) => <g key={tick.toString()}>
            <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeDasharray={tick === BigInt(0) ? undefined : "3 5"} />
            <text x={left - 12} y={y(tick)} textAnchor="end" dominantBaseline="middle" fill="var(--muted-foreground)" fontSize="12">{(measure === "money" ? "Rs. " : "") + chartTick(tick, measure)}</text>
          </g>)}
        </g>
        <line data-zero-baseline="" x1={left} x2={right} y1={zero} y2={zero} stroke="var(--muted-foreground)" strokeOpacity="0.6" />
        {rows.map((row, index) => {
          const center = left + slot * (index + 0.5);
          const negative = row.value !== null && row.value < BigInt(0);
          const position = row.value === null ? zero : y(row.value);
          const labels = labelLines(row.label);
          return <g key={row.id} tabIndex={0} aria-label={row.label + ": " + row.display + (negative ? " (Loss)" : "")}>
            <title>{row.label + ": " + row.display + (negative ? " (Loss)" : "")}</title>
            {row.value !== null && (row.value === BigInt(0)
              ? <line data-zero-value={row.id} x1={center - barWidth / 2} x2={center + barWidth / 2} y1={zero} y2={zero} stroke="var(--report-bar, #2c5b9b)" strokeWidth="2" />
              : <rect data-comparison-bar={row.id} x={center - barWidth / 2} y={Math.min(zero, position)} width={barWidth} height={Math.abs(zero - position)} rx="5" fill={negative ? "var(--danger)" : "var(--report-bar, #2c5b9b)"} />)}
            <text x={center} y={negative ? position + 17 : position - 9} textAnchor="middle" fill={negative ? "var(--danger)" : "var(--foreground)"} fontSize="12" fontWeight="600">{row.display}</text>
            <text x={center} y="300" textAnchor="middle" fill="var(--foreground)" fontSize="13">
              {labels.map((label, line) => <tspan key={line} x={center} dy={line === 0 ? 0 : 16}>{label}</tspan>)}
            </text>
          </g>;
        })}
      </svg>
    </div>
    <ol aria-label={title + " values"} className="sr-only">
      {rows.map((row) => <li key={row.id}>{row.label}: {row.display}{row.value !== null && row.value < BigInt(0) ? " (Loss)" : ""}</li>)}
    </ol>
  </>;
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
