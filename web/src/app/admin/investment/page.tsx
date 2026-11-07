import { PageHeading } from "@/components/shell/page-heading";
import type { Metadata } from "next";
import { AdminInvestmentPreview } from "@/components/demo/admin-investment-preview";
import { Badge } from "@/components/ui/badge";
import "./investment.css";

export const metadata: Metadata = { title: "Investment & Stock Value | Shop POS" };
export default function InvestmentPage() {
  return <div className="investment-workspace">
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-3"><PageHeading route={"/admin/investment"}>Investment &amp; Stock Value</PageHeading><Badge>Demo Data</Badge></div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Product purchases and the buying-cost value of remaining stock.</p></div>
      </div>
      <AdminInvestmentPreview />
    </div>
  </div>;
}
