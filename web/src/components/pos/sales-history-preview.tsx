"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { HistoricalReceipt } from "@/components/pos/historical-receipt";
import { filterHistoricalSales, historicalDateLabel, historicalTimeLabel, orderHistoricalSales, recordedSaleAmount, type HistoricalSalePreview } from "@/lib/sales-history-preview";
import { isDemoCalendarDate } from "@/lib/demo/admin-preview";
import { formatDemoMoney } from "@/lib/demo/money";

export function SalesHistoryPreview({ sales }: { sales: readonly HistoricalSalePreview[] }) {
  const [reference, setReference] = useState(""), [product, setProduct] = useState(""), [date, setDate] = useState("");
  const referenceRef = useRef<HTMLInputElement>(null);
  const dateError = date && !isDemoCalendarDate(date) ? "Choose a valid business date." : undefined;
  const filtered = orderHistoricalSales(filterHistoricalSales(sales, reference, product, date));
  const dates = [...new Set(sales.map((sale) => sale.businessDate))];
  const sampleLabel = dates.length === 1 ? "Sample Invoices — " + historicalDateLabel(dates[0]) : "Sample Invoices";
  function clear() { setReference(""); setProduct(""); setDate(""); referenceRef.current?.focus(); }
  return <section aria-label="Original demo sales history" className="rounded-lg border bg-card p-4 sm:p-5">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-bold">Invoices</h2><p className="text-xs text-muted-foreground">{sampleLabel}</p>
    </div>
    <p className="sr-only">Eight original demo sales. New previews are not saved here. Official invoice numbers, customer details and time of day are shown only if recorded. Equal dates with no recorded time retain their original order.</p>
    <div className="flex items-center gap-2">
      <label htmlFor="history-reference" className="sr-only">Find invoice...</label>
      <Input ref={referenceRef} id="history-reference" type="search" placeholder="Find invoice..." value={reference} onChange={(event) => setReference(event.target.value)} autoComplete="off" aria-controls="history-results" />
      <Button variant="outline" size="sm" className="shrink-0 whitespace-nowrap" onClick={clear}>Clear filters</Button>
    </div>
    <details className="optional-details mt-2">
      <summary>Filters</summary>
      <div className="grid gap-3 pb-3 sm:grid-cols-2">
        <Field id="history-product" label="Product name"><Input id="history-product" type="search" placeholder="e.g. Diapers" value={product} onChange={(event) => setProduct(event.target.value)} autoComplete="off" aria-controls="history-results" /></Field>
        <Field id="history-date" label="Business date (optional)" error={dateError}>
          <Input id="history-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-invalid={Boolean(dateError) || undefined} aria-describedby={dateError ? "history-date-error" : undefined} aria-controls="history-results" />
        </Field>
      </div>
    </details>
    <p role="status" className="mb-3 text-xs text-muted-foreground">{filtered.length} of {sales.length} sample invoices</p>
    <div id="history-results">
      {filtered.length ? <TableRegion label="Sales history results">
        <Table className="min-w-[35rem]">
          <caption className="sr-only">Original demo sales. Recorded values only.</caption>
          <thead><tr><TableHead>Invoice</TableHead><TableHead>Date / Time</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Action</TableHead></tr></thead>
          <tbody>{filtered.map((sale) => { const total = recordedSaleAmount(sale); return <tr key={sale.id}>
            <th scope="row" className="border-t px-4 py-3 font-bold">{sale.receiptNumber || sale.id}</th>
            <TableCell><time dateTime={sale.businessDate}>{historicalDateLabel(sale.businessDate)}</time><span className="mt-1 block text-xs text-muted-foreground">Time: {historicalTimeLabel(sale)}</span></TableCell>
            <TableCell>{sale.customerName?.trim() || "—"}</TableCell>
            <TableCell className="numeric whitespace-nowrap text-right font-bold">{total === null ? "Unavailable" : formatDemoMoney(total)}</TableCell>
            <TableCell><HistoricalReceipt sale={sale} /></TableCell>
          </tr>; })}</tbody>
        </Table>
      </TableRegion> : <p className="rounded-md border p-4 text-sm">No original demo sales match these filters.</p>}
    </div>
  </section>;
}
