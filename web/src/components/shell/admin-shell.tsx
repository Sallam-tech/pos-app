"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { Dialog } from "@/components/ui/dialog";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { ConnectivityIndicator } from "@/components/shell/connectivity-indicator";
import { Brand, PreviewLink } from "@/components/shell/shared";

const planned: { name: string; icon: IconName }[] = [
  { name: "Inventory", icon: "layers" },
  { name: "Sales", icon: "sales" }, { name: "Reports", icon: "chart" },
];
function Navigation({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/admin/dashboard";
  const isProducts = pathname === "/admin/products";
  const isInventory = pathname === "/admin/inventory/low-stock";
  const activeClasses = "border-l-3 border-primary bg-muted font-semibold text-primary";
  return <nav aria-label={mobile ? "Mobile navigation" : "Main navigation"} className="mt-8">
    <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workspace</p>
    <ul className="grid gap-2">
      <li><Link href="/admin/dashboard" aria-current={isDashboard ? "page" : undefined} onClick={onNavigate} className={"flex min-h-11 items-center gap-3 rounded-md px-3 py-3 text-sm " + (isDashboard ? activeClasses : "text-muted-foreground")}><Icon name="dashboard" />Dashboard</Link></li>
      <li><Link href="/admin/products" aria-current={isProducts ? "page" : undefined} onClick={onNavigate} className={"flex min-h-11 items-center gap-3 rounded-md px-3 py-3 text-sm " + (isProducts ? activeClasses : "text-muted-foreground")}><Icon name="box" />Products</Link></li>
      {planned.map((item) => <li key={item.name}><span aria-disabled="true" aria-current={item.name === "Inventory" && isInventory ? "location" : undefined} className={"flex min-h-11 items-center gap-3 rounded-md px-3 py-3 text-sm " + (item.name === "Inventory" && isInventory ? activeClasses : "text-muted-foreground")}><Icon name={item.icon} />{item.name}<span className="ml-auto text-xs">Planned</span></span></li>)}
    </ul>
  </nav>;
}
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const compactAdminPreview = ["/admin/products", "/admin/dashboard", "/admin/inventory/low-stock"].includes(pathname);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (media.matches) setOpen(false); };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);
  return <div className="flex min-h-svh">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside aria-label="Admin sidebar" className="sticky top-0 hidden h-svh w-[var(--sidebar-width)] shrink-0 flex-col overflow-y-auto border-r bg-surface p-4 lg:flex">
      <Brand /><Navigation />
      {!compactAdminPreview && <div className="mt-auto border-t pt-4"><p className="mb-2 text-xs leading-5 text-muted-foreground">Admin shell preview<br />Public layout · No access control</p><PreviewLink /></div>}
    </aside>
    <div className="min-w-0 flex-1">
      <header className={"flex flex-wrap items-center justify-between border-b bg-surface sm:px-6 lg:px-8 " + (compactAdminPreview ? "gap-x-4 gap-y-2 p-3" : "gap-4 p-4")}>
        <div className="flex items-center gap-3">
          <Button className="lg:hidden" variant="outline" size="icon" aria-label="Open navigation" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}><Icon name="menu" /></Button>
          {compactAdminPreview ? <ConnectivityIndicator compact /> : <div><p className="text-sm font-semibold">Admin workspace</p><p className="text-xs text-muted-foreground">Layout preview</p></div>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3"><ThemeSelector />{!compactAdminPreview && <PreviewLink />}</div>
        {!compactAdminPreview && <div className="w-full"><ConnectivityIndicator /></div>}
      </header>
      <main id="main-content" tabIndex={-1} className={"content-container outline-none" + (compactAdminPreview ? " pt-5" : "")}>{children}</main>
    </div>
    <Dialog open={open} onOpenChange={setOpen} title="Admin navigation" description="Mock navigation. Planned sections are unavailable in this preview." variant="drawer">
      <Brand /><Navigation mobile onNavigate={() => setOpen(false)} />{!compactAdminPreview && <div className="mt-6 border-t pt-4"><PreviewLink /></div>}
    </Dialog>
  </div>;
}
