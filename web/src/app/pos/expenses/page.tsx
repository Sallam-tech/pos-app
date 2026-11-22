import {connection} from "next/server";
import {readTestExpensesRender} from "@/server/hosting/expenses-render";
import {TestExpenses} from "@/components/pos/test-expenses";
import type { Metadata } from "next";
import { LiveDataRequired } from "@/components/shell/live-data-required";
export const metadata: Metadata = { title: "Shop Expenses | Shop POS" };
export default async function ExpensesPage() {
 await connection();
  if(readTestExpensesRender())return <TestExpenses/>;
  return <LiveDataRequired route="/pos/expenses" title="Shop Expenses"/>;
}
