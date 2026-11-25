import {readTestCashRender} from "@/server/hosting/cash-render";
import {connection} from "next/server";
import {isTestSalesRender} from "@/server/hosting/sales-render";
import {TestSales} from "@/components/pos/test-sales";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { LiveDataRequired } from "@/components/shell/live-data-required";

export const metadata: Metadata = { title: "Make a Sale | Shop POS" };

export default async function PosPage() {
  await connection();
  if(!isTestSalesRender())return <LiveDataRequired route="/pos" title="Make a Sale"/>;
  return <div className="mx-auto max-w-3xl">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="page-title">Make a Sale</h1>
        <p className="mt-1 text-sm text-muted-foreground">Add items, review and save an isolated TEST invoice.</p>
      </div>
      <Badge className="mt-1">Shop</Badge>
    </div>
    <TestSales cashManaged={readTestCashRender()}/>
  </div>;
}
