import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { RecordSaleForm } from "@/components/pos/record-sale-form";

export const metadata: Metadata = { title: "Record Sale | Shop POS" };

export default function PosPage() {
  return <div className="mx-auto max-w-[640px]">
    <div className="mb-5">
      <h1 className="page-title">Record sale</h1>
      <p className="mt-2 text-sm text-muted-foreground">Choose a product, enter the quantity and selling price.</p>
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <Badge>Mock UI</Badge>
      <p className="text-muted-foreground">Practice only. No real sales are recorded.</p>
    </div>
    <RecordSaleForm />
  </div>;
}
