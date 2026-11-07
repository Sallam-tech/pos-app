import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function AdminDemoPage({ title, description, children, home = false }: { title: string; description: string; children: ReactNode; home?: boolean }) {
  return <div className="mx-auto w-full max-w-4xl">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3"><h1 className="page-title">{title}</h1><Badge>Demo Preview</Badge></div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <Button asChild variant="outline"><Link href={home ? "/admin/dashboard" : "/admin/demo"}>{home ? "Back to Dashboard" : "Back to Demo Tools"}</Link></Button>
    </div>
    {children}
  </div>;
}
