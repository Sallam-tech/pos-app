import {readTestInvoicesRender} from "@/server/hosting/invoices-render";
import {connection} from "next/server";
import {isTestSalesRender} from "@/server/hosting/sales-render";
import {TestSalesHistory} from "@/components/pos/test-sales";
import type { Metadata } from "next";
import { WorkspacePage } from "@/components/shell/workspace-page";
import { SalesHistoryPreview } from "@/components/pos/sales-history-preview";
import { mockSales } from "@/lib/admin/mock-sales";
export const metadata: Metadata = { title: "Sales History | Shop POS" };
export default async function SalesHistoryPage() {
  await connection();const live=isTestSalesRender();
  // Explicit owner-authorized demo projection; not production general-history permission.
  const sales = mockSales.map(({ id, businessDate, productName, quantity, unitPricePaise }) => ({ id, businessDate, productName, quantity, unitPricePaise }));
  return <WorkspacePage route="/pos/history" title="Sales History" badge={live?"Isolated TEST":"Demo Mode"}>
    {live?<TestSalesHistory revisions={readTestInvoicesRender()}/>:<SalesHistoryPreview sales={sales} />}
  </WorkspacePage>;
}
