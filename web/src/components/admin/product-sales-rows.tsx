"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { formatMockRevenue, getMockRevenuePaise, type MockProductRevenue, type MockSale } from "@/lib/admin/mock-sales";

const pageSize = 10;

export function ProductSalesRows({ product, sales }: { product: MockProductRevenue; sales: readonly MockSale[] }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const detailsId = useId();
  const pageCount = Math.max(1, Math.ceil(sales.length / pageSize));
  const start = page * pageSize;
  const visibleSales = sales.slice(start, start + pageSize);

  return <>
    <tr>
      <th scope="row" className="h-14 border-t px-4 py-3 font-semibold">{product.productName}</th>
      <TableCell className="numeric text-right">{product.quantity}</TableCell>
      <TableCell className="numeric text-right font-semibold">{formatMockRevenue(product.revenuePaise)}</TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" aria-expanded={open} aria-controls={detailsId}
          aria-label={(open ? "Hide sales for " : "View sales for ") + product.productName}
          onClick={() => { setOpen((expanded) => !expanded); setPage(0); }}>{open ? "Hide sales" : "View sales"}</Button>
      </TableCell>
    </tr>
    <tr id={detailsId} hidden={!open}>
      <td colSpan={4} className="border-t bg-muted/30 p-4">
        {open && <section aria-label={"Individual sales for " + product.productName}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Individual sales — {product.productName}</h3>
          </div>
          <TableRegion label={"Individual sale details for " + product.productName}>
            <Table className="min-w-[40rem]">
              <caption className="sr-only">Original mock sales for {product.productName}</caption>
              <thead><tr>
                <TableHead>Demo sale ID</TableHead>
                <TableHead>Business date (Asia/Karachi)</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit selling price (PKR)</TableHead>
                <TableHead className="text-right">Revenue (PKR)</TableHead>
              </tr></thead>
              <tbody>{visibleSales.map((sale) => <tr key={sale.id}>
                <th scope="row" className="h-14 border-t px-4 py-3 font-medium">{sale.id}</th>
                <TableCell><time dateTime={sale.businessDate}>{sale.businessDate}</time></TableCell>
                <TableCell className="numeric text-right">{sale.quantity}</TableCell>
                <TableCell className="numeric whitespace-nowrap text-right">{formatMockRevenue(BigInt(sale.unitPricePaise))}</TableCell>
                <TableCell className="numeric whitespace-nowrap text-right">{formatMockRevenue(getMockRevenuePaise([sale]))}</TableCell>
              </tr>)}</tbody>
            </Table>
          </TableRegion>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-muted-foreground">Sales {start + 1}–{Math.min(start + pageSize, sales.length)} of {sales.length}. Page {page + 1} of {pageCount}.</p>
            {pageCount > 1 && <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page + 1 === pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Next</Button>
            </div>}
          </div>
        </section>}
      </td>
    </tr>
  </>;
}
