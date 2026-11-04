import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReportsPage, { metadata } from "@/app/admin/reports/page";

describe("simple Admin Reports home", () => {
  it("provides an honest demo heading and exactly two existing report destinations", () => {
    render(<ReportsPage />);
    expect(metadata.title).toBe("Reports | Shop POS");
    expect(screen.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
    expect(screen.getByText("Demo Data")).toBeVisible();
    const options = screen.getByRole("region", { name: "Available reports" });
    expect(within(options).getAllByRole("group")).toHaveLength(2);
    const sales = within(options).getByRole("group", { name: "Sales Report" });
    const profit = within(options).getByRole("group", { name: "Profit Report" });
    expect(within(sales).getByText("See sales, items sold and simple charts.")).toBeVisible();
    expect(within(sales).getByRole("link", { name: "View Sales Charts" })).toHaveAttribute("href", "/admin/reports/sales");
    expect(within(profit).getByText("See profit and which products earned the most.")).toBeVisible();
    expect(within(profit).getByRole("link", { name: "View Profit Charts" })).toHaveAttribute("href", "/admin/reports/profit");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("leaves date filters, charts and financial figures to the existing reports", () => {
    render(<ReportsPage />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(document.querySelector("input,select,canvas,svg,data")).toBeNull();
    expect(screen.queryByText(/Rs\./)).not.toBeInTheDocument();
  });
});
