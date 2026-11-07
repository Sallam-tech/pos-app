"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { getMockStockStatus, type MockInventoryProduct } from "@/lib/admin/mock-inventory";

const stockFilters = [
  { value: "all", label: "All Products" },
  { value: "Available", label: "Available" },
  { value: "Low stock", label: "Low Stock" },
  { value: "Out of stock", label: "Out of Stock" },
] as const;

export function AvailableStockPreview({ products }: { products: readonly MockInventoryProduct[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const query = search.trim().toLowerCase();
  const totalUnits = products.reduce((total, product) => total + product.quantity, 0);
  const filtered = products.filter((product) => product.name.toLowerCase().includes(query)
    && (statusFilter === "all" || getMockStockStatus(product) === statusFilter));

  return <section aria-labelledby="available-stock-list-title" aria-describedby="available-stock-mock-notice">
    <h2 id="available-stock-list-title" className="sr-only">Inventory breakdown</h2>
    <p id="available-stock-mock-notice" className="sr-only">Mock data only. Read-only example quantities and thresholds, not live shop inventory.</p>
    <dl aria-label="Overall inventory totals" className="mb-4 grid gap-3 sm:grid-cols-2">
      <div className="summary-panel relative min-w-0 py-3 pl-16 pr-4">
        <span className="absolute left-4 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-success/10 text-success"><Icon name="box" /></span>
        <dt className="text-sm text-muted-foreground">Total Stock Units</dt><dd className="numeric text-2xl font-bold tracking-tight">{totalUnits}</dd>
      </div>
      <div className="summary-panel relative min-w-0 py-3 pl-16 pr-4">
        <span className="absolute left-4 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-success/10 text-success"><Icon name="layers" /></span>
        <dt className="text-sm text-muted-foreground">Total Products</dt><dd className="numeric text-2xl font-bold tracking-tight">{products.length}</dd>
      </div>
    </dl>
    <div className="relative">
      <label htmlFor="inventory-name-search" className="sr-only">Search by product name</label>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
      <Input id="inventory-name-search" type="search" autoComplete="off" placeholder="Find product by name..." className="pl-10"
        value={search} onChange={(event) => setSearch(event.target.value)}
        aria-controls="available-stock-results" aria-describedby="inventory-search-hint" />
    </div>
    <p id="inventory-search-hint" className="sr-only">Search matches part of a name, ignoring letter case.</p>
    <fieldset className="mt-3">
      <legend className="mb-2 text-sm font-semibold">Stock Status</legend>
      <div className="flex flex-wrap gap-2">
        {stockFilters.map((filter) => <Button key={filter.value} size="sm" variant={statusFilter === filter.value ? "default" : "outline"}
          aria-pressed={statusFilter === filter.value} aria-controls="available-stock-results" onClick={() => setStatusFilter(filter.value)}>{filter.label}</Button>)}
      </div>
    </fieldset>
    <p role="status" aria-atomic="true" className="my-3 text-xs text-muted-foreground">Showing {filtered.length} of {products.length} mock products.</p>
    <div id="available-stock-results">
      {filtered.length > 0 ? <TableRegion label="Inventory results">
        <Table className="min-w-[26rem] table-fixed">
          <caption className="sr-only">Mock available-stock inventory</caption>
          <thead><tr>
            <TableHead className="w-[46%]">Product Name</TableHead>
            <TableHead className="w-[27%] whitespace-nowrap text-center">Available Quantity</TableHead>
            <TableHead className="text-right">Stock Status</TableHead>
          </tr></thead>
          <tbody>{filtered.map((product) => {
            const status = getMockStockStatus(product);
            return <tr key={product.id}>
              <th scope="row" className="border-t font-semibold">{product.name}</th>
              <TableCell className="numeric text-center">{product.quantity}</TableCell>
              <TableCell className="text-right"><Badge tone={status === "Out of stock" ? "danger" : status === "Low stock" ? "warning" : "success"}
                className={"whitespace-nowrap px-2 py-0.5 " + (status === "Out of stock" ? "border-danger/25 bg-danger/10" : status === "Low stock" ? "border-warning/25 bg-warning/10" : "border-success/25 bg-success/10")}>
                <Icon name={status === "Available" ? "check" : "alert"} className="size-3.5" />{status}
              </Badge></TableCell>
            </tr>;
          })}</tbody>
        </Table>
      </TableRegion> : <p className="rounded-md border bg-surface p-4 text-sm">No mock products match your search and stock status.</p>}
    </div>
  </section>;
}
