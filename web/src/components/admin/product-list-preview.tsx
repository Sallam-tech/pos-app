"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Table, TableCell, TableHead, TableRegion } from "@/components/ui/table";
import { getMockStockStatus, type MockInventoryProduct } from "@/lib/admin/mock-inventory";

export function ProductListPreview({ products }: { products: readonly MockInventoryProduct[] }) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const query = search.trim().toLowerCase();
  const filtered = products.filter((product) => product.name.toLowerCase().includes(query));

  function clearSearch() {
    setSearch("");
    searchRef.current?.focus();
  }

  return <section aria-labelledby="product-list-title" aria-describedby="products-mock-notice">
    <h2 id="product-list-title" className="sr-only">Product list</h2>
    <p id="products-mock-notice" className="sr-only">
      Mock data only. Products and quantities are examples, not live shop inventory.
    </p>
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full sm:max-w-sm">
        <label htmlFor="product-name-search" className="mb-2 block text-sm font-semibold">Search by product name</label>
        <Input ref={searchRef} id="product-name-search" type="search" autoComplete="off"
          placeholder="e.g. Diapers" value={search} onChange={(event) => setSearch(event.target.value)}
          aria-controls="product-list-results" aria-describedby="product-search-hint" />
        <p id="product-search-hint" className="mt-2 text-xs leading-5 text-muted-foreground">Matches part of a name, ignoring letter case.</p>
      </div>
      {search !== "" && <Button variant="outline" onClick={clearSearch} className="sm:mb-7">Clear search</Button>}
    </div>
    <p role="status" aria-atomic="true" className="mb-3 mt-4 text-sm text-muted-foreground">
      Showing {filtered.length} of {products.length} mock products.
    </p>
    <div id="product-list-results">
      {filtered.length > 0 ? <TableRegion label="Product results">
        <Table className="min-w-[26rem]">
          <caption className="sr-only">Mock products</caption>
          <thead><tr>
            <TableHead>Product name</TableHead>
            <TableHead className="text-right">Available stock</TableHead>
            <TableHead>Stock status</TableHead>
          </tr></thead>
          <tbody>{filtered.map((product) => {
            const status = getMockStockStatus(product);
            return <tr key={product.id}>
              <th scope="row" className="h-14 border-t px-4 py-3 font-semibold">{product.name}</th>
              <TableCell className="numeric text-right">{product.quantity}</TableCell>
              <TableCell><Badge tone={status === "Out of stock" ? "danger" : status === "Low stock" ? "warning" : "success"} className="whitespace-nowrap">
                <Icon name={status === "Available" ? "check" : "alert"} className="size-4" />{status}
              </Badge></TableCell>
            </tr>;
          })}</tbody>
        </Table>
      </TableRegion> : <p className="rounded-md border bg-card p-4 text-sm">No mock products match your search.</p>}
    </div>
  </section>;
}
