import type { ReactNode } from "react";
import { SalespersonShell } from "@/components/shell/salesperson-shell";
export default function SalespersonLayout({ children }: { children: ReactNode }) {
  return <SalespersonShell>{children}</SalespersonShell>;
}
