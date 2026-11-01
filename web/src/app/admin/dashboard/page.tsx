import Link from "next/link";
import { getMockLowStockProducts } from "@/lib/admin/mock-inventory";
import { Card } from "@/components/ui/card";
import { ComponentPreview } from "@/components/patterns/component-preview";
import { PageHeader, PreviewFooter, PreviewNotice } from "@/components/shell/shared";

export default function DashboardPage() {
  // Only the low-stock count is derived, from the same mock fixture as its list.
  // All other figures remain independent display-only examples.
  const lowStockCount = String(getMockLowStockProducts().length);
  const mockSummaryCards = [
    { id: "total-products", label: "Total Products", value: "6", display: "6" },
    { id: "available-stock", label: "Available Stock", value: "123", display: "123" },
    { id: "low-stock-products", label: "Low Stock Products", value: lowStockCount, display: lowStockCount },
    { id: "today-revenue", label: "Today's Sales Revenue (PKR)", value: "25690.00", display: "Rs. 25,690.00" },
    { id: "today-profit", label: "Today's Profit (PKR)", value: "4860.00", display: "Rs. 4,860.00" },
  ] as const;

  return <>
    <PageHeader title="Dashboard" breadcrumb="Admin" description="Example shop figures for UI review." />
    <PreviewNotice />
    <section aria-labelledby="dashboard-overview-title" aria-describedby="dashboard-mock-notice">
      <h2 id="dashboard-overview-title" className="section-title">Shop overview</h2>
      <p id="dashboard-mock-notice" className="mt-2 text-sm leading-6 text-muted-foreground">
        Mock data only. These figures are examples, not live shop records.
      </p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 min-[90rem]:grid-cols-5">
        {mockSummaryCards.map((card) => <Card key={card.id} role="group"
          aria-labelledby={card.id + "-label"} aria-describedby="dashboard-mock-notice" className={card.id === "low-stock-products" ? "relative sm:p-4 hover:border-primary" : "sm:p-4"}>
          <dt id={card.id + "-label"} className="min-h-10 text-sm font-semibold leading-5 text-muted-foreground">{card.label}</dt>
          <dd id={card.id + "-value"} className="numeric mt-3 break-words text-[22px] font-bold leading-[30px] xl:text-[26px] xl:leading-[34px]">
            <data value={card.value}>{card.display}</data>
          </dd>
          <dd className="mt-3 text-sm text-muted-foreground">
            <span>Mock data</span>
            {card.id === "low-stock-products" && <Link href="/admin/inventory/low-stock"
              aria-labelledby={card.id + "-label"} aria-describedby={card.id + "-value dashboard-mock-notice"}
              className="absolute inset-0 flex items-end justify-end rounded-lg p-4">
              <span className="font-semibold text-primary underline underline-offset-4">View list</span>
            </Link>}
          </dd>
        </Card>)}
      </dl>
    </section>
    <div className="mt-6"><ComponentPreview /></div>
    <PreviewFooter />
  </>;
}
