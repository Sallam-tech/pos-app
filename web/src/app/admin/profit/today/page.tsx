import type { Metadata } from "next";
import Link from "next/link";
import { TodayProfitPreview } from "@/components/admin/today-profit-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockSales, mockSalesBusinessDate } from "@/lib/admin/mock-sales";

export const metadata: Metadata = { title: "Profit Report | Shop POS" };

export default function TodayProfitPage() {
  return <>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-3"><h1 className="page-title">Profit Report</h1><Badge>Demo Data</Badge></div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Fixed demo Today: <time dateTime={mockSalesBusinessDate.iso}>{mockSalesBusinessDate.label}</time> ({mockSalesBusinessDate.timeZone}). Fixed examples, not live sales.</p>
      </div>
      <Button asChild variant="outline"><Link href="/admin/dashboard">Back to Dashboard</Link></Button>
    </div>
    <TodayProfitPreview sales={mockSales} />
  </>;
}
