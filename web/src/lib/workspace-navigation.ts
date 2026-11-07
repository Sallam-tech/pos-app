export type WorkspaceParentHref = "/login" | "/admin/dashboard" | "/admin/products" | "/admin/reports" | "/admin/inventory/available-stock" | "/pos";
export type WorkspaceParent = Readonly<{ href: WorkspaceParentHref; label: string }>;
/** Deterministic parents: never inspect browser history, referrers or user-supplied return URLs. */
export function workspaceParent(route: string): WorkspaceParent | null {
  const path = route.split(/[?#]/, 1)[0];
  if (path === "/login" || path === "/admin/dashboard" || path === "/pos") return null;
  if (path === "/admin/products") return { href: "/admin/dashboard", label: "Back to Dashboard" };
  if (/^\/admin\/products\/[^/]+(?:\/edit)?$/.test(path)) return { href: "/admin/products", label: "Back to Products" };
  if (path === "/admin/inventory/low-stock") return { href: "/admin/inventory/available-stock", label: "Back to Inventory" };
  if (path === "/admin/inventory/available-stock") return { href: "/admin/dashboard", label: "Back to Dashboard" };
  if (path === "/admin/reports") return { href: "/admin/dashboard", label: "Back to Dashboard" };
  if (["/admin/reports/sales", "/admin/reports/profit", "/admin/sales/today", "/admin/profit/today"].includes(path)) return { href: "/admin/reports", label: "Back to Reports" };
  if (["/admin/investment", "/admin/settings", "/admin/daily-closing", "/admin/expenses"].includes(path)) return { href: "/admin/dashboard", label: "Back to Dashboard" };
  if (["/pos/history", "/pos/returns", "/pos/expenses"].includes(path)) return { href: "/pos", label: "Back to Make a Sale" };
  return null;
}
