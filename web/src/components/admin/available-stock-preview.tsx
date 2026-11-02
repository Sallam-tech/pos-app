"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { getMockStockStatus, type MockInventoryProduct } from "@/lib/admin/mock-inventory";

export function AvailableStockPreview({ products }: { products: readonly MockInventoryProduct[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const query = search.trim().toLowerCase();
  const totalUnits = products.reduce((total, product) => total + product.quantity, 0);
  const filtered = products.filter((product) => product.name.toLowerCase().includes(query)
    && (statusFilter === "all" || getMockStockStatus(product) === statusFilter));

  return <section aria-labelledby="available-stock-list-title" aria-describedby="available-stock-mock-notice">
    <h2 id="available-stock-list-title" className="sr-only">Inventory breakdown</h2>
    <p id="available-stock-mock-notice" className="sr-only">Mock data only. Read-only example quantities and thresholds, not live shop inventory.</p>
    <dl aria-label="Overall inventory totals" className="mb-5 grid gap-4 sm:grid-cols-2">
      <div className="min-w-0 rounded-md border bg-card px-4 py-3"><dt className="text-sm text-muted-foreground">Total Stock Units</dt><dd className="numeric mt-1 text-xl font-bold">{totalUnits}</dd></div>
      <div className="min-w-0 rounded-md border bg-card px-4 py-3"><dt className="text-sm text-muted-foreground">Total Products</dt><dd className="numeric mt-1 text-xl font-bold">{products.length}</dd></div>
    </dl>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,24rem)_minmax(0,14rem)]">
      <div>
        <label htmlFor="inventory-name-search" className="mb-2 block text-sm font-semibold">Search by product name</label>
        <Input id="inventory-name-search" type="search" autoComplete="off" placeholder="e.g. Diapers"
          value={search} onChange={(event) => setSearch(event.target.value)}
          aria-controls="available-stock-results" aria-describedby="inventory-search-hint" />
      </div>
      <div>
        <label htmlFor="inventory-status-filter" className="mb-2 block text-sm font-semibold">Stock status</label>
        <Select id="inventory-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-controls="available-stock-results">
          <option value="all">All products</option>
          <option value="Available">Available</option>
          <option value="Low stock">Low stock</option>
          <option value="Out of stock">Out of stock</option>
        </Select>
      </div>
    </div>
    <p id="inventory-search-hint" className="mt-2 text-xs leading-5 text-muted-foreground">Search matches part of a name, ignoring letter case.</p>
    <p role="status" aria-atomic="true" className="mb-3 mt-4 text-sm text-muted-foreground">Showing {filtered.length} of {products.length} mock products.</p>
    <div id="available-stock-results">
      {filtered.length > 0 ? <TableRegion label="Inventory results">
        <Table className="min-w-[32rem]">
          <caption className="sr-only">Mock available-stock inventory</caption>
          <thead><tr>
            <TableHead>Product name</TableHead>
            <TableHead className="text-right">Available quantity</TableHead>
            <TableHead className="text-right">Low-stock threshold</TableHead>
            <TableHead>Stock status</TableHead>
          </tr></thead>
          <tbody>{filtered.map((product) => {
            const status = getMockStockStatus(product);
            return <tr key={product.id}>
              <th scope="row" className="h-14 border-t px-4 py-3 font-semibold">{product.name}</th>
              <TableCell className="numeric text-right">{product.quantity}</TableCell>
              <TableCell className="numeric text-right">{product.lowStockThreshold}</TableCell>
              <TableCell><Badge tone={status === "Out of stock" ? "danger" : status === "Low stock" ? "warning" : "success"} className="whitespace-nowrap">
                <Icon name={status === "Available" ? "check" : "alert"} className="size-4" />{status}
              </Badge></TableCell>
            </tr>;
          })}</tbody>
        </Table>
      </TableRegion> : <p className="rounded-md border bg-card p-4 text-sm">No mock products match your search and stock status.</p>}
    </div>
  </section>;
}
