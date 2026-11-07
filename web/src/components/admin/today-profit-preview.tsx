"use client";

import { useRef, useState } from "react";
import { ReportPeriodControls, ReportPeriodComparison } from "@/components/admin/report-presentation";
import { SimpleBarChart } from "@/components/admin/simple-bar-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { mockSalesBusinessDate } from "@/lib/admin/mock-sales";
import { aggregateMockProfit, calculateMockProfitTotals, formatProfitMoney, type ProfitSale } from "@/lib/admin/mock-profit";
import { selectMockSalesPeriod, type MockReportPeriod } from "@/lib/admin/mock-sales-report";
import { productChartRows } from "@/lib/admin/report-chart-data";

export function TodayProfitPreview({ sales }: { sales: readonly ProfitSale[] }) {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<MockReportPeriod["kind"]>("today");
  const [month, setMonth] = useState(mockSalesBusinessDate.iso.slice(0, 7));
  const [from, setFrom] = useState<string>(mockSalesBusinessDate.iso);
  const [to, setTo] = useState<string>(mockSalesBusinessDate.iso);
  const searchRef = useRef<HTMLInputElement>(null);
  const detailsRef = useRef<HTMLHeadingElement>(null);
  const selection: MockReportPeriod = period === "monthly" ? { kind: period, month }
    : period === "custom" ? { kind: period, from, to } : { kind: "today" };
  const report = selectMockSalesPeriod(sales, selection);
  const query = search.trim().toLowerCase();
  const filteredSales = report.sales.filter((sale) => sale.productName.toLowerCase().includes(query));
  const products = aggregateMockProfit(filteredSales);
  const total = calculateMockProfitTotals(report.sales);
  const selected = calculateMockProfitTotals(filteredSales);
  const ranked = productChartRows(report.sales, "profit");
  const highest = ranked[0];
  const reportKey = [period, month, from, to, query].join("|");

  return <section aria-labelledby="profit-breakdown-title" aria-describedby="profit-mock-notice">
    <h2 id="profit-breakdown-title" className="sr-only">Product-wise gross profit</h2>
    <p id="profit-mock-notice" className="sr-only">Read-only Admin UI preview. No transactions or inventory changes. Authentication and Admin authorization are not implemented.</p>
    <ReportPeriodControls kind="profit" period={period} month={month} from={from} to={to} error={report.error}
      onPeriodChange={setPeriod} onMonthChange={setMonth} onFromChange={setFrom} onToChange={setTo} detailsRef={detailsRef} />
    <dl aria-label="Gross profit totals" className="report-summary mb-4 grid gap-3 sm:grid-cols-3">
      <div><dt className="text-xs text-muted-foreground">Gross Profit</dt><dd className="numeric mt-1 break-words text-xl font-bold"><span>{report.error ? "—" : formatProfitMoney(total.grossProfitPaise)}</span></dd></div>
      <div><dt className="text-xs text-muted-foreground">Cost of Sold Items</dt><dd className="numeric mt-1 break-words text-xl font-bold"><span>{report.error ? "—" : formatProfitMoney(total.costOfGoodsSoldPaise)}</span></dd></div>
      <div><dt className="text-xs text-muted-foreground">Highest Profit Product</dt><dd className="mt-1 break-words text-base font-bold">{report.error ? "—" : total.grossProfitPaise === null ? "Not available" : !highest ? "No sales" : <><span className="block">{highest.label}</span><span className="numeric block text-sm">{highest.display}{highest.value !== null && highest.value < BigInt(0) ? " (Loss)" : ""}</span></>}</dd></div>
    </dl>
    {!report.error && report.sales.length > 0 && <p className="mb-3 text-xs leading-5 text-muted-foreground">
      {total.grossProfitPaise !== null ? <><span>Profit calculated using example purchase costs for demo sales.</span> Purchase costs are fictional demo examples saved with each sale. Gross profit excludes shop expenses.</>
        : (total.missingCostSales > 0 ? "Historical purchase costs are not recorded for all included sales." : "Some sale data cannot be calculated exactly at supported precision.") + " Missing or unsupported values are not treated as zero."}
    </p>}
    <SimpleBarChart key={reportKey} title="Profit by Product" description="Which products earned the most profit? Exact amounts are in Profit Details below."
      rows={productChartRows(filteredSales, "profit")} ranked initialShowAll measure="money" unavailable={Boolean(report.error) || total.grossProfitPaise === null}
      unavailableMessage={report.error ? "Choose a valid reporting period to compare profit." : undefined}
      emptyMessage={query ? "No matching products to compare." : "No product profit to compare."} />
    {!report.error && <ReportPeriodComparison kind="profit" sales={report.sales} />}
    <section id="profit-details" aria-labelledby="profit-details-title" className="summary-panel mt-4 p-4">
      <h2 id="profit-details-title" ref={detailsRef} tabIndex={-1} className="section-title mb-3 scroll-mt-6">Profit Details</h2>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-full sm:max-w-sm">
          <label htmlFor="profit-product-search" className="mb-1.5 block text-sm font-medium">Search by product name</label>
          <Input ref={searchRef} id="profit-product-search" type="search" autoComplete="off" placeholder="Find product by name..."
            value={search} onChange={(event) => setSearch(event.target.value)} aria-controls="profit-results" />
        </div>
        <Button variant="outline" onClick={() => { setSearch(""); searchRef.current?.focus(); }}>Clear search</Button>
      </div>
      <dl aria-label="Selected products gross profit" hidden={!query} className="mb-3 text-sm">
        <div><dt className="text-muted-foreground">Selected Products Gross Profit</dt><dd className="numeric font-semibold"><span>{report.error ? "—" : formatProfitMoney(selected.grossProfitPaise)}</span><span className="ml-2 text-xs font-normal text-muted-foreground">Matching product names · overall totals above include all products</span></dd></div>
      </dl>
      {!report.error && <p role="status" aria-atomic="true" className="mb-3 text-xs text-muted-foreground">Showing {products.length} of {new Set(report.sales.map((sale) => sale.productId)).size} products for this period.</p>}
      <div id="profit-results">
        {products.length > 0 ? <TableRegion label="Profit results">
          <Table className="min-w-[38rem]">
            <caption className="sr-only">Mock product-wise gross profit</caption>
            <thead><tr><TableHead>Product</TableHead><TableHead className="text-right">Sold</TableHead><TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Profit</TableHead></tr></thead>
            <tbody>{products.map((product) => <tr key={product.productId}>
              <th scope="row" className="h-14 border-t px-4 py-3 font-semibold">{product.productName}</th>
              <TableCell className="numeric text-right">{product.quantity ?? "Not available"}</TableCell>
              <TableCell className="numeric whitespace-nowrap text-right">{formatProfitMoney(product.revenuePaise)}</TableCell>
              <TableCell className="numeric whitespace-nowrap text-right">{formatProfitMoney(product.costOfGoodsSoldPaise)}</TableCell>
              <TableCell className={"numeric whitespace-nowrap text-right font-semibold " + (product.grossProfitPaise === null ? "text-muted-foreground" : product.grossProfitPaise < BigInt(0) ? "text-danger" : "text-success")}>{formatProfitMoney(product.grossProfitPaise)}{product.grossProfitPaise !== null && product.grossProfitPaise < BigInt(0) ? " (Loss)" : ""}</TableCell>
            </tr>)}</tbody>
          </Table>
        </TableRegion> : <p className="rounded-md border bg-surface p-4 text-sm">{report.error ? "Choose a valid reporting period to view profit." : report.sales.length === 0 ? "No sales for this period." : "No products match your search in this period."}</p>}
      </div>
    </section>
  </section>;
}
