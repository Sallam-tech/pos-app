import { render, screen, within } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminShell } from "@/components/shell/admin-shell";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));
// Keep these regressions focused on navigation, independent of header services.
vi.mock("@/components/theme/theme-selector", () => ({ ThemeSelector: () => null }));
vi.mock("@/components/shell/connectivity-indicator", () => ({ ConnectivityIndicator: () => null }));

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

it.each([
  ["/admin/dashboard", "Dashboard", false],
  ["/admin/settings", "Settings", false],
  ["/admin/daily-closing", "Daily Closing", false],
  ["/admin/products", "Products", false],
  ["/admin/sales/today", "Reports", false],
  ["/admin/reports", "Reports", false],
  ["/admin/reports/sales", "Reports", false],
  ["/admin/reports/profit", "Reports", false],
  ["/admin/profit/today", "Reports", false],
  ["/admin/inventory/available-stock", "Inventory", true],
  ["/admin/inventory/low-stock", "Inventory", true],
] as const)("selects the correct navigation at %s and preserves existing sections", (path, currentName, isInventory) => {
  vi.mocked(usePathname).mockReturnValue(path);
  render(<AdminShell>Screen preview</AdminShell>);
  const navigation = screen.getByRole("navigation", { name: "Main navigation" });
  expect(screen.queryByText("Admin workspace", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText("Layout preview", { exact: true })).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Exit Demo" })).toHaveLength(1);
  const inventory = within(navigation).getByRole("link", { name: "Inventory" });
  expect(inventory).toHaveAttribute("href", "/admin/inventory/available-stock");
  expect(inventory).not.toHaveAttribute("aria-expanded");
  expect(inventory).not.toHaveAttribute("aria-controls");
  expect(within(navigation).queryByRole("button", { name: "Inventory" })).not.toBeInTheDocument();
  expect(within(navigation).queryByRole("link", { name: "Available Stock" })).not.toBeInTheDocument();
  expect(within(navigation).queryByRole("link", { name: "Low Stock Products" })).not.toBeInTheDocument();
  const current = within(navigation).getByRole("link", { name: currentName });
  const location = path === "/admin/profit/today" || path === "/admin/sales/today" || path.startsWith("/admin/reports/") || path === "/admin/inventory/low-stock";
  expect(current).toHaveAttribute("aria-current", location ? "location" : "page");
  expect(current).toHaveClass("bg-[var(--nav-active)]", "text-primary");
  expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(location ? 0 : 1);
  if (isInventory) {
    expect(inventory).toHaveClass("border-l-2", "border-primary", "bg-[var(--nav-active)]", "font-semibold", "text-primary");
  } else {
    expect(inventory).not.toHaveAttribute("aria-current");
    expect(inventory).toHaveClass("text-muted-foreground");
    expect(inventory).not.toHaveClass("bg-[var(--nav-active)]");
  }
  expect(within(navigation).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
    "/admin/dashboard", "/admin/products", "/admin/inventory/available-stock", "/admin/reports", "/admin/investment", "/admin/daily-closing", "/admin/settings",
  ]);
  const reports = within(navigation).getByRole("link", { name: "Reports" });
  expect(reports).toHaveAttribute("href", "/admin/reports");
  expect(reports).not.toHaveAttribute("aria-disabled");
  expect(reports).not.toHaveAttribute("aria-expanded");
  expect(within(navigation).queryByText("Planned")).not.toBeInTheDocument();
  if (path.startsWith("/admin/reports") || path === "/admin/profit/today" || path === "/admin/sales/today") {
    expect(reports).toHaveClass("bg-[var(--nav-active)]", "text-primary");
    expect(within(navigation).queryByRole("link", { name: "Sales" })).not.toBeInTheDocument();
  } else {
    expect(reports).not.toHaveAttribute("aria-current");
    expect(reports).toHaveClass("text-muted-foreground");
  }
});

it("keeps one Inventory destination and follows direct route changes without a submenu", () => {
  vi.mocked(usePathname).mockReturnValue("/admin/dashboard");
  const { rerender } = render(<AdminShell>Dashboard preview</AdminShell>);
  for (const path of ["/admin/inventory/available-stock", "/admin/inventory/low-stock", "/admin/dashboard"]) {
    vi.mocked(usePathname).mockReturnValue(path);
    rerender(<AdminShell>Inventory preview</AdminShell>);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const inventory = within(nav).getByRole("link", { name: "Inventory" });
    expect(inventory).toHaveAttribute("href", "/admin/inventory/available-stock");
    expect(inventory).not.toHaveAttribute("aria-expanded");
    if (path.startsWith("/admin/inventory/")) expect(inventory).toHaveAttribute("aria-current", path.endsWith("/low-stock") ? "location" : "page");
    else expect(inventory).not.toHaveAttribute("aria-current");
    expect(within(nav).queryByRole("list", { name: "Inventory pages" })).not.toBeInTheDocument();
  }
});

it("preserves the pre-existing presentation of unlisted Admin routes", () => {
  vi.mocked(usePathname).mockReturnValue("/admin/planned");
  render(<AdminShell>Unlisted preview</AdminShell>);
  expect(screen.getByText("Admin workspace", { exact: true })).toBeVisible();
  expect(screen.getByText("Layout preview", { exact: true })).toBeVisible();
  expect(screen.getAllByRole("link", { name: "Exit Demo" })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Inventory" })).toHaveAttribute("href", "/admin/inventory/available-stock");
});

it("groups the legacy Sales Report under Reports without an Admin Sales item", () => {
  vi.mocked(usePathname).mockReturnValue("/admin/sales/today");
  render(<AdminShell>Sales preview</AdminShell>);
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(within(nav).getByRole("link", { name: "Reports" })).toHaveAttribute("aria-current", "location");
  expect(within(nav).queryByRole("link", { name: "Sales" })).not.toBeInTheDocument();
  expect(within(nav).queryByRole("button", { name: "Sales" })).not.toBeInTheDocument();
});

it.each(["/admin/products/new", "/admin/products/diapers/edit", "/admin/products/not-a-product/edit", "/admin/profit/today", "/admin/reports", "/admin/reports/sales", "/admin/reports/profit"])("keeps the compact shell and existing navigation at %s", (path) => {
  vi.mocked(usePathname).mockReturnValue(path);
  render(<AdminShell>Add Product preview</AdminShell>);
  const navigation = screen.getByRole("navigation", { name: "Main navigation" });
  if (path.startsWith("/admin/products/")) {
    expect(within(navigation).getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "location");
    expect(within(navigation).getByRole("link", { name: "Products" })).toHaveClass("bg-[var(--nav-active)]", "text-primary");
  }
  expect(within(navigation).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  expect(screen.queryByText("Admin workspace", { exact: true })).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Exit Demo" })).toHaveLength(1);
});

it("makes Stock Value directly accessible without a Demo Tools hub", () => {
  vi.mocked(usePathname).mockReturnValue("/admin/investment");
  render(<AdminShell>Investment preview</AdminShell>);
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(within(nav).getByRole("link", { name: "Stock Value" })).toHaveAttribute("aria-current", "page");
  expect(within(nav).queryByRole("link", { name: "Demo Tools" })).not.toBeInTheDocument();
  expect(within(nav).getByRole("link", { name: "Reports" })).not.toHaveAttribute("aria-current");
});

it("keeps the expense drilldown under Dashboard without adding an entry menu", () => {
  vi.mocked(usePathname).mockReturnValue("/admin/expenses");
  render(<AdminShell>Expense review</AdminShell>);
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "location");
  expect(within(nav).queryByRole("link", { name: "Shop Expenses" })).not.toBeInTheDocument();
  expect(screen.queryByText("Layout preview", { exact: true })).not.toBeInTheDocument();
});
