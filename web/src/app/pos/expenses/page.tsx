import type { Metadata } from "next";
import { AdminExpensesPreview } from "@/components/demo/admin-expenses-preview";
export const metadata: Metadata = { title: "Shop Expenses | Shop POS" };
export default function ExpensesPage() {
  return <AdminExpensesPreview />;
}
