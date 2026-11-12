import {connection} from "next/server";
import {isTestSalesRender} from "@/server/hosting/sales-render";
import {TestSales} from "@/components/pos/test-sales";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { RecordSaleForm } from "@/components/pos/record-sale-form";

export const metadata: Metadata = { title: "Make a Sale | Shop POS" };

export default async function PosPage() {
  await connection();const live=isTestSalesRender();
  return <div className="mx-auto max-w-3xl">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="page-title">Make a Sale</h1>
        <p className="mt-1 text-sm text-muted-foreground">{live?"Add items, review and save an isolated TEST invoice.":"Add items, check the total and create a sample invoice."}</p>
      </div>
      <Badge className="mt-1">{live?"Isolated TEST":"Demo Mode"}</Badge>
    </div>
    {live?<TestSales/>:<RecordSaleForm />}
  </div>;
}
