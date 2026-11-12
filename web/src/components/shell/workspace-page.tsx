import { PageHeading } from "@/components/shell/page-heading";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
export function WorkspacePage({ route, title, description, action, children,badge="Demo Mode" }: { route: string; title: string; description?: string; action?: ReactNode; children: ReactNode;badge?:string }) {
  return <div className="mx-auto w-full max-w-6xl">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><PageHeading route={route}>{title}</PageHeading>{description && <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>
      {action ? <div className="flex flex-wrap items-center gap-3"><Badge>{badge}</Badge>{action}</div> : <Badge>{badge}</Badge>}
    </div>
    {children}
  </div>;
}
