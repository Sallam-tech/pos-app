import Link from "next/link";
import { getMockLowStockProducts, mockInventory } from "@/lib/admin/mock-inventory";
import { formatMockRevenue, getMockRevenuePaise, mockRevenueDecimal } from "@/lib/admin/mock-sales";
import { getFictionalProfitSales } from "@/lib/admin/mock-historical-costs";
import { calculateMockProfitTotals, formatProfitMoney, profitDecimal } from "@/lib/admin/mock-profit";
import { selectMockSalesPeriod } from "@/lib/admin/mock-sales-report";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  // Inventory counts share the same fixture as the mock inventory lists.
  // Profit uses separately labeled fictional sale-time costs, never current product prices.
  const revenuePaise = getMockRevenuePaise();
  const profitSales = selectMockSalesPeriod(getFictionalProfitSales(), { kind: "today" }).sales;
  const profit = calculateMockProfitTotals(profitSales).grossProfitPaise;
  const productCount = String(mockInventory.length);
  const lowStockCount = String(getMockLowStockProducts().length);
  const availableStock = String(mockInventory.reduce((total, product) => total + product.quantity, 0));
  const mockSummaryCards = [
    { id: "total-products", label: "Total Products", value: productCount, display: productCount, href: "/admin/products" },
    { id: "available-stock", label: "Available Stock", value: availableStock, display: availableStock, href: "/admin/inventory/available-stock" },
    { id: "low-stock-products", label: "Low Stock Products", value: lowStockCount, display: lowStockCount, href: "/admin/inventory/low-stock" },
    { id: "today-revenue", label: "Today's Sales Revenue (PKR)", value: mockRevenueDecimal(revenuePaise), display: formatMockRevenue(revenuePaise), href: "/admin/sales/today" },
    { id: "today-profit", label: "Today's Profit", value: profit === null ? null : profitDecimal(profit), display: profit === null ? "Unavailable" : formatProfitMoney(profit), href: "/admin/profit/today", note: profit === null ? "Historical costs or exact sale data are missing or invalid." : "Example purchase costs for demo sales." },
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
            {card.value === null ? <span>{card.display}</span> : <data value={card.value}>{card.display}</data>}
          </dd>
          {"note" in card && <dd id={card.id + "-note"} className="mt-3 text-xs leading-5 text-muted-foreground">{card.note}</dd>}
          <dd className="mt-3 text-sm text-muted-foreground">
            <span>Mock data</span>
            {"href" in card && <Link href={card.href}
              aria-labelledby={card.id + "-label"} aria-describedby={card.id + "-value dashboard-mock-notice" + ("note" in card ? " " + card.id + "-note" : "")}
              className="absolute inset-0 flex items-end justify-end rounded-lg p-4">
              <span className="font-semibold text-primary underline underline-offset-4">{"note" in card ? "View report" : "View list"}</span>
            </Link>}
          </dd>
        </Card>)}
      </dl>
    </section>
  </>;
}
