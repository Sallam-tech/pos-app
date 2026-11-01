import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="grid justify-items-center gap-3 px-2 py-8 text-center sm:py-12">
    <span className="grid size-12 place-items-center rounded-lg bg-muted text-primary"><Icon name="monitor" /></span>
    <h2 className="section-title">{title}</h2>
    <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
    {children}
  </div>;
}
export function Alert({ title, children, tone = "neutral" }: { title: string; children: ReactNode; tone?: "neutral" | "danger" | "warning" }) {
  return <div role={tone === "danger" ? "alert" : undefined} className={cn("rounded-md border bg-muted p-4 text-sm leading-6", tone === "danger" && "border-danger", tone === "warning" && "border-warning")}>
    <p className={cn("font-semibold", tone === "danger" && "text-danger", tone === "warning" && "text-warning")}>{title}</p>
    <div className="mt-1 text-muted-foreground">{children}</div>
  </div>;
}
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("h-4 animate-pulse rounded-sm bg-muted", className)} />;
}
