import {readTestInvoicesRender} from "@/server/hosting/invoices-render";
import {connection} from "next/server";
import {isTestSalesRender} from "@/server/hosting/sales-render";
import {TestSalesHistory} from "@/components/pos/test-sales";
import type { Metadata } from "next";
import { WorkspacePage } from "@/components/shell/workspace-page";
import { LiveDataRequired } from "@/components/shell/live-data-required";
export const metadata: Metadata = { title: "Sales History | Shop POS" };
export default async function SalesHistoryPage() {
  await connection();
  if(!isTestSalesRender())return <LiveDataRequired route="/pos/history" title="Sales History"/>;
  return <WorkspacePage route="/pos/history" title="Sales History" badge="Shop">
    <TestSalesHistory revisions={readTestInvoicesRender()}/>
  </WorkspacePage>;
}
