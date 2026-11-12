"use client";

import {TestInventoryExit} from "@/components/admin/test-inventory-exit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DemoExitLink } from "@/components/demo/demo-navigation";
import { Brand, BackToLoginLink } from "@/components/shell/shared";
import { DeveloperCredit } from "@/components/demo/developer-credit";
import { ConnectivityIndicator } from "@/components/shell/connectivity-indicator";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/icon";

const destinations: { href: string; name: string; icon: IconName }[] = [
  { href: "/pos", name: "Make a Sale", icon: "sales" },
  { href: "/pos/history", name: "Sales History", icon: "layers" },
  { href: "/pos/returns", name: "Return Item", icon: "return" },
  { href: "/pos/expenses", name: "Shop Expenses", icon: "wallet" },
];
function SalespersonNavigation({ mobile = false,testSales=false,testReturns=false,testExpenses=false }: { mobile?: boolean;testSales?:boolean;testReturns?:boolean;testExpenses?:boolean }) {
  const pathname = usePathname();
  return <nav aria-label={mobile ? "Mobile Salesperson navigation" : "Salesperson navigation"} className={mobile ? "grid grid-cols-4 gap-1 border-b bg-surface p-2 lg:hidden" : "mt-5 grid gap-1"}>
    {destinations.filter(d=>!testSales||d.href==="/pos"||d.href==="/pos/history"||(testReturns&&d.href==="/pos/returns")||(testExpenses&&d.href==="/pos/expenses")).map((item) => <Link key={item.href} href={item.href} prefetch={false} aria-current={pathname === item.href ? "page" : undefined}
      className={mobile ? "flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-center text-sm font-semibold " + (pathname === item.href ? "bg-[var(--nav-active)] text-[var(--nav-active-foreground)]" : "text-muted-foreground hover:bg-muted") : "app-nav-link"}>
      <Icon name={item.icon} className="size-5 shrink-0" /><span>{item.name}</span>
    </Link>)}
  </nav>;
}
export function SalespersonShell({ children,testSales=false,testReturns=false,testExpenses=false }: { children: ReactNode;testSales?:boolean;testReturns?:boolean;testExpenses?:boolean }) {
  return <div className="flex min-h-svh">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside aria-label="Salesperson sidebar" className="app-sidebar sticky top-0 hidden h-svh w-[var(--sidebar-width)] shrink-0 flex-col overflow-y-auto border-r p-4 lg:flex">
      <Brand />
      <p className="mt-7 text-xs font-bold uppercase tracking-widest text-muted-foreground">Sales workspace</p>
      <SalespersonNavigation testSales={testSales} testReturns={testReturns} testExpenses={testExpenses}/>
      <div className="mt-auto border-t pt-4"><Badge>{testSales?"Isolated TEST":"Demo Mode"}</Badge><p className="mt-2 text-xs leading-5 text-muted-foreground">{testSales?"Authenticated TEST workspace; production disabled.":"Preview access. No sign-in."}</p>{!testSales&&<DemoExitLink />}<DeveloperCredit variant="sidebar" /></div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="workspace-header flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <div><div className="lg:hidden"><Brand /></div><p className="hidden text-sm font-bold lg:block">Sales workspace</p></div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><ConnectivityIndicator compact /><ThemeSelector />{testSales?<TestInventoryExit/>:<BackToLoginLink />}</div>
      </header>
      <SalespersonNavigation mobile testSales={testSales} testReturns={testReturns} testExpenses={testExpenses}/>
      <main id="main-content" tabIndex={-1} className="content-container outline-none">{children}</main>
      <footer className="border-t px-4 py-3 text-sm lg:hidden">{testSales?<TestInventoryExit label="Exit TEST"/>:<DemoExitLink />}</footer>
    </div>
  </div>;
}
