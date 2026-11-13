import {readTestReportsRender} from "@/server/hosting/reports-render";
import {connection} from "next/server";
import {readTestExpensesRender} from "@/server/hosting/expenses-render";
import {TestExpenseFinancials} from "@/components/admin/test-expense-financials";
import type { Metadata } from "next";
import { DailyClosingPreview } from "@/components/admin/daily-closing-preview";
export const metadata: Metadata = { title: "Daily Closing | Shop POS" };
export default async function DailyClosingPage() {
 await connection();
 if(readTestExpensesRender())return <TestExpenseFinancials authoritativeReports={readTestReportsRender()} mode="closing"/>; return <DailyClosingPreview />; }
