import { fireEvent, render, screen, within } from "@testing-library/react";
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
  ["/admin/products", "Products", false],
  ["/admin/sales/today", "Sales Report", false],
  ["/admin/inventory/available-stock", "Available Stock", true],
  ["/admin/inventory/low-stock", "Low Stock Products", true],
] as const)("selects the correct navigation at %s and preserves planned sections", (path, currentName, isInventory) => {
  vi.mocked(usePathname).mockReturnValue(path);
  render(<AdminShell>Screen preview</AdminShell>);
  const navigation = screen.getByRole("navigation", { name: "Main navigation" });
  expect(screen.queryByText("Admin workspace", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText("Layout preview", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "All previews" })).not.toBeInTheDocument();
  const inventory = within(navigation).getByRole("button", { name: "Inventory" });
  const submenu = document.getElementById(inventory.getAttribute("aria-controls")!)!;
  expect(inventory).toHaveAttribute("aria-expanded", String(isInventory));
  expect(inventory).not.toHaveAttribute("aria-disabled");
  expect(within(inventory).queryByText("Planned")).not.toBeInTheDocument();
  const current = within(navigation).getByRole("link", { name: currentName });
  expect(current).toHaveAttribute("aria-current", "page");
  expect(current).toHaveClass("bg-muted", "text-primary");
  expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  if (isInventory) {
    expect(submenu).toBeVisible();
    expect(inventory).toHaveAttribute("aria-current", "location");
    expect(inventory).toHaveClass("border-l-3", "border-primary", "bg-muted", "font-semibold", "text-primary");
  } else {
    expect(submenu).not.toBeVisible();
    expect(inventory).not.toHaveAttribute("aria-current");
    expect(inventory).toHaveClass("text-muted-foreground");
    expect(inventory).not.toHaveClass("bg-muted");
  }
  expect(within(submenu).getAllByRole("link", { hidden: true }).map((link) => link.getAttribute("href"))).toEqual([
    "/admin/inventory/available-stock", "/admin/inventory/low-stock",
  ]);
  for (const name of ["Reports"]) {
    const item = within(navigation).getByText(name).closest("span")!;
    expect(item.tagName).toBe("SPAN");
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).not.toHaveAttribute("href");
    expect(item).not.toHaveAttribute("tabindex");
    expect(within(item).getByText("Planned")).toBeVisible();
    expect(item).not.toHaveAttribute("aria-current");
    expect(item).toHaveClass("text-muted-foreground");
    expect(item).not.toHaveClass("bg-muted", "text-primary");
  }
});

it("allows toggling Inventory and automatically expands on either inventory route after navigation", () => {
  vi.mocked(usePathname).mockReturnValue("/admin/dashboard");
  const { rerender } = render(<AdminShell>Dashboard preview</AdminShell>);
  const navigation = () => screen.getByRole("navigation", { name: "Main navigation" });
  const control = () => within(navigation()).getByRole("button", { name: "Inventory" });
  fireEvent.click(control());
  expect(control()).toHaveAttribute("aria-expanded", "true");
  expect(within(navigation()).getByRole("link", { name: "Available Stock" })).toBeVisible();
  expect(within(navigation()).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  fireEvent.click(control());
  expect(control()).toHaveAttribute("aria-expanded", "false");
  expect(within(navigation()).queryByRole("link", { name: "Available Stock" })).not.toBeInTheDocument();
  for (const path of ["/admin/inventory/available-stock", "/admin/inventory/low-stock"]) {
    vi.mocked(usePathname).mockReturnValue(path);
    rerender(<AdminShell>Inventory preview</AdminShell>);
    expect(control()).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(control());
    expect(control()).toHaveAttribute("aria-expanded", "false");
    expect(within(navigation()).queryByRole("link", { name: "Available Stock" })).not.toBeInTheDocument();
  }
});

it("preserves the pre-existing presentation of unlisted Admin routes", () => {
  vi.mocked(usePathname).mockReturnValue("/admin/planned");
  render(<AdminShell>Unlisted preview</AdminShell>);
  expect(screen.getByText("Admin workspace", { exact: true })).toBeVisible();
  expect(screen.getByText("Layout preview", { exact: true })).toBeVisible();
  expect(screen.getAllByRole("link", { name: "All previews" })).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Inventory" })).toHaveAttribute("aria-expanded", "false");
});

it("keeps Sales expandable with only the implemented Sales Report route and resets it from the pathname", () => {
  vi.mocked(usePathname).mockReturnValue("/admin/sales/today");
  const { rerender } = render(<AdminShell>Sales preview</AdminShell>);
  const navigation = () => screen.getByRole("navigation", { name: "Main navigation" });
  const control = () => within(navigation()).getByRole("button", { name: "Sales" });
  expect(control()).toHaveAttribute("aria-current", "location");
  expect(control()).toHaveAttribute("aria-expanded", "true");
  expect(control()).not.toHaveAttribute("aria-disabled");
  expect(control()).toHaveClass("bg-muted", "text-primary");
  expect(within(control()).queryByText("Planned")).not.toBeInTheDocument();
  const submenu = document.getElementById(control().getAttribute("aria-controls")!)!;
  expect(within(submenu).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/admin/sales/today"]);
  expect(within(submenu).getByRole("link", { name: "Sales Report" })).toHaveAttribute("aria-current", "page");
  expect(within(navigation()).getByRole("button", { name: "Inventory" })).toHaveAttribute("aria-expanded", "false");
  expect(within(navigation()).getByText("Reports").closest("span")).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(control());
  expect(control()).toHaveAttribute("aria-expanded", "false");
  expect(within(navigation()).queryByRole("link", { name: "Sales Report" })).not.toBeInTheDocument();
  fireEvent.click(control());
  expect(within(navigation()).getByRole("link", { name: "Sales Report" })).toBeVisible();
  vi.mocked(usePathname).mockReturnValue("/admin/dashboard");
  rerender(<AdminShell>Dashboard preview</AdminShell>);
  expect(control()).toHaveAttribute("aria-expanded", "false");
  expect(control()).not.toHaveAttribute("aria-current");
  expect(within(navigation()).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  fireEvent.click(control());
  expect(within(navigation()).getByRole("link", { name: "Sales Report" })).toBeVisible();
  vi.mocked(usePathname).mockReturnValue("/admin/sales/today");
  rerender(<AdminShell>Sales preview</AdminShell>);
  expect(control()).toHaveAttribute("aria-expanded", "true");
  expect(within(navigation()).getByRole("link", { name: "Sales Report" })).toHaveAttribute("aria-current", "page");
});

it.each(["/admin/products/new", "/admin/products/diapers/edit", "/admin/products/not-a-product/edit"])("keeps Products active and the compact shell at %s", (path) => {
  vi.mocked(usePathname).mockReturnValue(path);
  render(<AdminShell>Add Product preview</AdminShell>);
  const navigation = screen.getByRole("navigation", { name: "Main navigation" });
  expect(within(navigation).getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "location");
  expect(within(navigation).getByRole("link", { name: "Products" })).toHaveClass("bg-muted", "text-primary");
  expect(within(navigation).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  expect(screen.queryByText("Admin workspace", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "All previews" })).not.toBeInTheDocument();
});
