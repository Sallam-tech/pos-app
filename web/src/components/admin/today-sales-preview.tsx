"use client";

import { useRef, useState } from "react";
import { ProductSalesRows } from "@/components/admin/product-sales-rows";
import { ReportPeriodControls, ReportPeriodComparison } from "@/components/admin/report-presentation";
import { SimpleBarChart } from "@/components/admin/simple-bar-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHead, TableRegion } from "@/components/ui/table";
import { aggregateMockSales, formatMockRevenue, getMockRevenuePaise, mockRevenueDecimal, mockSalesBusinessDate, type MockSale } from "@/lib/admin/mock-sales";
import { calculateMockProfitTotals } from "@/lib/admin/mock-profit";
import { selectMockSalesPeriod, type MockReportPeriod } from "@/lib/admin/mock-sales-report";

export function TodaySalesPreview({ sales }: { sales: readonly MockSale[] }) {
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
  const products = aggregateMockSales(report.sales);
  const query = search.trim().toLowerCase();
  const filtered = products.filter((product) => product.productName.toLowerCase().includes(query));
  const totalRevenue = getMockRevenuePaise(report.sales);
  const selectedRevenue = filtered.reduce((total, product) => total + product.revenuePaise, BigInt(0));
  const reportKey = [period, month, from, to, query].join("|");
  const quantity = calculateMockProfitTotals(report.sales).quantity;
  // Chart values come directly from the existing exact revenue aggregates, never quantities.
  const chartRows = filtered.map((product) => ({ id: product.productId, label: product.productName,
    value: product.revenuePaise, display: formatMockRevenue(product.revenuePaise) }))
    .sort((a, b) => a.value === b.value ? a.label.localeCompare(b.label) : a.value > b.value ? -1 : 1);

  function clearSearch() {
    setSearch("");
    searchRef.current?.focus();
  }

  return <section aria-labelledby="revenue-breakdown-title" aria-describedby="revenue-mock-notice">
    <h2 id="revenue-breakdown-title" className="sr-only">Product-wise revenue</h2>
    <p id="revenue-mock-notice" className="sr-only">Read-only mock revenue. No transactions are recorded and no inventory is changed.</p>
    <ReportPeriodControls kind="sales" period={period} month={month} from={from} to={to} error={report.error}
      onPeriodChange={setPeriod} onMonthChange={setMonth} onFromChange={setFrom} onToChange={setTo} detailsRef={detailsRef} />
    <dl aria-label="Revenue totals" className="report-summary mb-4 grid gap-3 sm:grid-cols-3">
      <div><dt className="text-xs text-muted-foreground">Total Sales</dt><dd className="numeric mt-1 break-words text-xl font-bold">{report.error ? "—" : <data value={mockRevenueDecimal(totalRevenue)}>{formatMockRevenue(totalRevenue)}</data>}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Items Sold</dt><dd className="numeric mt-1 text-xl font-bold">{report.error ? "—" : quantity ?? "Not available"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Products Sold</dt><dd className="numeric mt-1 text-xl font-bold">{report.error ? "—" : products.length}</dd></div>
    </dl>
    <SimpleBarChart key={reportKey} title="Sales by Product" description="Which products brought in the most money? Exact amounts are in Sales Details below."
      rows={chartRows} ranked initialShowAll measure="money" unavailable={Boolean(report.error)}
      unavailableMessage="Choose a valid reporting period to compare sales." emptyMessage={query ? "No matching products to compare." : "No product sales to compare."} />
    {!report.error && <ReportPeriodComparison kind="sales" sales={report.sales} />}
    <section id="sales-details" aria-labelledby="sales-details-title" className="summary-panel mt-4 p-4">
      <h2 id="sales-details-title" ref={detailsRef} tabIndex={-1} className="section-title mb-3 scroll-mt-6">Sales Details</h2>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-full sm:max-w-sm">
          <label htmlFor="sales-product-search" className="mb-1.5 block text-sm font-medium">Search by product name</label>
          <Input ref={searchRef} id="sales-product-search" type="search" autoComplete="off" placeholder="Find product by name..."
            value={search} onChange={(event) => setSearch(event.target.value)} aria-controls="revenue-results" />
        </div>
        <Button variant="outline" onClick={clearSearch}>Clear search</Button>
      </div>
      <dl aria-label="Selected products revenue" hidden={!query} className="mb-3 text-sm">
        <div><dt className="text-muted-foreground">Selected Products Revenue</dt><dd className="numeric font-semibold">{report.error ? "—" : formatMockRevenue(selectedRevenue)}<span className="ml-2 text-xs font-normal text-muted-foreground">Matching product names · overall totals above include all products</span></dd></div>
      </dl>
      {!report.error && <p role="status" aria-atomic="true" className="mb-3 text-xs text-muted-foreground">Showing {filtered.length} of {products.length} products for this period.</p>}
      <div id="revenue-results">
        {filtered.length > 0 ? <TableRegion label="Revenue results">
          <Table className="min-w-[32rem]">
            <caption className="sr-only">Mock product-wise sales revenue</caption>
            <thead><tr><TableHead className="w-1/2">Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Total Sales</TableHead></tr></thead>
            <tbody>{filtered.map((product) => <ProductSalesRows key={reportKey + "|" + product.productId} product={product}
              sales={report.sales.filter((sale) => sale.productId === product.productId)} />)}</tbody>
          </Table>
        </TableRegion> : <p className="rounded-md border bg-surface p-4 text-sm">{report.error ? "Choose a valid reporting period to view sales." : report.sales.length === 0 ? "No sales found for this period." : "No products match your search in this period."}</p>}
      </div>
    </section>
  </section>;
}
