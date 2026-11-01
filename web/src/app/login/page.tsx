import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/login/login-form";
import { Brand } from "@/components/shell/shared";
import { ConnectivityIndicator } from "@/components/shell/connectivity-indicator";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Login | Shop POS",
  description: "Shop POS login UI preview. Authentication is not connected.",
};

export default function LoginPage() {
  return <div className="flex min-h-svh flex-col">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3 px-4 py-2 sm:px-6">
      <Badge>Mock UI</Badge>
      <ThemeSelector />
    </header>
    <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col px-4 py-2 outline-none">
      <div className="mx-auto my-auto w-full max-w-md">
        <Card className="px-6 py-4 sm:px-8 sm:py-4">
          <Brand />
          <h1 className="page-title mt-3">Login</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Welcome to your shop workspace.</p>
          <div id="login-preview-description" className="mt-3 rounded-md bg-muted px-3 py-2 text-sm leading-5">
            <p className="font-semibold">UI preview only</p>
            <p className="text-muted-foreground">Use made-up details. Sign-in is unavailable.</p>
          </div>
          <LoginForm />
          <div className="mt-3 border-t pt-2">
            <ConnectivityIndicator compact />
          </div>
        </Card>
        <nav aria-label="Other UI previews" className="mt-3 text-center">
          <p className="text-xs leading-5 text-muted-foreground">Other UI previews · no sign-in required</p>
          <div className="flex flex-wrap justify-center gap-x-2">
            <Button asChild variant="link" size="sm"><Link href="/admin/dashboard" prefetch={false}>Admin shell</Link></Button>
            <Button asChild variant="link" size="sm"><Link href="/pos" prefetch={false}>Salesperson shell</Link></Button>
          </div>
        </nav>
      </div>
    </main>
    <footer className="px-4 pb-3 text-center text-xs leading-5 text-muted-foreground">Shop-local preview · No accounts are connected.</footer>
  </div>;
}
