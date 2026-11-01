import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/shell/workspace-shells";
export default function SalespersonLayout({ children }: { children: ReactNode }) {
  return <WorkspaceShell label="Salesperson workspace">{children}</WorkspaceShell>;
}
