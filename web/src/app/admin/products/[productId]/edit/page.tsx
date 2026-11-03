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
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-3"><h1 className="page-title">Edit Product</h1><Badge>Demo Data</Badge></div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">Review product details. Demo only; nothing is saved.</p>
    </div>
    <AddProductPreview key={product.id} product={product} />
    <ProductOperationsPreview key={"operations-" + product.id} product={product} />
  </div>;
}
