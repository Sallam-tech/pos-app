import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => undefined }));

const pages: Array<[string, () => Promise<{ default: (p?: never) => unknown }>]> = [
  ["/admin/dashboard", () => import("@/app/admin/dashboard/page")],
  ["/admin/daily-closing", () => import("@/app/admin/daily-closing/page")],
  ["/admin/expenses", () => import("@/app/admin/expenses/page")],
  ["/admin/inventory/available-stock", () => import("@/app/admin/inventory/available-stock/page")],
  ["/admin/inventory/low-stock", () => import("@/app/admin/inventory/low-stock/page")],
  ["/admin/investment", () => import("@/app/admin/investment/page")],
  ["/admin/products", () => import("@/app/admin/products/page")],
  ["/admin/products/new", () => import("@/app/admin/products/new/page")],
  ["/admin/reports/sales", () => import("@/app/admin/reports/sales/page")],
  ["/admin/reports/profit", () => import("@/app/admin/reports/profit/page")],
  ["/admin/settings", () => import("@/app/admin/settings/page")],
  ["/pos", () => import("@/app/pos/page")],
  ["/pos/history", () => import("@/app/pos/history/page")],
  ["/pos/returns", () => import("@/app/pos/returns/page")],
  ["/pos/expenses", () => import("@/app/pos/expenses/page")],
];

describe("outside the hosted shop runtime no page shows sample data", () => {
  it.each(pages)("%s shows the not-connected state only", async (_route, load) => {
    const Page = (await load()).default as (p?: unknown) => unknown;
    render((await Page()) as never);
    expect(screen.getByText("Shop database not connected")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Demo|Diapers|Milk Powder|Baby Wipes|Rs\.\s?\d/i);
  });

  it("the edit page also shows the not-connected state", async () => {
    const Page = (await import("@/app/admin/products/[productId]/edit/page")).default;
    render((await Page({ params: Promise.resolve({ productId: "x" }) })) as never);
    expect(screen.getByText("Shop database not connected")).toBeInTheDocument();
  });

  it("login offers no form and no demo shortcuts", async () => {
    const Page = (await import("@/app/login/page")).default;
    render(<ThemeProvider>{(await Page()) as never}</ThemeProvider>);
    expect(screen.queryByRole("link", { name: /Preview (Admin|Salesperson)/ })).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.getByText("Shop database not connected")).toBeInTheDocument();
  });
});
