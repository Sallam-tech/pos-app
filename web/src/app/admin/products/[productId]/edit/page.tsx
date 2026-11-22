import {isTestProductControlsRender} from "@/server/hosting/product-controls-render";
import {TestProductEditor} from "@/components/admin/test-product-editor";
import { PageHeading } from "@/components/shell/page-heading";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { LiveDataRequired } from "@/components/shell/live-data-required";

export const dynamic="force-dynamic";
export const metadata: Metadata = { title: "Edit Product | Shop POS" };

export default async function EditProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  if(!isTestProductControlsRender())return <LiveDataRequired route={"/admin/products/"+productId+"/edit"} title="Edit Product"/>;
  return <div className="mx-auto w-full max-w-3xl"><div className="mb-4 flex flex-wrap items-center gap-3"><PageHeading route={"/admin/products/"+productId+"/edit"}>Edit Product</PageHeading><Badge>Test mode</Badge></div><TestProductEditor id={productId}/></div>;
}
