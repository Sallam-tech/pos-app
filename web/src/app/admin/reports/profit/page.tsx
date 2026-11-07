import type { Metadata } from "next";
import { ReportChartsPreview } from "@/components/admin/report-charts-preview";
import { getFictionalProfitSales } from "@/lib/admin/mock-historical-costs";

export const metadata: Metadata = { title: "Profit Report | Shop POS" };

export default function ProfitChartsPage() {
  return <ReportChartsPreview kind="profit" sales={getFictionalProfitSales()} />;
}
