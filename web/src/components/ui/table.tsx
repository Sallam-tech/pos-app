import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return <table className={cn("retail-table w-full border-collapse text-left text-sm", className)} {...props} />;
}
export function TableRegion({ children, label }: { children: React.ReactNode; label: string }) {
  return <div role="region" aria-label={label} tabIndex={0} className="max-w-full overflow-x-auto rounded-lg border bg-surface shadow-[var(--shadow-panel)]">{children}</div>;
}
export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return <th scope="col" className={cn("h-12 border-b bg-muted/70 px-4 py-3 text-sm font-semibold text-muted-foreground", className)} {...props} />;
}
export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("h-14 border-t px-4 py-3 align-middle", className)} {...props} />;
}
