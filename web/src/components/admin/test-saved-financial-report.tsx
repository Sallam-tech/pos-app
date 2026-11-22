"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ReportPeriodControls } from "@/components/admin/report-presentation";
import { SimpleBarChart } from "@/components/admin/simple-bar-chart";
import { TestSavedFinancialReportProducts } from "@/components/admin/test-reports";
import { PageHeading } from "@/components/shell/page-heading";
import { reportFetch, monthRange, type Overview } from "@/lib/reports/client";
import { today } from "@/lib/expenses/client";
import type { ChartRow } from "@/lib/admin/report-chart-data";
import type { MockReportPeriod } from "@/lib/admin/mock-sales-report";
import "@/app/admin/reports/reports.css";

type ReportKind = "sales" | "profit";

function reportMoney(value: string | null | undefined) {
  if (value == null) return "Not available";
  const amount = BigInt(value);
  const absolute = amount < BigInt(0) ? -amount : amount;
  const whole = (absolute / BigInt(100)).toLocaleString("en-US");
  const fraction = (absolute % BigInt(100)).toString().padStart(2, "0");
  return (amount < BigInt(0) ? "-" : "") + "Rs. " + whole + "." + fraction;
}

function businessDate(value: string) {
  return new Intl.DateTimeFormat("en-PK", { timeZone: "UTC", dateStyle: "medium" })
    .format(new Date(value + "T12:00:00Z"));
}

export function TestSavedFinancialReport({ kind }: { kind: ReportKind }) {
  const initialDate = today();
  const [period, setPeriod] = useState<MockReportPeriod["kind"]>("today");
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [from, setFrom] = useState(initialDate);
  const [to, setTo] = useState(initialDate);
  const [report, setReport] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [search, setSearch] = useState("");
  const generation = useRef(0);
  const detailsRef = useRef<HTMLHeadingElement>(null);

  async function load(start: string, end: string) {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const result = await reportFetch<Overview>("overview", new URLSearchParams({ from: start, to: end }));
      if (generation.current === current) setReport(result);
    } catch (reason) {
      if (generation.current === current) setError((reason as Error).message);
    } finally {
      if (generation.current === current) setBusy(false);
    }
  }

  const loadToday = useEffectEvent(() => {
    const date = today();
    setFrom(date);
    setTo(date);
    void load(date, date);
  });
  const invalidate = useEffectEvent(() => { generation.current++; });
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) loadToday(); });
    return () => { active = false; invalidate(); };
  }, []);

  function showInvalidPeriod(message: string) {
    generation.current++;
    setReport(null);
    setBusy(false);
    setError(message);
  }

  function changePeriod(value: MockReportPeriod["kind"]) {
    setPeriod(value);
    if (value === "today") {
      const date = today();
      setFrom(date);
      setTo(date);
      void load(date, date);
    } else if (value === "monthly") {
      try {
        const range = monthRange(month);
        setFrom(range.from);
        setTo(range.to);
        void load(range.from, range.to);
      } catch (reason) {
        showInvalidPeriod((reason as Error).message);
      }
    } else {
      void load(from, to);
    }
  }

  function changeMonth(value: string) {
    setMonth(value);
    try {
      const range = monthRange(value);
      setFrom(range.from);
      setTo(range.to);
      void load(range.from, range.to);
    } catch (reason) {
      showInvalidPeriod((reason as Error).message);
    }
  }

  const allProducts = report?.products ?? [];
  const filteredProducts = allProducts.filter((product) =>
    product.name.toLowerCase().includes(search.trim().toLowerCase()));
  const chartRows: ChartRow[] = filteredProducts.map((product) => {
    const amount = kind === "sales" ? product.revenuePaisa : product.grossProfitPaisa;
    return { id: product.id, label: product.name, value: BigInt(amount), display: reportMoney(amount) };
  }).sort((a, b) => a.value === b.value ? a.label.localeCompare(b.label) : a.value > b.value ? -1 : 1);
  const complete = Boolean(report?.financialComplete);
  const highest = allProducts.reduce<typeof allProducts[number] | null>((best, product) =>
    best === null || BigInt(product.grossProfitPaisa) > BigInt(best.grossProfitPaisa) ? product : best, null);
  const title = kind === "sales" ? "Sales Report" : "Profit Report";
  const dateContext = report
    ? report.from === report.to
      ? "Today: " + businessDate(report.from) + " (Asia/Karachi)."
      : businessDate(report.from) + " – " + businessDate(report.to) + " (Asia/Karachi)."
    : "Saved shop records · Asia/Karachi";

  return <div className="reports-workspace">
    <div className="mb-4">
      <PageHeading route={"/admin/reports/" + kind}>{title}</PageHeading>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{dateContext}</p>
    </div>
    <ReportPeriodControls kind={kind} period={period} month={month} from={from} to={to} error={error || undefined}
      onPeriodChange={changePeriod} onMonthChange={changeMonth}
      onFromChange={(value) => { setFrom(value); void load(value, to); }}
      onToChange={(value) => { setTo(value); void load(from, value); }}
      detailsRef={detailsRef} />
    {kind === "sales" ? <dl aria-label="Revenue totals" className="report-summary mb-4 grid gap-3 sm:grid-cols-3">
      <div><dt className="text-xs text-muted-foreground">Total Sales</dt><dd className="numeric mt-1 break-words text-xl font-bold">{complete ? reportMoney(report!.revenuePaisa) : busy ? "Loading…" : "Unavailable"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Items Sold</dt><dd className="numeric mt-1 text-xl font-bold">{complete ? report!.netQuantity : busy ? "Loading…" : "Unavailable"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Products Sold</dt><dd className="numeric mt-1 text-xl font-bold">{complete ? report!.activeProducts : busy ? "Loading…" : "Unavailable"}</dd></div>
    </dl> : <dl aria-label="Gross profit totals" className="report-summary mb-4 grid gap-3 sm:grid-cols-3">
      <div><dt className="text-xs text-muted-foreground">Gross Profit</dt><dd className="numeric mt-1 break-words text-xl font-bold">{complete ? reportMoney(report!.grossProfitPaisa) : busy ? "Loading…" : "Unavailable"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Cost of Sold Items</dt><dd className="numeric mt-1 break-words text-xl font-bold">{complete ? reportMoney(report!.cogsPaisa) : busy ? "Loading…" : "Unavailable"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Highest Profit Product</dt><dd className="mt-1 break-words text-base font-bold">
        {!complete ? busy ? "Loading…" : "Unavailable" : !report?.productComparisonComplete ? "Unavailable" : highest ? <><span className="block">{highest.name}</span><span className="numeric block text-sm">{reportMoney(highest.grossProfitPaisa)}</span></> : "No sales"}
      </dd></div>
    </dl>}
    {kind === "profit" && complete && report!.products.length > 0 && <p className="mb-3 text-xs leading-5 text-muted-foreground">
      Gross profit uses the purchase cost recorded with each sale and excludes shop expenses.
    </p>}
    <SimpleBarChart title={kind === "sales" ? "Sales by Product" : "Profit by Product"}
      description={kind === "sales"
        ? "Which products brought in the most money? Exact amounts are in Sales Details below."
        : "Which products earned the most profit? Exact amounts are in Profit Details below."}
      rows={chartRows} ranked initialShowAll measure="money"
      unavailable={!report || !report.financialComplete || !report.productComparisonComplete}
      unavailableMessage={busy
        ? "Loading report…"
        : !report?.financialComplete
        ? "Recorded values are unavailable for this period."
        : "Product comparison is unavailable for this period. Narrow the date range."}
      emptyMessage={search.trim() ? "No matching products to compare." : "No product sales to compare."} />
    {report?.snapshot && report.productPage && <TestSavedFinancialReportProducts
      key={report.snapshot + report.from + report.to + report.asOfMs}
      period={report} initial={report.productPage} mode={kind} search={search}
      onSearchChange={setSearch} detailsRef={detailsRef} showHistory={false} money={reportMoney} />}
  </div>;
}
