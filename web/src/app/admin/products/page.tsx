import {isTestProductControlsRender} from "@/server/hosting/product-controls-render";
import {readTestReturnsRender} from "@/server/hosting/returns-render";
import {isTestSalesRender} from "@/server/hosting/sales-render";
import {TestSalesRecovery} from "@/components/admin/test-sales-recovery";
import { isTestInventoryRender } from "@/server/hosting/inventory-render";
import { TestInventory } from "@/components/admin/test-inventory";
import { PageHeading } from "@/components/shell/page-heading";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductListPreview } from "@/components/admin/product-list-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockInventory } from "@/lib/admin/mock-inventory";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Products | Shop POS" };

export default function ProductsPage() {
  const live = isTestInventoryRender();
  return <div className="mx-auto w-full max-w-5xl">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-3"><PageHeading route={"/admin/products"}>Products</PageHeading><Badge>{live ? "Isolated TEST" : "Demo Data"}</Badge></div>
        <p className="sr-only">{live ? "Authenticated disposable TEST inventory." : "Simulated product information, not live inventory."}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {live&&readTestReturnsRender()&&<Button asChild variant="outline"><Link href="/admin/returns">Returns &amp; inspection</Link></Button>}
        <Button asChild><Link href="/admin/products/new"><span aria-hidden="true">+</span> Add Product</Link></Button>
      </div>
    </div>
    {live ? <TestInventory controls={isTestProductControlsRender()}/> : <ProductListPreview products={mockInventory} />}
    {live&&isTestSalesRender()&&<TestSalesRecovery/>}
  </div>;
}
