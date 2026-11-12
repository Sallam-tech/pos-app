import {connection} from "next/server";
import {readTestExpensesRender} from "@/server/hosting/expenses-render";
import {TestExpenses} from "@/components/pos/test-expenses";
import type { Metadata } from "next";
import { AdminExpensesPreview } from "@/components/demo/admin-expenses-preview";
export const metadata: Metadata = { title: "Shop Expenses | Shop POS" };
export default async function ExpensesPage() {
 await connection();
  if(readTestExpensesRender())return <TestExpenses/>;
  return <AdminExpensesPreview />;
}
