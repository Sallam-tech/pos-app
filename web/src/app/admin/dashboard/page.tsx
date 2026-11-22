import {readTestReportsRender} from "@/server/hosting/reports-render";
import {connection} from "next/server";
import {readTestExpensesRender} from "@/server/hosting/expenses-render";
import {TestExpenseFinancials} from "@/components/admin/test-expense-financials";
import {LiveDataRequired} from "@/components/shell/live-data-required";
import "./dashboard.css";

export default async function DashboardPage() {
 await connection();
 if(readTestExpensesRender())return <TestExpenseFinancials authoritativeReports={readTestReportsRender()} mode="dashboard"/>;
 return <LiveDataRequired route="/admin/dashboard" title="Dashboard"/>;
}
