import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PageHeading } from "@/components/shell/page-heading";
import { workspaceParent } from "@/lib/workspace-navigation";
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
afterAll(() => {
  for (const [key, original] of [["showModal", originalShow], ["close", originalClose]] as const) {
    if (original) Object.defineProperty(HTMLDialogElement.prototype, key, original);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key);
  }
});
describe("safe workspace parents", () => {
  it.each([
    ["/admin/products", "/admin/dashboard"], ["/admin/products/new", "/admin/products"],
    ["/admin/products/diapers/edit", "/admin/products"], ["/admin/products/diapers", "/admin/products"],
    ["/admin/inventory/low-stock", "/admin/inventory/available-stock"], ["/admin/inventory/available-stock", "/admin/dashboard"],
    ["/admin/reports", "/admin/dashboard"], ["/admin/reports/sales", "/admin/reports"],
    ["/admin/reports/profit", "/admin/reports"], ["/admin/sales/today", "/admin/reports"], ["/admin/profit/today", "/admin/reports"],
    ["/admin/settings", "/admin/dashboard"], ["/admin/investment", "/admin/dashboard"],
    ["/admin/daily-closing", "/admin/dashboard"], ["/admin/expenses", "/admin/dashboard"],
    ["/pos/history", "/pos"], ["/pos/returns", "/pos"], ["/pos/expenses", "/pos"],
  ])("%s has the same safe parent on direct entry and with untrusted query strings", (route, parent) => {
    expect(workspaceParent(route)?.href).toBe(parent);
    expect(workspaceParent(route + "?returnTo=https://example.com#ignored")?.href).toBe(parent);
  });
  it.each(["/login", "/admin/dashboard", "/pos", "/unknown", "https://example.com/admin/settings"])("does not invent a Back action for %s", (route) => {
    expect(workspaceParent(route)).toBeNull();
    render(<PageHeading route={route}>Page</PageHeading>);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
  it("renders a single named arrow immediately before the heading", () => {
    render(<PageHeading route="/admin/settings">Settings</PageHeading>);
    const heading = screen.getByRole("heading", { level: 1, name: "Settings" });
    expect(heading.previousElementSibling).toBe(screen.getByRole("link", { name: "Back to Dashboard" }));
    expect(heading.previousElementSibling).toHaveClass("page-back-link");
  });
  it("warns before losing temporary input and restores focus when keeping it", () => {
    render(<main id="main-content"><PageHeading route="/admin/settings">Settings</PageHeading><input aria-label="Draft" defaultValue="Keep me" data-unsaved-changes="true" /></main>);
    const back = screen.getByRole("link", { name: "Back to Dashboard" }); back.focus();
    fireEvent.click(back);
    expect(screen.getByRole("dialog", { name: "Leave this page?" })).toHaveTextContent("Leaving does not save them.");
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Draft")).toHaveValue("Keep me"); expect(back).toHaveFocus();
    fireEvent.click(back);
    expect(screen.getByRole("link", { name: "Leave page" })).toHaveAttribute("href", "/admin/dashboard");
  });
});
