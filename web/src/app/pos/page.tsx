import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { RecordSaleForm } from "@/components/pos/record-sale-form";

export const metadata: Metadata = { title: "Make a Sale | Shop POS" };

export default function PosPage() {
  return <div className="mx-auto max-w-3xl">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="page-title">Make a Sale</h1>
        <p className="mt-1 text-sm text-muted-foreground">Add items, check the total and create a sample invoice.</p>
      </div>
      <Badge className="mt-1">Demo Mode</Badge>
    </div>
    <RecordSaleForm />
  </div>;
}
