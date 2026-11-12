import {connection} from "next/server";
import {readTestExpensesRender} from "@/server/hosting/expenses-render";
import {TestExpenses} from "@/components/pos/test-expenses";
import { PageHeading } from "@/components/shell/page-heading";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { ExpenseReviewPreview } from "@/components/admin/expense-review-preview";
import { getAdminExpenseReviewEntries } from "@/lib/admin/expense-review-preview";
import { mockSalesBusinessDate } from "@/lib/admin/mock-sales";

export const metadata: Metadata = { title: "Shop Expenses | Shop POS" };
export default async function AdminExpensesPage() {
 await connection();
  if(readTestExpensesRender())return <TestExpenses admin/>;
  return <>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex flex-wrap items-center gap-3"><PageHeading route={"/admin/expenses"}>Shop Expenses</PageHeading><Badge>Demo Data</Badge></div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Review expenses for a business day.</p></div>
    </div>
    <ExpenseReviewPreview entries={getAdminExpenseReviewEntries()} initialBusinessDay={mockSalesBusinessDate.iso} />
  </>;
}
