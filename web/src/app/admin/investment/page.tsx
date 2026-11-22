import {connection} from "next/server";
import {readTestReportsRender} from "@/server/hosting/reports-render";
import {TestReportsExplorer} from "@/components/admin/test-reports";
import type { Metadata } from "next";
import { LiveDataRequired } from "@/components/shell/live-data-required";

export const metadata: Metadata = { title: "Stock Value | Shop POS" };
export default async function InvestmentPage() {
 await connection();
 if(readTestReportsRender())return <TestReportsExplorer kind="stock"/>;
 return <LiveDataRequired route="/admin/investment" title="Stock Value"/>;
}
