import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export type Tone = "neutral" | "success" | "warning" | "danger";
const colors: Record<Tone, string> = { neutral: "text-muted-foreground", success: "text-success", warning: "text-warning", danger: "text-danger" };
export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold leading-5", colors[tone], className)} {...props} />;
}
