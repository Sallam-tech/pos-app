"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Dialog } from "@/components/ui/dialog";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { ConnectivityIndicator } from "@/components/shell/connectivity-indicator";
import { DemoExitLink } from "@/components/demo/demo-navigation";
import { Brand, BackToLoginLink } from "@/components/shell/shared";
import { DeveloperCredit } from "@/components/demo/developer-credit";

function isProductEditPath(pathname: string) {
  return /^\/admin\/products\/[^/]+\/edit$/.test(pathname);
}
function Navigation({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/admin/dashboard" || pathname === "/admin/expenses";
  const isReports = ["/admin/reports", "/admin/reports/sales", "/admin/reports/profit", "/admin/profit/today", "/admin/sales/today"].includes(pathname);
  const isProducts = pathname === "/admin/products" || pathname === "/admin/products/new" || isProductEditPath(pathname);
  const isInventory = pathname === "/admin/inventory/low-stock" || pathname === "/admin/inventory/available-stock";
  const activeClasses = "border-l-2 border-primary bg-[var(--nav-active)] font-semibold text-primary";
  return <nav aria-label={mobile ? "Mobile navigation" : "Main navigation"} className="mt-8">
    <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Manage shop</p>
    <ul className="grid gap-1">
      <li><Link href="/admin/dashboard" aria-current={isDashboard ? (pathname === "/admin/dashboard" ? "page" : "location") : undefined} onClick={onNavigate} className={"app-nav-link " + (isDashboard ? activeClasses : "text-muted-foreground")}><Icon name="dashboard" />Dashboard</Link></li>
      <li><Link href="/admin/products" aria-current={isProducts ? (pathname === "/admin/products" ? "page" : "location") : undefined} onClick={onNavigate} className={"app-nav-link " + (isProducts ? activeClasses : "text-muted-foreground")}><Icon name="box" />Products</Link></li>
      <li><Link href="/admin/inventory/available-stock" aria-current={isInventory ? (pathname === "/admin/inventory/available-stock" ? "page" : "location") : undefined} onClick={onNavigate}
        className={"app-nav-link " + (isInventory ? activeClasses : "text-muted-foreground")}><Icon name="layers" />Inventory</Link></li>
      <li><Link href="/admin/reports" aria-current={isReports ? (pathname === "/admin/reports" ? "page" : "location") : undefined} onClick={onNavigate}
        className={"app-nav-link " + (isReports ? activeClasses : "text-muted-foreground")}><Icon name="chart" />Reports</Link></li>
      <li className="mt-2 border-t pt-2"><Link href="/admin/investment" aria-current={pathname === "/admin/investment" ? "page" : undefined} onClick={onNavigate}
        className={"app-nav-link " + (pathname === "/admin/investment" ? activeClasses : "text-muted-foreground")}><Icon name="wallet" />Total Investment</Link></li>
      <li><Link href="/admin/daily-closing" aria-current={pathname === "/admin/daily-closing" ? "page" : undefined} onClick={onNavigate} className={"app-nav-link " + (pathname === "/admin/daily-closing" ? activeClasses : "text-muted-foreground")}><Icon name="calendar" />Daily Closing</Link></li>
      <li><Link href="/admin/settings" aria-current={pathname === "/admin/settings" ? "page" : undefined} onClick={onNavigate} className={"app-nav-link " + (pathname === "/admin/settings" ? activeClasses : "text-muted-foreground")}><Icon name="settings" />Settings</Link></li>
    </ul>
  </nav>;
}
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const compactAdminPreview = ["/admin/products", "/admin/products/new", "/admin/dashboard", "/admin/expenses", "/admin/inventory/low-stock", "/admin/inventory/available-stock", "/admin/sales/today", "/admin/profit/today", "/admin/reports", "/admin/reports/sales", "/admin/reports/profit"].includes(pathname) || isProductEditPath(pathname) || ["/admin/investment", "/admin/settings", "/admin/daily-closing"].includes(pathname);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (media.matches) setOpen(false); };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);
  return <div className="flex min-h-svh">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside aria-label="Admin sidebar" className="app-sidebar sticky top-0 hidden h-svh w-[var(--sidebar-width)] shrink-0 flex-col overflow-y-auto border-r p-4 lg:flex">
      <Brand /><Navigation key={pathname} />
      <div className="mt-auto border-t pt-4"><Badge>Demo Mode</Badge><p className="mt-2 text-xs leading-5 text-muted-foreground">Preview access. No sign-in.</p><DemoExitLink /><DeveloperCredit variant="sidebar" /></div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className={"workspace-header flex flex-wrap items-center justify-between sm:px-6 lg:px-8 " + (compactAdminPreview ? "gap-x-4 gap-y-2 px-4 py-3" : "gap-4 p-4")}>
        <div className="flex items-center gap-3">
          <Button className="lg:hidden" variant="outline" size="icon" aria-label="Open navigation" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}><Icon name="menu" /></Button>
          {compactAdminPreview ? <div><p className="text-sm font-bold">Administration</p></div> : <div><p className="text-sm font-semibold">Admin workspace</p><p className="text-xs text-muted-foreground">Layout preview</p></div>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><ConnectivityIndicator compact /><ThemeSelector /><BackToLoginLink /></div>
      </header>
      <main id="main-content" tabIndex={-1} className={"content-container outline-none" + (compactAdminPreview ? " pt-5" : "")}>{children}</main>
    </div>
    <Dialog open={open} onOpenChange={setOpen} title="Admin navigation" description="Choose an Admin page." variant="drawer">
      <Brand /><Navigation key={pathname} mobile onNavigate={() => setOpen(false)} /><div className="mt-5 border-t pt-3"><p className="text-xs text-muted-foreground">Preview only. No sign-in.</p><DemoExitLink /><DeveloperCredit variant="sidebar" /></div>
    </Dialog>
  </div>;
}
