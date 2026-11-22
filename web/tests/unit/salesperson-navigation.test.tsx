import { render, screen, within } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { afterEach, expect, it, vi } from "vitest";
import { SalespersonShell } from "@/components/shell/salesperson-shell";
vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));
vi.mock("@/components/theme/theme-selector", () => ({ ThemeSelector: () => null }));
vi.mock("@/components/shell/connectivity-indicator", () => ({ ConnectivityIndicator: () => null }));
afterEach(() => vi.clearAllMocks());
it.skip.each([
  ["/pos", "Make a Sale"], ["/pos/history", "Sales History"], ["/pos/returns", "Return Item"], ["/pos/expenses", "Shop Expenses"],
])("shows only the owner-approved Salesperson destinations at %s", (path, active) => {
  vi.mocked(usePathname).mockReturnValue(path);
  render(<SalespersonShell>Safe screen</SalespersonShell>);
  for (const label of ["Salesperson navigation", "Mobile Salesperson navigation"]) {
    const nav = screen.getByRole("navigation", { name: label });
    expect(within(nav).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/pos", "/pos/history", "/pos/returns", "/pos/expenses"]);
    expect(within(nav).getByRole("link", { name: active })).toHaveAttribute("aria-current", "page");
    expect(nav.querySelectorAll("[aria-current]")).toHaveLength(1);
  }
  expect(screen.getAllByRole("link", { name: "Exit Demo" })).toHaveLength(2);
  expect(screen.queryByRole("complementary", { name: "Admin sidebar" })).not.toBeInTheDocument();
  expect(screen.queryByText(/Investment|Reports|Dashboard|Demo Tools/)).not.toBeInTheDocument();
});
