import {connection} from "next/server";
import {readTestInvoicesRender} from "@/server/hosting/invoices-render";
import {TestExpenseFinancials} from "@/components/admin/test-expense-financials";
import type { Metadata } from "next";
import { ReportChartsPreview } from "@/components/admin/report-charts-preview";
import { mockSales } from "@/lib/admin/mock-sales";

export const metadata: Metadata = { title: "Sales Report | Shop POS" };

export default async function SalesChartsPage() {
 await connection();if(readTestInvoicesRender())return <TestExpenseFinancials mode="sales"/>;
  return <ReportChartsPreview kind="sales" sales={mockSales} />;
}
