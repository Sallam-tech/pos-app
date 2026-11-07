import { PageHeading } from "@/components/shell/page-heading";
import type { Metadata } from "next";
import { AddProductPreview } from "@/components/admin/add-product-preview";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Add Product | Shop POS" };

export default function AddProductPage() {
  return <div className="mx-auto w-full max-w-3xl">
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-3"><PageHeading route={"/admin/products/new"}>Add Product</PageHeading><Badge>Demo Data</Badge></div>
    </div>
    <AddProductPreview />
  </div>;
}
