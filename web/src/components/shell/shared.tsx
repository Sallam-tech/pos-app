import { Button } from "@/components/ui/button";
import { SafeNavigationLink } from "@/components/shell/safe-navigation-link";
import { ShopName } from "@/components/settings/shop-identity";
import { DemoExitLink } from "@/components/demo/demo-navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";

export function Brand() {
  return <div className="flex min-w-0 items-center gap-3">
    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><Icon name="store" className="size-5" /></span>
    <ShopName className="min-w-0 break-words text-lg font-bold tracking-[-0.025em] [overflow-wrap:anywhere]" />
  </div>;
}
export function PreviewNotice() {
  return <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-surface px-4 py-3 text-sm">
    <Badge>Mock UI</Badge><p className="text-muted-foreground">Preview only. No sign-in or business operations are enabled.</p>
  </div>;
}
export function PageHeader({ title, description, breadcrumb, children }: { title: string; description: string; breadcrumb: string; children?: ReactNode }) {
  return <div className="mb-6">
    <nav aria-label="Breadcrumbs" className="mb-3 text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-2"><li>{breadcrumb}</li><li aria-hidden="true">/</li><li aria-current="page">{title}</li></ol>
    </nav>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="page-title">{title}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p></div>
      {children}
    </div>
  </div>;
}
export function PreviewLink() {
  return <DemoExitLink />;
}
export function PreviewFooter() {
  return <p className="mt-8 text-xs leading-5 text-muted-foreground">Shop-local UI preview · Authentication and business workflows are not available.</p>;
}

/** Navigation only; real session termination belongs to the authentication phase. */
export function BackToLoginLink() {
  return <Button asChild variant="outline" size="sm" className="shrink-0 whitespace-nowrap text-white">
    <SafeNavigationLink href="/login" prefetch={false}><Icon name="arrow" className="rotate-180" />Back to Login</SafeNavigationLink>
  </Button>;
}
