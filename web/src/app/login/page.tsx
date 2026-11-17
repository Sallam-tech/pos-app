import {isTestSalesRender} from "@/server/hosting/sales-render";
import { connection } from "next/server";
import { testLoginRole } from "@/server/hosting/login-render";
import type { Metadata } from "next";
import { DemoAccess } from "@/components/demo/demo-navigation";
import { LoginForm } from "@/components/login/login-form";
import { Brand } from "@/components/shell/shared";
import { ShopName } from "@/components/settings/shop-identity";
import { ConnectivityIndicator } from "@/components/shell/connectivity-indicator";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = {
  title: "Login | Shop POS",
  description: "Shop POS login UI preview. Authentication is not connected.",
};
export default async function LoginPage() {
  await connection();
  const role = testLoginRole();
  return <div className="flex min-h-svh flex-col">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="border-b bg-surface">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Brand /><ThemeSelector />
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col px-4 py-5 outline-none">
      <div className="mx-auto my-auto w-full max-w-[448px]">
        <Card className="px-6 py-6 sm:px-8 sm:py-6">
          <div className="text-center">
            <span className="mx-auto mb-3 grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground"><Icon name="store" className="size-6" /></span>
            <ShopName as="h1" className="page-title break-words [overflow-wrap:anywhere]" />
            <p className="mt-2 text-sm text-muted-foreground">Enter your password to open the shop.</p>
            <div className="mt-3"><Badge>{role ? "Isolated TEST" : "UI Preview"}</Badge></div>
          </div>
          <p id="login-preview-description" className="mt-3 text-sm leading-5 text-muted-foreground">{role ? "Enter your existing password. Every visit requires fresh sign-in. Production remains disabled." : "Secure sign-in is not connected. Use made-up text to preview the form, or explore the demo below."}</p>
          <LoginForm testRole={role} testSales={isTestSalesRender()} />
          <div className="mt-4 border-t pt-3"><ConnectivityIndicator compact /></div>
        </Card>
        {!role && <DemoAccess />}
      </div>
    </main>
    <footer className="px-4 pb-3 text-center text-xs leading-5 text-muted-foreground">{role ? "Isolated TEST only. No real shop accounts or production access." : "Shop-local demo. No accounts are connected."}</footer>
  </div>;
}
