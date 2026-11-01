import type { ReactNode } from "react";
import { Brand, PreviewLink } from "@/components/shell/shared";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { ConnectivityIndicator } from "@/components/shell/connectivity-indicator";

export function WorkspaceShell({ children, label }: { children: ReactNode; label: string }) {
  return <div className="min-h-svh">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="border-b bg-surface">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 p-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4"><Brand /><span className="hidden border-l pl-4 text-sm text-muted-foreground sm:block">{label}</span></div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3"><ThemeSelector /><PreviewLink /></div>
        <div className="w-full"><ConnectivityIndicator /></div>
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="content-container outline-none">{children}</main>
  </div>;
}
