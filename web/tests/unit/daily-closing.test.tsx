import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DailyClosingPage from "@/app/admin/daily-closing/page";
import { getDailyClosingPreview } from "@/lib/admin/daily-closing-preview";
import { mockInventory } from "@/lib/admin/mock-inventory";
import { mockSales } from "@/lib/admin/mock-sales";

describe("read-only Daily Closing demo", () => {
  it("reuses exact original sale-time calculations without inferring expenses, refunds or net profit", () => {
    expect(getDailyClosingPreview("2026-11-02")).toEqual({
      error: undefined, revenuePaise: BigInt(2569000), costOfGoodsSoldPaise: BigInt(2055000), grossProfitPaise: BigInt(514000),
      expensesPaise: null, refundsPaise: null, profitAfterExpensesPaise: null,
    });
  });
  it.each(["", "2026-02-30", "0000-01-01", "2026-13-01"])("keeps invalid date %j unavailable", (date) => {
    const result = getDailyClosingPreview(date);
    expect(result.error).toBe("Choose a valid business date."); expect(result.revenuePaise).toBeNull(); expect(result.grossProfitPaise).toBeNull();
  });
  it("distinguishes an empty fixture period from missing expenses/return records", () => {
    expect(getDailyClosingPreview("2026-11-03")).toMatchObject({ error: undefined, revenuePaise: BigInt(0), grossProfitPaise: BigInt(0), expensesPaise: null, refundsPaise: null, profitAfterExpensesPaise: null });
  });
  it("never closes, resets or mutates any original history when changing review dates", () => {
    const before = JSON.stringify({ inventory: mockInventory, sales: mockSales });
    render(<DailyClosingPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Daily Closing" })).toBeVisible();
    expect(screen.getByText(/not the shop’s current day/)).toBeVisible();
    const summary = screen.getByRole("region", { name: "Daily closing summary" });
    for (const [name, amount] of [["Total Sales", "Rs. 25,690.00"], ["Cost of Sold Items", "Rs. 20,550.00"], ["Gross Profit", "Rs. 5,140.00"]]) expect(within(summary).getByRole("group", { name })).toHaveTextContent(amount);
    for (const name of ["Shop Expenses", "Returns / Refunds", "Profit After Expenses"]) expect(within(summary).getByRole("group", { name })).toHaveTextContent("Not available");
    expect(screen.getByRole("button", { name: "Confirm Closing — setup required" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Business Date (Asia/Karachi)"), { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a valid business date.");
    fireEvent.change(screen.getByLabelText("Business Date (Asia/Karachi)"), { target: { value: "2026-11-03" } });
    expect(within(summary).getByRole("group", { name: "Total Sales" })).toHaveTextContent("Rs. 0.00");
    expect(JSON.stringify({ inventory: mockInventory, sales: mockSales })).toBe(before);
  });
});
