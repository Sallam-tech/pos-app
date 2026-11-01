import { render, screen, within } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminShell } from "@/components/shell/admin-shell";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));
// Keep this regression focused on the real sidebar, independent of header services.
vi.mock("@/components/theme/theme-selector", () => ({ ThemeSelector: () => null }));
vi.mock("@/components/shell/connectivity-indicator", () => ({ ConnectivityIndicator: () => null }));

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
});
afterEach(() => vi.unstubAllGlobals());

it("moves the active sidebar highlight between Dashboard and Inventory without enabling planned items", () => {
  vi.mocked(usePathname).mockReturnValue("/admin/dashboard");
  const { rerender } = render(<AdminShell>Screen preview</AdminShell>);
  const navigation = screen.getByRole("navigation", { name: "Main navigation" });
  const dashboard = within(navigation).getByRole("link", { name: "Dashboard" });
  const inventory = within(navigation).getByText("Inventory").closest("span")!;

  expect(dashboard).toHaveAttribute("aria-current", "page");
  expect(dashboard).toHaveClass("border-l-3", "border-primary", "bg-muted", "font-semibold", "text-primary");
  expect(inventory).not.toHaveAttribute("aria-current");
  expect(inventory).toHaveClass("text-muted-foreground");
  expect(inventory).not.toHaveClass("bg-muted");

  vi.mocked(usePathname).mockReturnValue("/admin/inventory/low-stock");
  rerender(<AdminShell>Low-stock preview</AdminShell>);
  expect(inventory).toHaveAttribute("aria-current", "location");
  expect(inventory).toHaveClass("border-l-3", "border-primary", "bg-muted", "font-semibold", "text-primary");
  expect(inventory).not.toHaveClass("text-muted-foreground");
  expect(dashboard).not.toHaveAttribute("aria-current");
  expect(dashboard).toHaveClass("text-muted-foreground");
  expect(dashboard).not.toHaveClass("border-primary", "bg-muted", "text-primary");

  for (const name of ["Products", "Inventory", "Sales", "Reports"]) {
    const item = within(navigation).getByText(name).closest("span")!;
    expect(item.tagName).toBe("SPAN");
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).not.toHaveAttribute("href");
    expect(item).not.toHaveAttribute("tabindex");
    expect(within(item).getByText("Planned")).toBeVisible();
    if (name !== "Inventory") {
      expect(item).not.toHaveAttribute("aria-current");
      expect(item).toHaveClass("text-muted-foreground");
      expect(item).not.toHaveClass("bg-muted", "text-primary");
    }
  }
  expect(within(navigation).getAllByRole("link")).toEqual([dashboard]);

  vi.mocked(usePathname).mockReturnValue("/admin/dashboard");
  rerender(<AdminShell>Dashboard preview</AdminShell>);
  expect(dashboard).toHaveAttribute("aria-current", "page");
  expect(dashboard).toHaveClass("bg-muted", "text-primary");
  expect(inventory).not.toHaveAttribute("aria-current");
  expect(inventory).not.toHaveClass("bg-muted", "text-primary");
});
