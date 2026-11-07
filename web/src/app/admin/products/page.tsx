import { PageHeading } from "@/components/shell/page-heading";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductListPreview } from "@/components/admin/product-list-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockInventory } from "@/lib/admin/mock-inventory";

export const metadata: Metadata = { title: "Products | Shop POS" };

export default function ProductsPage() {
  return <div className="mx-auto w-full max-w-5xl">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-3"><PageHeading route={"/admin/products"}>Products</PageHeading><Badge>Demo Data</Badge></div>
        <p className="sr-only">Simulated product information, not live inventory.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild><Link href="/admin/products/new"><span aria-hidden="true">+</span> Add Product</Link></Button>
      </div>
    </div>
    <ProductListPreview products={mockInventory} />
  </div>;
}
