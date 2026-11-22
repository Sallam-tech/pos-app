import {isTestProductControlsRender} from "@/server/hosting/product-controls-render";
import {readTestReturnsRender} from "@/server/hosting/returns-render";
import {isTestSalesRender} from "@/server/hosting/sales-render";
import {TestSalesRecovery} from "@/components/admin/test-sales-recovery";
import { isTestInventoryRender } from "@/server/hosting/inventory-render";
import { TestInventory } from "@/components/admin/test-inventory";
import { PageHeading } from "@/components/shell/page-heading";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveDataRequired } from "@/components/shell/live-data-required";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Products | Shop POS" };

export default function ProductsPage() {
  if (!isTestInventoryRender()) return <LiveDataRequired route="/admin/products" title="Products"/>;
  return <div className="mx-auto w-full max-w-5xl">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-3"><PageHeading route={"/admin/products"}>Products</PageHeading><Badge>Test mode</Badge></div>
        <p className="sr-only">Shop stock (test mode).</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {readTestReturnsRender()&&<Button asChild variant="outline"><Link href="/admin/returns">Returns &amp; inspection</Link></Button>}
        <Button asChild><Link href="/admin/products/new"><span aria-hidden="true">+</span> Add Product</Link></Button>
      </div>
    </div>
    <TestInventory controls={isTestProductControlsRender()}/>
    {isTestSalesRender()&&<TestSalesRecovery/>}
  </div>;
}
