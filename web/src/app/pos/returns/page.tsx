import {connection} from "next/server";
import {readTestReturnsRender} from "@/server/hosting/returns-render";
import {TestReturns} from "@/components/pos/test-returns";
import type { Metadata } from "next";
import { WorkspacePage } from "@/components/shell/workspace-page";
import { AdminReturnPreview } from "@/components/demo/admin-return-preview";
import { mockSales, mockSalesBusinessDate } from "@/lib/admin/mock-sales";
export const metadata: Metadata = { title: "Return & Refund | Shop POS" };
export default async function ReturnsPage() {
  await connection();
  if(readTestReturnsRender())return <WorkspacePage route="/pos/returns" title="Return & Refund"><TestReturns role="SALESPERSON"/></WorkspacePage>;
  // Explicit safe projection for this owner-approved return preview, not general sales history.
  const sales = mockSales.map(({ id, productName, quantity, unitPricePaise }) => ({ id, productName, quantity, unitPricePaise }));
  return <WorkspacePage route="/pos/returns" title="Return & Refund">
    <AdminReturnPreview sales={sales} businessDateLabel={mockSalesBusinessDate.label} />
  </WorkspacePage>;
}
