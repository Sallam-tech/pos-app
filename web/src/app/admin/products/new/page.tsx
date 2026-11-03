import type { Metadata } from "next";
import { AddProductPreview } from "@/components/admin/add-product-preview";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Add Product | Shop POS" };

export default function AddProductPage() {
  return <div className="mx-auto w-full max-w-3xl">
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-3"><h1 className="page-title">Add Product</h1><Badge>Demo Data</Badge></div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">Try entering product details. This is a public UI preview, not a saved product or an authenticated Admin session.</p>
    </div>
    <AddProductPreview />
  </div>;
}
