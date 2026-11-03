import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ProductNotFound() {
  return <div>
    <h1 className="page-title">Product not found</h1>
    <p className="mb-5 mt-2 text-sm text-muted-foreground">Choose an existing demo product from the Products list.</p>
    <Button asChild variant="outline"><Link href="/admin/products">Back to Products</Link></Button>
  </div>;
}
