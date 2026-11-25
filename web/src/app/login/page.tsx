import {isTestSalesRender} from "@/server/hosting/sales-render";
import { connection } from "next/server";
import { testLoginRole } from "@/server/hosting/login-render";
import type { Metadata } from "next";
import { LoginForm } from "@/components/login/login-form";
import { Brand } from "@/components/shell/shared";
import { ShopName } from "@/components/settings/shop-identity";
import { ConnectivityIndicator } from "@/components/shell/connectivity-indicator";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ShopLogo } from "@/components/brand/shop-logo";

export const metadata: Metadata = {
  title: "Login | Shop POS",
  description: "Shop POS sign-in.",
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
            <ShopLogo className="mx-auto mb-3 size-28 rounded-full bg-white object-contain" />
            <ShopName as="h1" className="page-title break-words [overflow-wrap:anywhere]" />
            <p className="mt-2 text-sm text-muted-foreground">{role ? "Enter your password to open the shop." : "Open Shop POS from the desktop app to sign in."}</p>
            {role && <div className="mt-3"><Badge>Shop</Badge></div>}
          </div>
          {role ? <><p id="login-preview-description" className="mt-3 text-sm leading-5 text-muted-foreground">Enter your existing password. Every visit requires fresh sign-in.</p>
          <LoginForm testRole={role} testSales={isTestSalesRender()} /></> : <p role="status" className="mt-4 rounded-md border bg-card p-3 text-sm leading-5 text-muted-foreground"><strong className="block text-foreground">Shop database not connected</strong>Sign-in works only inside the Shop POS desktop app.</p>}
          {role && <div className="mt-4 border-t pt-3"><ConnectivityIndicator compact /></div>}
        </Card>
      </div>
    </main>
    <footer className="px-4 pb-3 text-center text-xs leading-5 text-muted-foreground">{role ? "Saved on this computer." : "No accounts are connected outside the desktop app."}</footer>
  </div>;
}
