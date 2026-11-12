import {readTestExpensesRender} from "@/server/hosting/expenses-render";
import {readTestReturnsRender} from "@/server/hosting/returns-render";
import {connection} from "next/server";
import {isTestSalesRender} from "@/server/hosting/sales-render";
import type { ReactNode } from "react";
import { SalespersonShell } from "@/components/shell/salesperson-shell";
export default async function SalespersonLayout({ children }: { children: ReactNode }) {
  await connection();
  return <SalespersonShell testSales={isTestSalesRender()} testReturns={readTestReturnsRender()} testExpenses={readTestExpensesRender()}>{children}</SalespersonShell>;
}
