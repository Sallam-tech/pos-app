import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";

export function Brand() {
  return <div className="flex items-center gap-3">
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Icon name="store" className="size-6" /></span>
    <span className="text-lg font-bold tracking-tight">Shop POS</span>
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
  return <Link href="/login" className="inline-flex min-h-11 min-w-11 items-center rounded-md px-3 text-sm font-semibold text-primary underline underline-offset-4">All previews</Link>;
}
export function PreviewFooter() {
  return <p className="mt-8 text-xs leading-5 text-muted-foreground">Shop-local UI preview · Authentication and business workflows are not available.</p>;
}
