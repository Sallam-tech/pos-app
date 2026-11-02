import Link from "next/link";
import { getMockLowStockProducts, mockInventory } from "@/lib/admin/mock-inventory";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  // Inventory counts share the same fixture as the mock inventory lists.
  // Financial figures remain independent display-only examples.
  const productCount = String(mockInventory.length);
  const lowStockCount = String(getMockLowStockProducts().length);
  const availableStock = String(mockInventory.reduce((total, product) => total + product.quantity, 0));
  const mockSummaryCards = [
    { id: "total-products", label: "Total Products", value: productCount, display: productCount, href: "/admin/products" },
    { id: "available-stock", label: "Available Stock", value: availableStock, display: availableStock, href: "/admin/inventory/available-stock" },
    { id: "low-stock-products", label: "Low Stock Products", value: lowStockCount, display: lowStockCount, href: "/admin/inventory/low-stock" },
    { id: "today-revenue", label: "Today's Sales Revenue (PKR)", value: "25690.00", display: "Rs. 25,690.00" },
    { id: "today-profit", label: "Today's Profit (PKR)", value: "4860.00", display: "Rs. 4,860.00" },
  ] as const;

  return <>
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-3"><h1 className="page-title">Dashboard</h1><Badge>Demo Data</Badge></div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">Simulated shop figures, not live business records.</p>
    </div>
    <section aria-labelledby="dashboard-overview-title" aria-describedby="dashboard-mock-notice">
      <h2 id="dashboard-overview-title" className="section-title">Shop overview</h2>
      <p id="dashboard-mock-notice" className="sr-only">
        Mock data only. These figures are examples, not live shop records.
      </p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 min-[90rem]:grid-cols-5">
        {mockSummaryCards.map((card) => <Card key={card.id} role="group"
          aria-labelledby={card.id + "-label"} aria-describedby="dashboard-mock-notice" className={"href" in card ? "relative sm:p-4 hover:border-primary" : "sm:p-4"}>
          <dt id={card.id + "-label"} className="min-h-10 text-sm font-semibold leading-5 text-muted-foreground">{card.label}</dt>
          <dd id={card.id + "-value"} className="numeric mt-3 break-words text-[22px] font-bold leading-[30px] xl:text-[26px] xl:leading-[34px]">
            <data value={card.value}>{card.display}</data>
          </dd>
          <dd className="mt-3 text-sm text-muted-foreground">
            <span>Mock data</span>
            {"href" in card && <Link href={card.href}
              aria-labelledby={card.id + "-label"} aria-describedby={card.id + "-value dashboard-mock-notice"}
              className="absolute inset-0 flex items-end justify-end rounded-lg p-4">
              <span className="font-semibold text-primary underline underline-offset-4">View list</span>
            </Link>}
          </dd>
        </Card>)}
      </dl>
    </section>
  </>;
}
