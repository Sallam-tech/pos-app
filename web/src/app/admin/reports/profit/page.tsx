import {readTestReportsRender} from "@/server/hosting/reports-render";
import {connection} from "next/server";
import {readTestExpensesRender} from "@/server/hosting/expenses-render";
import {TestExpenseFinancials} from "@/components/admin/test-expense-financials";
import {TestSavedFinancialReport} from "@/components/admin/test-saved-financial-report";
import type { Metadata } from "next";
import { LiveDataRequired } from "@/components/shell/live-data-required";

export const metadata: Metadata = { title: "Profit Report | Shop POS" };

export default async function ProfitChartsPage() {
 await connection();
 if(readTestReportsRender())return <TestSavedFinancialReport kind="profit"/>;
 if(readTestExpensesRender())return <TestExpenseFinancials authoritativeReports={false} mode="profit"/>;
 return <LiveDataRequired route="/admin/reports/profit" title="Profit Report"/>;
}
