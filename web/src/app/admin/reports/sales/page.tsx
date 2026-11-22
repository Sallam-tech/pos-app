import {readTestReportsRender} from "@/server/hosting/reports-render";
import {connection} from "next/server";
import {readTestInvoicesRender} from "@/server/hosting/invoices-render";
import {TestExpenseFinancials} from "@/components/admin/test-expense-financials";
import {TestSavedFinancialReport} from "@/components/admin/test-saved-financial-report";
import type { Metadata } from "next";
import { LiveDataRequired } from "@/components/shell/live-data-required";

export const metadata: Metadata = { title: "Sales Report | Shop POS" };

export default async function SalesChartsPage() {
 await connection();
 if(readTestReportsRender())return <TestSavedFinancialReport kind="sales"/>;
 if(readTestInvoicesRender())return <TestExpenseFinancials authoritativeReports={false} mode="sales"/>;
 return <LiveDataRequired route="/admin/reports/sales" title="Sales Report"/>;
}
