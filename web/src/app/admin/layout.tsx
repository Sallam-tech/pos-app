import type { ReactNode } from "react";
import { AdminShell } from "@/components/shell/admin-shell";
// Public prototype shell only. Authentication/authorization belongs to Phase 4.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
