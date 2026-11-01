import type { ReactNode } from "react";
import { Brand, PreviewLink } from "@/components/shell/shared";
import { ConnectivityIndicator } from "@/components/shell/connectivity-indicator";
import { ThemeSelector } from "@/components/theme/theme-selector";

export default function SalespersonLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-svh">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="border-b bg-surface">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <Brand />
        <div className="order-2 w-full sm:order-none sm:w-auto"><ConnectivityIndicator compact /></div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2"><ThemeSelector /><PreviewLink /></div>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="content-container outline-none">{children}</main>
  </div>;
}
