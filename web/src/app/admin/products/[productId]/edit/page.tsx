import { PageHeading } from "@/components/shell/page-heading";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddProductPreview } from "@/components/admin/add-product-preview";
import { ProductOperationsPreview } from "@/components/admin/product-operations-preview";
import { Badge } from "@/components/ui/badge";
import { mockInventory } from "@/lib/admin/mock-inventory";

export const metadata: Metadata = { title: "Edit Product | Shop POS" };

export function generateStaticParams() {
  return mockInventory.map((product) => ({ productId: product.id }));
}

export default async function EditProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const product = mockInventory.find((item) => item.id === productId);
  if (!product) notFound();
  return <div className="mx-auto w-full max-w-3xl">
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-3"><PageHeading route={"/admin/products/" + product.id + "/edit"}>Edit Product</PageHeading><Badge>Demo Data</Badge></div>
    </div>
    <AddProductPreview key={product.id} product={product} />
    <ProductOperationsPreview key={"operations-" + product.id} product={product} />
  </div>;
}
