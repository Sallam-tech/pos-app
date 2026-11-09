import Link from "next/link";
import { Button } from "@/components/ui/button";
import "./dashboard.css";
import { getMockLowStockProducts, mockInventory } from "@/lib/admin/mock-inventory";
import { formatMockRevenue, getMockRevenuePaise, mockRevenueDecimal, mockSalesBusinessDate } from "@/lib/admin/mock-sales";
import { getFictionalProfitSales } from "@/lib/admin/mock-historical-costs";
import { calculateMockProfitTotals, formatProfitMoney, profitDecimal } from "@/lib/admin/mock-profit";
import { selectMockSalesPeriod } from "@/lib/admin/mock-sales-report";
import { getAdminExpenseReviewEntries, reviewExpenses } from "@/lib/admin/expense-review-preview";
import { demoMoneyDecimal, formatDemoMoney } from "@/lib/demo/money";
import { getDemoInvestmentOverview } from "@/lib/admin/stock-investment-preview";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";

export default function DashboardPage() {
  // Inventory counts share the same fixture as the mock inventory lists.
  // Profit uses separately labeled fictional sale-time costs, never current product prices.
  const revenuePaise = getMockRevenuePaise();
  const profitSales = selectMockSalesPeriod(getFictionalProfitSales(), { kind: "today" }).sales;
  const profit = calculateMockProfitTotals(profitSales).grossProfitPaise;
  const productCount = String(mockInventory.length);
  const lowStockCount = String(getMockLowStockProducts().length);
  const availableStock = String(mockInventory.reduce((total, product) => total + product.quantity, 0));
  const expenses = reviewExpenses(getAdminExpenseReviewEntries(), mockSalesBusinessDate.iso).daily;
  const investment = getDemoInvestmentOverview();
  const mockSummaryCards = [
    { id: "total-products", label: "Total Products", value: productCount, display: productCount, href: "/admin/products" },
    { id: "available-stock", label: "Available Stock", value: availableStock, display: availableStock, href: "/admin/inventory/available-stock" },
    { id: "low-stock-products", label: "Low Stock Products", value: lowStockCount, display: lowStockCount, href: "/admin/inventory/low-stock" },
    { id: "today-revenue", label: "Today's Sales Revenue (PKR)", value: mockRevenueDecimal(revenuePaise), display: formatMockRevenue(revenuePaise), href: "/admin/sales/today" },
    { id: "today-profit", label: "Today's Gross Profit", value: profit === null ? null : profitDecimal(profit), display: profit === null ? "Unavailable" : formatProfitMoney(profit), href: "/admin/profit/today", note: profit === null ? "Historical costs or exact sale data are missing or invalid." : "Example purchase costs for demo sales." },
    { id: "shop-expenses", label: "Shop Expenses", value: expenses === null ? null : demoMoneyDecimal(expenses), display: expenses === null ? "Unavailable" : formatDemoMoney(expenses), href: "/admin/expenses", note: "Demo day: " + mockSalesBusinessDate.label + ". Temporary entries are not shared with Admin." },
    { id: "stock-value", label: "Stock Value", value: investment.stockValuePaise === null ? null : demoMoneyDecimal(investment.stockValuePaise), display: investment.stockValuePaise === null ? "Not available" : formatDemoMoney(investment.stockValuePaise), href: "/admin/investment", note: "Buying costs not recorded." },
  ] as const;

  const sections = [
    { title: "Sales & Profit", icon: "chart", ids: ["today-revenue", "today-profit", "shop-expenses"] },
    { title: "Inventory Overview", icon: "layers", ids: ["total-products", "available-stock", "low-stock-products"] },
    { title: "Stock Overview", icon: "wallet", ids: ["stock-value"] },
  ] as const;
  return <>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex flex-wrap items-center gap-3"><h1 className="page-title">Dashboard</h1><Badge>Demo Data</Badge></div>
        <p className="mt-1 text-sm text-muted-foreground">Quick view of your shop today.</p></div>
      <Button asChild size="sm"><Link href="/admin/daily-closing"><Icon name="calendar" className="size-4" />Close Day</Link></Button>
    </div>
    <section aria-labelledby="dashboard-overview-title" aria-describedby="dashboard-mock-notice">
      <h2 id="dashboard-overview-title" className="sr-only">Shop overview</h2>
      <p id="dashboard-mock-notice" className="sr-only">Mock data only. These figures are examples, not live shop records.</p>
      {sections.map((section, index) => <section key={section.title} className="dashboard-section" aria-labelledby={"dashboard-section-" + index}>
        <h3 id={"dashboard-section-" + index} className="dashboard-section-title"><Icon name={section.icon} />{section.title}</h3>
        <dl className={"grid gap-3 " + (section.ids.length === 1 ? "sm:max-w-xl" : "sm:grid-cols-3")}>
          {section.ids.map((id) => {
            const card = mockSummaryCards.find((item) => item.id === id)!;
            const icon = id === "total-products" ? "box" : id === "available-stock" ? "layers" : id === "low-stock-products" ? "alert" : id === "today-revenue" ? "sales" : id === "stock-value" || id === "today-profit" ? "chart" : "wallet";
            const tone = id === "today-revenue" || id === "today-profit" ? "sales" : id === "low-stock-products" ? "warning" : index === 2 ? "investment" : "neutral";
            return <Card key={id} role="group" aria-labelledby={id + "-label"} aria-describedby="dashboard-mock-notice" className="dashboard-metric p-4 sm:p-4" data-tone={tone}>
              <span className="dashboard-metric-icon" aria-hidden="true"><Icon name={icon} className="size-6" /></span>
              <div className="min-w-0">
                <dt id={id + "-label"}>{id === "today-revenue" ? <><span aria-hidden="true">Today’s Sales Revenue</span><span className="sr-only">{card.label}</span></> : card.label}</dt>
                <dd id={id + "-value"} className="dashboard-value numeric">{card.value === null ? <span>{card.display}</span> : <data value={card.value}>{card.display}</data>}</dd>
                {"note" in card && <dd id={id + "-note"} className={index === 2 ? "mt-1 text-xs text-muted-foreground" : "sr-only"}>{card.note}</dd>}
              </div>
              <Link href={card.href} aria-labelledby={id + "-label"} aria-describedby={id + "-value dashboard-mock-notice" + ("note" in card ? " " + id + "-note" : "")} className="absolute inset-0 rounded-lg" />
            </Card>;
          })}
        </dl>
      </section>)}
    </section>
  </>;
}
