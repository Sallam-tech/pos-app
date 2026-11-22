import { isTestInventoryRender } from "@/server/hosting/inventory-render";
import { TestProductForm } from "@/components/admin/test-product-form";
import { PageHeading } from "@/components/shell/page-heading";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { LiveDataRequired } from "@/components/shell/live-data-required";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add Product | Shop POS" };

export default function AddProductPage() {
  if (!isTestInventoryRender()) return <LiveDataRequired route="/admin/products/new" title="Add Product"/>;
  return <div className="mx-auto w-full max-w-3xl">
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-3"><PageHeading route={"/admin/products/new"}>Add Product</PageHeading><Badge>Test mode</Badge></div>
    </div>
    <TestProductForm />
  </div>;
}
