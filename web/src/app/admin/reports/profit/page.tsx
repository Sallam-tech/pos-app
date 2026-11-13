import {readTestReportsRender} from "@/server/hosting/reports-render";
import {connection} from "next/server";
import {readTestExpensesRender} from "@/server/hosting/expenses-render";
import {TestExpenseFinancials} from "@/components/admin/test-expense-financials";
import type { Metadata } from "next";
import { ReportChartsPreview } from "@/components/admin/report-charts-preview";
import { getFictionalProfitSales } from "@/lib/admin/mock-historical-costs";

export const metadata: Metadata = { title: "Profit Report | Shop POS" };

export default async function ProfitChartsPage() {
 await connection();
 if(readTestExpensesRender())return <TestExpenseFinancials authoritativeReports={readTestReportsRender()} mode="profit"/>;
  return <ReportChartsPreview kind="profit" sales={getFictionalProfitSales()} />;
}
