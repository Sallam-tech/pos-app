"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { mockSalesBusinessDate } from "@/lib/admin/mock-sales";
import { aggregateMockProfit, calculateMockProfitTotals, formatProfitMoney, type ProfitSale } from "@/lib/admin/mock-profit";
import { formatMockBusinessDate, formatMockReportMonth, selectMockSalesPeriod, type MockReportPeriod } from "@/lib/admin/mock-sales-report";

export function TodayProfitPreview({ sales }: { sales: readonly ProfitSale[] }) {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<MockReportPeriod["kind"]>("today");
  const [month, setMonth] = useState(mockSalesBusinessDate.iso.slice(0, 7));
  const [from, setFrom] = useState<string>(mockSalesBusinessDate.iso);
  const [to, setTo] = useState<string>(mockSalesBusinessDate.iso);
  const searchRef = useRef<HTMLInputElement>(null);
  const selection: MockReportPeriod = period === "monthly" ? { kind: period, month }
    : period === "custom" ? { kind: period, from, to } : { kind: "today" };
  const report = selectMockSalesPeriod(sales, selection);
  const query = search.trim().toLowerCase();
  const filteredSales = report.sales.filter((sale) => sale.productName.toLowerCase().includes(query));
  const products = aggregateMockProfit(filteredSales);
  const total = calculateMockProfitTotals(report.sales);
  const selected = calculateMockProfitTotals(filteredSales);

  return <section aria-labelledby="profit-breakdown-title" aria-describedby="profit-mock-notice">
    <h2 id="profit-breakdown-title" className="sr-only">Product-wise gross profit</h2>
    <p id="profit-mock-notice" className="sr-only">Read-only Admin UI preview. No transactions or inventory changes. Authentication and Admin authorization are not implemented.</p>
    <div className="mb-5 flex flex-wrap items-start gap-3">
      <div className="w-full sm:w-56">
        <label htmlFor="profit-period" className="mb-2 block text-sm font-semibold">Reporting period</label>
        <Select id="profit-period" value={period} onChange={(event) => setPeriod(event.target.value as MockReportPeriod["kind"])}>
          <option value="today">Today</option>
          <option value="monthly">Monthly</option>
          <option value="custom">Custom Date Range</option>
        </Select>
      </div>
      {period === "monthly" && <div className="w-full sm:w-56">
        <label htmlFor="profit-month" className="mb-2 block text-sm font-semibold">Month and year</label>
        <Input id="profit-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)}
          aria-invalid={Boolean(report.error)} aria-describedby={"profit-month-readable" + (report.error ? " profit-period-error" : "")} />
        <p id="profit-month-readable" className="mt-2 text-sm text-muted-foreground">Selected month: {formatMockReportMonth(month)}</p>
      </div>}
      {period === "custom" && <>
        <div className="w-full sm:w-56">
          <label htmlFor="profit-from" className="mb-2 block text-sm font-semibold">From Date</label>
          <Input id="profit-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)}
            aria-invalid={Boolean(report.error)} aria-describedby={"profit-from-readable" + (report.error ? " profit-period-error" : "")} />
          <p id="profit-from-readable" className="mt-2 text-sm text-muted-foreground">From: {formatMockBusinessDate(from)}</p>
        </div>
        <div className="w-full sm:w-56">
          <label htmlFor="profit-to" className="mb-2 block text-sm font-semibold">To Date</label>
          <Input id="profit-to" type="date" value={to} onChange={(event) => setTo(event.target.value)}
            aria-invalid={Boolean(report.error)} aria-describedby={"profit-to-readable" + (report.error ? " profit-period-error" : "")} />
          <p id="profit-to-readable" className="mt-2 text-sm text-muted-foreground">To: {formatMockBusinessDate(to)}</p>
        </div>
      </>}
    </div>
    {report.error && <p id="profit-period-error" role="alert" className="mb-5 rounded-md border border-danger bg-danger/10 p-3 text-sm text-danger">{report.error}</p>}
    <dl aria-label="Gross profit totals" className="mb-4 grid gap-4 sm:grid-cols-2">
      <div className="min-w-0 rounded-md border bg-card px-4 py-3"><dt className="text-sm text-muted-foreground">Total Gross Profit</dt>
        <dd className="numeric mt-1 break-words text-xl font-bold"><span>{report.error ? "\u2014" : formatProfitMoney(total.grossProfitPaise)}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{report.error ? "Valid reporting period required" : "All sales in selected period"}</span></dd>
      </div>
      <div className="min-w-0 rounded-md border bg-card px-4 py-3"><dt className="text-sm text-muted-foreground">Selected Products Gross Profit</dt>
        <dd className="numeric mt-1 break-words text-xl font-bold"><span>{report.error ? "\u2014" : formatProfitMoney(selected.grossProfitPaise)}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{report.error ? "Valid reporting period required" : query ? "Matching product names" : "All products"}</span></dd>
      </div>
    </dl>
    {!report.error && report.sales.length > 0 && <p className="mb-5 text-sm leading-6 text-muted-foreground">
      {total.grossProfitPaise !== null ? "Profit calculated using example purchase costs for demo sales."
        : (total.missingCostSales > 0 ? "Historical purchase costs are not recorded for all included sales." : "Some sale data cannot be calculated exactly at supported precision.") + " Missing or unsupported values are not treated as zero."}
    </p>}
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full sm:max-w-sm">
        <label htmlFor="profit-product-search" className="mb-2 block text-sm font-semibold">Search by product name</label>
        <Input ref={searchRef} id="profit-product-search" type="search" autoComplete="off" placeholder="e.g. Diapers"
          value={search} onChange={(event) => setSearch(event.target.value)} aria-controls="profit-results" />
      </div>
      <Button variant="outline" onClick={() => { setSearch(""); searchRef.current?.focus(); }}>Clear search</Button>
    </div>
    {!report.error && <p role="status" aria-atomic="true" className="mb-3 mt-4 text-sm text-muted-foreground">Showing {products.length} of {new Set(report.sales.map((sale) => sale.productId)).size} products for this period.</p>}
    <div id="profit-results">
      {products.length > 0 ? <TableRegion label="Profit results">
        <Table className="min-w-[44rem]">
          <caption className="sr-only">Mock product-wise gross profit</caption>
          <thead><tr>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Quantity Sold</TableHead>
            <TableHead className="text-right">Sales Revenue (PKR)</TableHead>
            <TableHead className="text-right">Cost of Goods Sold (PKR)</TableHead>
            <TableHead className="text-right">Gross Profit (PKR)</TableHead>
          </tr></thead>
          <tbody>{products.map((product) => <tr key={product.productId}>
            <th scope="row" className="h-14 border-t px-4 py-3 font-semibold">{product.productName}</th>
            <TableCell className="numeric text-right">{product.quantity ?? "Not available"}</TableCell>
            <TableCell className="numeric whitespace-nowrap text-right">{formatProfitMoney(product.revenuePaise)}</TableCell>
            <TableCell className="numeric whitespace-nowrap text-right">{formatProfitMoney(product.costOfGoodsSoldPaise)}</TableCell>
            <TableCell className="numeric whitespace-nowrap text-right font-semibold">{formatProfitMoney(product.grossProfitPaise)}</TableCell>
          </tr>)}</tbody>
        </Table>
      </TableRegion> : <p className="rounded-md border bg-card p-4 text-sm">{report.error ? "Choose a valid reporting period to view profit." : report.sales.length === 0 ? "No sales for this period." : "No products match your search in this period."}</p>}
    </div>
  </section>;
}
