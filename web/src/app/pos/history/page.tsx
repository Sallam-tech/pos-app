import type { Metadata } from "next";
import { WorkspacePage } from "@/components/shell/workspace-page";
import { SalesHistoryPreview } from "@/components/pos/sales-history-preview";
import { mockSales } from "@/lib/admin/mock-sales";
export const metadata: Metadata = { title: "Sales History | Shop POS" };
export default function SalesHistoryPage() {
  // Explicit owner-authorized demo projection; not production general-history permission.
  const sales = mockSales.map(({ id, businessDate, productName, quantity, unitPricePaise }) => ({ id, businessDate, productName, quantity, unitPricePaise }));
  return <WorkspacePage route="/pos/history" title="Sales History">
    <SalesHistoryPreview sales={sales} />
  </WorkspacePage>;
}
