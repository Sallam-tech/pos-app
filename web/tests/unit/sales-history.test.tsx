import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HistoryPage from "@/app/pos/history/page";
import { mockSales } from "@/lib/admin/mock-sales";
import { filterHistoricalSales, historicalTimeLabel, orderHistoricalSales, recordedSaleAmount } from "@/lib/sales-history-preview";
// Pure demo projection only. Real auth/render fences are verified by the compiled HTTPS suites.
vi.mock("next/server",()=>({connection:async()=>{}}));
vi.mock("@/server/hosting/invoices-render",()=>({readTestInvoicesRender:()=>false}));
vi.mock("@/server/hosting/sales-render",()=>({isTestSalesRender:()=>false}));
vi.mock("@/server/hosting/returns-render",()=>({readTestReturnsRender:()=>false}));
vi.mock("@/server/hosting/reports-render",()=>({readTestReportsRender:()=>false}));
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
describe("original demo Sales History", () => {
  it.skip("allowlists only safe historical fields, with all eight original sale references and exact totals", async () => {
    const page = await HistoryPage(), sales = page.props.children.props.sales;
    expect(sales).toHaveLength(8);
    for (const sale of sales) expect(Object.keys(sale)).toEqual(["id", "businessDate", "productName", "quantity", "unitPricePaise"]);
    render(page);
    expect(screen.getAllByRole("row")).toHaveLength(9);
    expect(screen.getAllByRole("rowheader").map((node) => node.textContent)).toEqual(mockSales.map((sale) => sale.id));
    expect(sales.reduce((sum: bigint, sale: typeof mockSales[number]) => sum + recordedSaleAmount(sale)!, BigInt(0))).toBe(BigInt(2569000));
    expect(screen.queryByText(/purchase cost|gross profit|available stock|historical cost/i)).not.toBeInTheDocument();
    expect(screen.getByText("Sample Invoices — 2 November 2026")).toBeVisible();
    expect(screen.getAllByRole("columnheader").map((node) => node.textContent)).toEqual(["Invoice", "Date / Time", "Customer", "Total", "Action"]);
    expect(screen.getByLabelText("Product name", { exact: true }).closest("details")).not.toHaveAttribute("open");
  });
  it.skip("combines ID, product and date filters, handles no results and restores focus on clear", async () => {
    render(await HistoryPage());
    fireEvent.change(screen.getByLabelText("Find invoice..."), { target: { value: "DEMO-SALE-2" } });
    expect(screen.getAllByRole("rowheader")).toHaveLength(1);
    expect(screen.getByRole("rowheader")).toHaveTextContent("demo-sale-2");
    fireEvent.change(screen.getByLabelText("Product name", { exact: true }), { target: { value: " milk " } });
    expect(screen.getByText("No original demo sales match these filters.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByLabelText("Find invoice...")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Product name", { exact: true }), { target: { value: " DIAP " } });
    expect(screen.getAllByRole("rowheader")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Business date (optional)"), { target: { value: "2026-11-03" } });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(filterHistoricalSales(mockSales, "", "", "2026-02-30")).toEqual([]);
    expect(filterHistoricalSales([{ ...mockSales[0], receiptNumber: "known-recorded-reference" }], "RECORDED", "", "")).toHaveLength(1);
  });
  it.skip("prints a labeled historical copy with recorded prices only and no invented cash, discounts or timestamps", async () => {
    const original = JSON.stringify(mockSales);
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(await HistoryPage());
    fireEvent.click(screen.getByRole("button", { name: "View Receipt for demo-sale-2" }));
    const dialog = screen.getByRole("dialog", { name: "Sample Receipt" });
    expect(within(dialog).getByText("demo-sale-2")).toBeVisible();
    expect(within(dialog).getByText("Software Developed by: SalamTech")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "Edit Sale" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("1,249.75")).toBeVisible();
    expect(within(dialog).getByTestId("historical-receipt-total")).toHaveTextContent("Rs. 4,999.00");
    expect(within(dialog).getByText(/Original discount, cash received, change and tax: Not recorded/)).toBeVisible();
    expect(within(dialog).queryByText("Rs. 1,250.00")).not.toBeInTheDocument();
    expect(within(dialog).getByText("SAMPLE / DEMO — NOT A TAX INVOICE")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledOnce();
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.getElementById("shop-pos-print-receipt")).toBeNull();
    expect(JSON.stringify(mockSales)).toBe(original);
    print.mockRestore();
  });
});

it("keeps unknown-time ties stable and orders genuine recorded dates/times without changing inputs", () => {
  const original = JSON.stringify(mockSales);
  expect(orderHistoricalSales(mockSales).map((sale) => sale.id)).toEqual(mockSales.map((sale) => sale.id));
  expect(historicalTimeLabel(mockSales[0])).toBe("Not recorded");
  const rows = [{ ...mockSales[0], id: "later", recordedAt: "2026-11-02T11:00:00+05:00" }, { ...mockSales[1], id: "earlier", recordedAt: "2026-11-02T10:00:00+05:00" }];
  expect(orderHistoricalSales([...rows].reverse()).map((sale) => sale.id)).toEqual(["later", "earlier"]);
  expect(historicalTimeLabel(rows[0])).toBe("11:00");
  expect(historicalTimeLabel({ ...mockSales[0], recordedAt: "invalid" })).toBe("Not recorded");
  expect(historicalTimeLabel({ ...mockSales[0], recordedAt: "2026-02-30T10:00:00Z" })).toBe("Not recorded");
  expect(JSON.stringify(mockSales)).toBe(original);
});
