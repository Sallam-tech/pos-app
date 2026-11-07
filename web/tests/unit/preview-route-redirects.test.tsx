import { expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import PreviousHome from "@/app/admin/demo/page";
import PreviousExpenses from "@/app/admin/demo/expenses/page";
import PreviousReturns from "@/app/admin/demo/returns/page";
import PreviousInvestment from "@/app/admin/demo/investment/page";
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
it.each([
  [PreviousHome, "/admin/dashboard"], [PreviousExpenses, "/pos/expenses"],
  [PreviousReturns, "/pos/returns"], [PreviousInvestment, "/admin/investment"],
] as const)("preserves bookmarked preview routes with a direct redirect", (Page, target) => {
  vi.mocked(redirect).mockClear();
  Page();
  expect(redirect).toHaveBeenCalledExactlyOnceWith(target);
});
