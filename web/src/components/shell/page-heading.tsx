import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { SafeNavigationLink } from "./safe-navigation-link";
import { workspaceParent } from "@/lib/workspace-navigation";

export function PageHeading({ route, children, className = "page-title" }: { route: string; children: ReactNode; className?: string }) {
  const parent = workspaceParent(route);
  return <div className="page-heading flex min-w-0 items-center gap-3">
    {parent && <SafeNavigationLink href={parent.href} aria-label={parent.label} title={parent.label} className="page-back-link">
      <Icon name="arrow" className="size-5 rotate-180" />
    </SafeNavigationLink>}
    <h1 className={"min-w-0 break-words " + className}>{children}</h1>
  </div>;
}
