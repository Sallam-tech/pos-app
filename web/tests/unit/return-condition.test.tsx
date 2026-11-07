import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReturnsPage from "@/app/pos/returns/page";
import { mockSales } from "@/lib/admin/mock-sales";
import { mockInventory } from "@/lib/admin/mock-inventory";
import { proposedStockTreatment, validateReturnCondition } from "@/lib/return-condition-preview";
describe("condition-based safe return preview", () => {
  it("allows unspecified condition with pending inspection, then previews both explicit treatments without mutation", () => {
    const original = JSON.stringify({ mockSales, mockInventory });
    render(<ReturnsPage />);
    fireEvent.change(screen.getByLabelText("Product / original sale"), { target: { value: "demo-sale-1" } });
    fireEvent.change(screen.getByLabelText("Return Quantity"), { target: { value: "2" } });
    const submit = screen.getByRole("button", { name: "Review Return" });
    fireEvent.click(submit);
    expect(screen.getByLabelText("Item Condition (optional)")).not.toBeRequired();
    expect(screen.getByRole("heading", { name: "Return Review - Demo Only" })).toHaveFocus();
    expect(screen.getAllByText(proposedStockTreatment(""))).toHaveLength(2);
    expect(screen.getByText("Not specified", { selector: "dd" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    for (const condition of ["good", "damaged"] as const) {
      fireEvent.change(screen.getByLabelText("Item Condition (optional)"), { target: { value: condition } });
      fireEvent.click(submit);
      expect(screen.getByRole("heading", { name: "Return Review - Demo Only" })).toHaveFocus();
      expect(screen.getAllByText(proposedStockTreatment(condition))).toHaveLength(2);
      expect(screen.getByText("Refund amount not available for this demo sale.")).toBeVisible();
      expect(screen.getByRole("status")).toHaveTextContent("Demo only — no refund or stock change was saved.");
      expect(screen.getByText("Original demo sale ID").nextElementSibling).toHaveTextContent("demo-sale-1");
    }
    expect(screen.getByText(/Prior returns are not recorded/)).toBeVisible();
    expect(JSON.stringify({ mockSales, mockInventory })).toBe(original);
    fireEvent.click(screen.getByRole("button", { name: "Reset Return Preview" }));
    expect(screen.getByLabelText("Item Condition (optional)")).toHaveValue("");
  });
  it("finds genuine demo IDs and shows no-result lookup honestly", () => {
    render(<ReturnsPage />);
    fireEvent.change(screen.getByLabelText("Find Sale"), { target: { value: "DEMO-SALE-8" } });
    expect(screen.getByLabelText("Product / original sale").querySelectorAll("option")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Find Sale"), { target: { value: "not-an-invoice" } });
    expect(screen.getByText("No original demo sales match this ID.")).toBeVisible();
    expect(validateReturnCondition("")).toBeUndefined();
    expect(validateReturnCondition("invented")).toBeTruthy();
    expect(validateReturnCondition("good")).toBeUndefined();
    expect(validateReturnCondition("damaged")).toBeUndefined();
  });
});
