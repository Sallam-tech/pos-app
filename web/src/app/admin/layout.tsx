import {readTestInvoicesRender} from "@/server/hosting/invoices-render";
import type { ReactNode } from "react";
import { isTestInventoryRender } from "@/server/hosting/inventory-render";
import { AdminShell } from "@/components/shell/admin-shell";
// Public prototype shell only. Authentication/authorization belongs to Phase 4.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell testInventory={isTestInventoryRender()} testInvoices={readTestInvoicesRender()}>{children}</AdminShell>;
}
