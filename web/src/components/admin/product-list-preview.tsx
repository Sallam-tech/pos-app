"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AddStockPreview } from "@/components/admin/add-stock-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMockStockStatus, type MockInventoryProduct } from "@/lib/admin/mock-inventory";
import { getMockSuggestedSellingPrice } from "@/lib/mock-suggested-prices";
import { matchesProductIdentity, productUnitDisplay, type ProductIdentity } from "@/lib/product-identity-preview";
import { formatPreviewPKR } from "@/lib/pos-preview";

export function ProductListPreview({ products }: { products: readonly (MockInventoryProduct & ProductIdentity)[] }) {
  const [search, setSearch] = useState("");
  const [stockProduct, setStockProduct] = useState<(MockInventoryProduct & ProductIdentity) | null>(null);
  const [stockNotice, setStockNotice] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filtered = products.filter((product) => matchesProductIdentity(product, search));
  return <section aria-labelledby="product-list-title" aria-describedby="products-mock-notice">
    <h2 id="product-list-title" className="sr-only">Product list</h2>
    <p id="products-mock-notice" className="sr-only">Mock data only. Products and quantities are examples, not live shop inventory.</p>
    <p id="product-stock-demo-note" className="sr-only">Stock opens a separate unsaved purchase preview. No inventory or price changes are saved.</p>
    <div className="mb-3 flex min-w-0 items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <label htmlFor="product-name-search" className="sr-only">Find product by name or code</label>
        <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-4 size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg>
        <Input ref={searchRef} id="product-name-search" type="search" autoComplete="off" className="pl-10"
          placeholder="Find product by name or code..." value={search} onChange={(event) => setSearch(event.target.value)} aria-controls="product-list-results" />
      </div>
      {search !== "" && <Button variant="outline" size="sm" onClick={() => { setSearch(""); searchRef.current?.focus(); }}>Clear search</Button>}
    </div>
    <p role="status" aria-atomic="true" className="sr-only">Showing {filtered.length} of {products.length} mock products.</p>
    {stockNotice && <p role="status" data-testid="stock-purchase-notice" className="mb-3 rounded-lg border bg-card p-3 text-sm leading-6">{stockNotice}</p>}
    <div id="product-list-results" className="grid gap-3">
      {filtered.map((product) => {
        const status = getMockStockStatus(product);
        const suggestedPrice = getMockSuggestedSellingPrice(product.id);
        return <article key={product.id} aria-label={product.name} data-product-id={product.id} className="min-w-0 rounded-xl border bg-card p-4 text-card-foreground">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0"><h3 className="break-words text-base font-semibold">{product.name}</h3>
              <p className={"mt-1 text-sm font-medium " + (status === "Out of stock" ? "text-danger" : status === "Low stock" ? "text-warning" : "text-success")}>{status === "Out of stock" ? "Out of Stock" : status === "Low stock" ? "Low Stock" : status}</p>
            </div>
            <dl className="min-w-0 text-right"><dt className="text-xs text-muted-foreground">Selling Price</dt><dd className="numeric mt-1 break-all text-base font-semibold">{suggestedPrice === null ? "Not set" : formatPreviewPKR(suggestedPrice)}</dd></dl>
          </div>
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <dl><dt className="text-xs text-muted-foreground">Available Stock</dt><dd className="numeric mt-1 font-semibold">{product.quantity} {product.unitLabel || "units"}</dd></dl>

          <details data-product-details className="optional-details col-span-2 min-w-0 text-sm sm:col-span-1 sm:col-start-2 sm:row-start-1">
            <summary aria-label={"Details for " + product.name} className="w-fit text-muted-foreground">Details</summary>
            <dl className="grid gap-x-5 gap-y-2 border-t pt-3 sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Buying Price</dt><dd>Not available in demo data</dd></div>
              <div><dt className="text-xs text-muted-foreground">Low Stock Alert</dt><dd>{product.lowStockThreshold}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Category</dt><dd>{product.category || "Not set"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Product Code</dt><dd className="break-all">{product.productCode || "Not set"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Unit</dt><dd>{productUnitDisplay(product)}</dd></div>
            </dl>
          </details>
            <div className="col-start-2 row-start-1 flex gap-2 sm:col-start-3">
              <Button variant="outline" size="sm" aria-label={"Add stock for " + product.name} aria-haspopup="dialog" aria-describedby="product-stock-demo-note" onClick={() => { setStockNotice(null); setStockProduct(product); }}>Stock</Button>
              <Button asChild size="sm"><Link href={"/admin/products/" + product.id + "/edit"} aria-label={"Edit " + product.name}>Edit</Link></Button>
            </div>
          </div>
        </article>;
      })}
      {!filtered.length && <p className="rounded-xl border bg-card p-4 text-sm">No mock products match your search.</p>}
    </div>
    {stockProduct && <AddStockPreview product={stockProduct} onClose={() => setStockProduct(null)} onPreview={(message) => { setStockProduct(null); setStockNotice(message); }} />}
  </section>;
}
