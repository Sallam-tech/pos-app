import { PageHeading } from "@/components/shell/page-heading";

export default function ProductNotFound() {
  return <div>
    <PageHeading route={"/admin/products/missing/edit"}>Product not found</PageHeading>
    <p className="mb-5 mt-2 text-sm text-muted-foreground">Choose an existing demo product from the Products list.</p>
  </div>;
}
