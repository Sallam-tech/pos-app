"use client";

import { useRef, useState } from "react";
import { ProductSalesRows } from "@/components/admin/product-sales-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableHead, TableRegion } from "@/components/ui/table";
import { aggregateMockSales, formatMockRevenue, getMockRevenuePaise, mockRevenueDecimal, mockSalesBusinessDate, type MockSale } from "@/lib/admin/mock-sales";
import { formatMockBusinessDate, formatMockReportMonth, selectMockSalesPeriod, type MockReportPeriod } from "@/lib/admin/mock-sales-report";

export function TodaySalesPreview({ sales }: { sales: readonly MockSale[] }) {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<MockReportPeriod["kind"]>("today");
  const [month, setMonth] = useState(mockSalesBusinessDate.iso.slice(0, 7));
  const [from, setFrom] = useState<string>(mockSalesBusinessDate.iso);
  const [to, setTo] = useState<string>(mockSalesBusinessDate.iso);
  const searchRef = useRef<HTMLInputElement>(null);
  const selection: MockReportPeriod = period === "monthly" ? { kind: period, month }
    : period === "custom" ? { kind: period, from, to } : { kind: "today" };
  const report = selectMockSalesPeriod(sales, selection);
  const products = aggregateMockSales(report.sales);
  const query = search.trim().toLowerCase();
  const filtered = products.filter((product) => product.productName.toLowerCase().includes(query));
  const totalRevenue = getMockRevenuePaise(report.sales);
  const selectedRevenue = filtered.reduce((total, product) => total + product.revenuePaise, BigInt(0));
  const reportKey = [period, month, from, to, query].join("|");

  function clearSearch() {
    setSearch("");
    searchRef.current?.focus();
  }

  return <section aria-labelledby="revenue-breakdown-title" aria-describedby="revenue-mock-notice">
    <h2 id="revenue-breakdown-title" className="sr-only">Product-wise revenue</h2>
    <p id="revenue-mock-notice" className="sr-only">Read-only mock revenue. No transactions are recorded and no inventory is changed.</p>
    <div className="mb-5 flex flex-wrap items-start gap-3">
      <div className="w-full sm:w-56">
        <label htmlFor="sales-period" className="mb-2 block text-sm font-semibold">Reporting period</label>
        <Select id="sales-period" value={period} onChange={(event) => setPeriod(event.target.value as MockReportPeriod["kind"])}>
          <option value="today">Today</option>
          <option value="monthly">Monthly</option>
          <option value="custom">Custom Date Range</option>
        </Select>
      </div>
      {period === "monthly" && <div className="w-full sm:w-56">
        <label htmlFor="sales-month" className="mb-2 block text-sm font-semibold">Month and year</label>
        <Input id="sales-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)}
          aria-invalid={Boolean(report.error)} aria-describedby={"sales-month-readable" + (report.error ? " sales-period-error" : "")} />
        <p id="sales-month-readable" className="mt-2 text-sm text-muted-foreground">Selected month: {formatMockReportMonth(month)}</p>
      </div>}
      {period === "custom" && <>
        <div className="w-full sm:w-56">
          <label htmlFor="sales-from" className="mb-2 block text-sm font-semibold">From Date</label>
          <Input id="sales-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)}
            aria-invalid={Boolean(report.error)} aria-describedby={"sales-from-readable" + (report.error ? " sales-period-error" : "")} />
          <p id="sales-from-readable" className="mt-2 text-sm text-muted-foreground">From: {formatMockBusinessDate(from)}</p>
        </div>
        <div className="w-full sm:w-56">
          <label htmlFor="sales-to" className="mb-2 block text-sm font-semibold">To Date</label>
          <Input id="sales-to" type="date" value={to} onChange={(event) => setTo(event.target.value)}
            aria-invalid={Boolean(report.error)} aria-describedby={"sales-to-readable" + (report.error ? " sales-period-error" : "")} />
          <p id="sales-to-readable" className="mt-2 text-sm text-muted-foreground">To: {formatMockBusinessDate(to)}</p>
        </div>
      </>}
    </div>
    {report.error && <p id="sales-period-error" role="alert" className="mb-5 rounded-md border border-danger bg-danger/10 p-3 text-sm text-danger">{report.error}</p>}
    <dl aria-label="Revenue totals" className="mb-5 grid gap-4 sm:grid-cols-2">
      <div className="min-w-0 rounded-md border bg-card px-4 py-3"><dt className="text-sm text-muted-foreground">Total Sales Revenue</dt>
        <dd className="numeric mt-1 break-words text-xl font-bold">{report.error ? "—" : <data value={mockRevenueDecimal(totalRevenue)}>{formatMockRevenue(totalRevenue)}</data>}<span className="mt-1 block text-xs font-normal text-muted-foreground">{report.error ? "Valid reporting period required" : "All sales in selected period"}</span></dd>
      </div>
      <div className="min-w-0 rounded-md border bg-card px-4 py-3"><dt className="text-sm text-muted-foreground">Selected Products Revenue</dt>
        <dd className="numeric mt-1 break-words text-xl font-bold">{report.error ? "—" : <data value={mockRevenueDecimal(selectedRevenue)}>{formatMockRevenue(selectedRevenue)}</data>}<span className="mt-1 block text-xs font-normal text-muted-foreground">{report.error ? "Valid reporting period required" : query ? "Matching product names" : "All products"}</span></dd>
      </div>
    </dl>
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full sm:max-w-sm">
        <label htmlFor="sales-product-search" className="mb-2 block text-sm font-semibold">Search by product name</label>
        <Input ref={searchRef} id="sales-product-search" type="search" autoComplete="off" placeholder="e.g. Diapers"
          value={search} onChange={(event) => setSearch(event.target.value)} aria-controls="revenue-results" />
      </div>
      <Button variant="outline" onClick={clearSearch}>Clear search</Button>
    </div>
    {!report.error && <p role="status" aria-atomic="true" className="mb-3 mt-4 text-sm text-muted-foreground">Showing {filtered.length} of {products.length} products for this period.</p>}
    <div id="revenue-results">
      {filtered.length > 0 ? <TableRegion label="Revenue results">
        <Table className="min-w-[32rem]">
          <caption className="sr-only">Mock product-wise sales revenue</caption>
          <thead><tr>
            <TableHead>Product Name</TableHead>
            <TableHead className="text-right">Quantity Sold</TableHead>
            <TableHead className="text-right">Total Revenue (PKR)</TableHead>
            <TableHead className="relative text-right"><span className="sr-only">Sale details</span></TableHead>
          </tr></thead>
          <tbody>{filtered.map((product) => <ProductSalesRows key={reportKey + "|" + product.productId} product={product}
            sales={report.sales.filter((sale) => sale.productId === product.productId)} />)}</tbody>
        </Table>
      </TableRegion> : <p className="rounded-md border bg-card p-4 text-sm">{report.error ? "Choose a valid reporting period to view sales." : report.sales.length === 0 ? "No sales found for this period." : "No products match your search in this period."}</p>}
    </div>
  </section>;
}
