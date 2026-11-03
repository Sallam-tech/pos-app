import type { Metadata } from "next";
import Link from "next/link";
import { ProductListPreview } from "@/components/admin/product-list-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockInventory } from "@/lib/admin/mock-inventory";

export const metadata: Metadata = { title: "Products | Shop POS" };

export default function ProductsPage() {
  return <>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-3"><h1 className="page-title">Products</h1><Badge>Demo Data</Badge></div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Simulated product information, not live inventory.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild><Link href="/admin/products/new">Add Product</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/dashboard">Back to Dashboard</Link></Button>
      </div>
    </div>
    <ProductListPreview products={mockInventory} />
  </>;
}
