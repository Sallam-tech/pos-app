import {connection} from "next/server";
import {readTestReportsRender} from "@/server/hosting/reports-render";
import {TestReportsExplorer} from "@/components/admin/test-reports";
import { PageHeading } from "@/components/shell/page-heading";
import type { Metadata } from "next";
import { AdminInvestmentPreview } from "@/components/demo/admin-investment-preview";
import { Badge } from "@/components/ui/badge";
import "./investment.css";

export const metadata: Metadata = { title: "Stock Value | Shop POS" };
export default async function InvestmentPage() {
 await connection();if(readTestReportsRender())return <TestReportsExplorer kind="stock"/>;
  return <div className="investment-workspace">
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-3"><PageHeading route={"/admin/investment"}>Stock Value</PageHeading><Badge>Demo Data</Badge></div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Buying-cost value of products currently available in the shop.</p></div>
      </div>
      <AdminInvestmentPreview />
    </div>
  </div>;
}
