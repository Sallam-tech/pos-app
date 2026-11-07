import type { Metadata } from "next";
import { ReportChartsPreview } from "@/components/admin/report-charts-preview";
import { mockSales } from "@/lib/admin/mock-sales";

export const metadata: Metadata = { title: "Sales Report | Shop POS" };

export default function SalesChartsPage() {
  return <ReportChartsPreview kind="sales" sales={mockSales} />;
}
