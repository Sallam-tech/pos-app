import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestSavedFinancialReport } from "@/components/admin/test-saved-financial-report";
import { TestReportsProducts } from "@/components/admin/test-reports";
import type { Overview } from "@/lib/reports/client";

const { reportFetchMock } = vi.hoisted(() => ({ reportFetchMock: vi.fn() }));

vi.mock("@/lib/reports/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/client")>();
  return { ...actual, reportFetch: reportFetchMock };
});

type Product = {
  id: string;
  name: string;
  code: string;
  quantity: string;
  revenuePaisa: string;
  cogsPaisa: string;
  grossProfitPaisa: string;
};

const products: Product[] = [
  { id: "p1", name: "Diapers", code: "D1", quantity: "3", revenuePaisa: "1500", cogsPaisa: "900", grossProfitPaisa: "600" },
  { id: "p2", name: "Milk Powder", code: "M1", quantity: "2", revenuePaisa: "1200", cogsPaisa: "800", grossProfitPaisa: "400" },
  { id: "p3", name: "Rice", code: "R1", quantity: "1", revenuePaisa: "900", cogsPaisa: "500", grossProfitPaisa: "400" },
  { id: "p4", name: "Baby Wipes", code: "B1", quantity: "1", revenuePaisa: "600", cogsPaisa: "300", grossProfitPaisa: "300" },
  { id: "p5", name: "Shampoo", code: "S1", quantity: "1", revenuePaisa: "400", cogsPaisa: "200", grossProfitPaisa: "200" },
  { id: "p6", name: "Hand Soap", code: "H1", quantity: "1", revenuePaisa: "200", cogsPaisa: "100", grossProfitPaisa: "100" },
];

function savedReport(rows: Product[]): Overview {
  const totals = rows.reduce((result, product) => ({
    quantity: result.quantity + Number(product.quantity),
    revenue: result.revenue + BigInt(product.revenuePaisa),
    cost: result.cost + BigInt(product.cogsPaisa),
    profit: result.profit + BigInt(product.grossProfitPaisa),
  }), { quantity: 0, revenue: BigInt(0), cost: BigInt(0), profit: BigInt(0) });
  const productRows = rows.map((product) => ({ ...product }));
  const page = {
    from: "2026-11-18",
    to: "2026-11-18",
    asOfMs: "1795000000000",
    snapshot: "a".repeat(64),
    catalog: "NO" as const,
    query: "",
    items: productRows,
    nextCursor: null,
    filtered: {
      products: String(rows.length),
      quantity: String(totals.quantity),
      revenuePaisa: totals.revenue.toString(),
      cogsPaisa: totals.cost.toString(),
      grossProfitPaisa: totals.profit.toString(),
    },
    complete: true,
  };
  return {
    ...page,
    productPage: page,
    products: productRows,
    timeSeries: [],
    timeSeriesComplete: true,
    revenuePaisa: totals.revenue.toString(),
    refundsPaisa: "0",
    cogsPaisa: totals.cost.toString(),
    grossProfitPaisa: totals.profit.toString(),
    expensesPaisa: "0",
    netProfitPaisa: totals.profit.toString(),
    netQuantity: String(totals.quantity),
    activeProducts: String(rows.length),
    productComparisonComplete: true,
    financialComplete: true,
    recordedCashMovementPaisa: "0",
    recordedCashReconciliationPaisa: "0",
    counterBalancePaisa: null,
    unrecordedSalePayments: "0",
    laterAdjustmentCount: "0",
    laterCashAdjustmentCount: "0",
    closingAvailable: false,
    snapshot: "a".repeat(64),
    from: "2026-11-18",
    to: "2026-11-18",
    asOfMs: "1795000000000",
    timezone: "Asia/Karachi",
    inventory: { overall: {}, capturedAtMs: "1795000000000", valuation: "CURRENT_RECORDED" },
  } as unknown as Overview;
}

function matchingPage(rows: Product[]) {
  const profit = rows.reduce((sum, product) => sum + BigInt(product.grossProfitPaisa), BigInt(0));
  const revenue = rows.reduce((sum, product) => sum + BigInt(product.revenuePaisa), BigInt(0));
  return {
    ...savedReport(rows),
    query: "",
    filtered: {
      products: String(rows.length),
      quantity: rows.reduce((sum, product) => sum + Number(product.quantity), 0).toString(),
      revenuePaisa: revenue.toString(),
      cogsPaisa: rows.reduce((sum, product) => sum + BigInt(product.cogsPaisa), BigInt(0)).toString(),
      grossProfitPaisa: profit.toString(),
    },
  };
}

function savedProductDetail() {
  const privateInvoiceId = "9f1f0e78-8e42-4bc7-97a3-4ee3ff1c0c10";
  return {
    from: "2026-11-18",
    to: "2026-11-18",
    asOfMs: "1795000000000",
    snapshot: "a".repeat(64),
    catalog: "NO",
    tab: "financial",
    product: { id: "p1", name: "Diapers", code: "D1", quantity: "3", buyingPricePaisa: "30000", sellingPricePaisa: "50000", stockValuePaisa: "90000" },
    currentStockCapturedAtMs: "1795000000000",
    totals: { quantity: "3", revenuePaisa: "1500", cogsPaisa: "900", grossProfitPaisa: "600" },
    items: [{
      id: "activity-1", kind: "SALE", effectiveDate: "2026-11-18", recordedAtMs: "1795000000000",
      invoiceId: privateInvoiceId, name: "Diapers", quantity: "3", revenuePaisa: "1500", cogsPaisa: "900",
      grossProfitPaisa: "600", valuationDeltaPaisa: "-900",
    }],
    nextCursor: null,
    complete: true,
  };
}

beforeEach(() => {
  reportFetchMock.mockReset();
  reportFetchMock.mockImplementation(async (route: string, params: URLSearchParams) => {
    if (route === "overview") return savedReport(products);
    if (route === "products") {
      const query = params.get("query")?.toLowerCase() ?? "";
      return matchingPage(products.filter((product) => product.name.toLowerCase().includes(query)));
    }
    if (route.startsWith("products/")) return savedProductDetail();
    throw new Error("Unexpected report request.");
  });
});

describe("saved financial report presentation", () => {
  it("preserves the shared product report search and history behavior for other callers", async () => {
    const report = savedReport(products);
    render(<TestReportsProducts period={report} initial={report.productPage} />);

    const table = () => within(screen.getByRole("region", { name: "Saved product totals" }));
    for (const column of ["Product", "Net Sold", "Sales", "Cost", "Gross Profit", "Action"]) {
      expect(table().getByRole("columnheader", { name: column })).toBeVisible();
    }
    const search = screen.getByRole("searchbox", { name: "Search by product name or code" });
    expect(screen.getByRole("button", { name: "Search Products" })).toBeVisible();
    fireEvent.change(search, { target: { value: "Milk" } });
    expect(reportFetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Search Products" }));
    await waitFor(() => expect(table().getByText("Milk Powder", { exact: true })).toBeVisible());

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(table().getByText("Diapers", { exact: true })).toBeVisible());
    fireEvent.click(screen.getAllByRole("button", { name: "Product History" })[0]);
    expect(await screen.findByRole("heading", { name: "Diapers · Product History" })).toBeVisible();
  });

  it.each(["sales", "profit"] as const)("renders real report-shaped %s data in the approved chart and details", async (kind) => {
    render(<TestSavedFinancialReport kind={kind} />);

    const chart = await screen.findByRole("region", { name: kind === "sales" ? "Sales by Product" : "Profit by Product" });
    expect(within(chart).getAllByRole("listitem")).toHaveLength(6);
    expect(within(chart).getByText("Diapers")).toBeVisible();
    expect(await screen.findByRole("heading", { name: kind === "sales" ? "Sales Details" : "Profit Details" })).toBeVisible();
    expect(screen.getByRole("rowheader", { name: /^Diapers\b/ })).toBeVisible();
    const table = within(screen.getByRole("region", { name: kind === "sales" ? "Sales results" : "Profit results" }));
    for (const column of kind === "sales" ? ["Product", "Qty", "Total Sales"] : ["Product", "Sold", "Sales", "Cost", "Profit"]) {
      expect(table.getByRole("columnheader", { name: column })).toBeVisible();
    }
    expect(within(screen.getByLabelText(kind === "sales" ? "Revenue totals" : "Gross profit totals")).getByText(kind === "sales" ? "Rs. 48.00" : "Rs. 20.00")).toBeVisible();
    if (kind === "sales") {
      expect(document.body.textContent).not.toMatch(/gross profit|purchase cost|cost of sold/i);
      fireEvent.click(screen.getByRole("button", { name: "View sales for Diapers" }));
      const history = await screen.findByRole("region", { name: "Individual sales for Diapers" });
      expect(within(history).getByText("Sale")).toBeVisible();
      expect(within(history).getByText("2026-11-18")).toBeVisible();
      expect(document.body.textContent).not.toContain("9f1f0e78-8e42-4bc7-97a3-4ee3ff1c0c10");
    }

    fireEvent.click(within(chart).getByRole("button", { name: "Show Top 5" }));
    expect(within(chart).getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(within(chart).getByRole("button", { name: "Show All" }));
    expect(within(chart).getAllByRole("listitem")).toHaveLength(6);
  });

  it.each(["sales", "profit"] as const)("shows a truthful loading state before the %s report arrives", async (kind) => {
    reportFetchMock.mockReturnValue(new Promise(() => {}));
    render(<TestSavedFinancialReport kind={kind} />);

    const chart = await screen.findByRole("region", { name: kind === "sales" ? "Sales by Product" : "Profit by Product" });
    expect(within(chart).getByText("Loading report…")).toBeVisible();
    expect(within(chart).queryByText("No product sales to compare.")).not.toBeInTheDocument();
  });

  it("keeps the highest-profit summary scoped to the whole period while searching details", async () => {
    render(<TestSavedFinancialReport kind="profit" />);
    await screen.findByRole("heading", { name: "Profit Details" });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search by product name" }), { target: { value: "Milk" } });
    await waitFor(() => expect(reportFetchMock).toHaveBeenCalledWith("products", expect.any(URLSearchParams)));
    const summary = within(screen.getByLabelText("Gross profit totals"));
    expect(summary.getByText("Diapers")).toBeVisible();
    expect(summary.getByText("Rs. 6.00")).toBeVisible();
    const chart = screen.getByRole("region", { name: "Profit by Product" });
    expect(within(chart).getAllByRole("listitem")).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole("rowheader", { name: "Milk Powder" })).toBeVisible());
    expect(screen.queryByRole("rowheader", { name: "Diapers" })).not.toBeInTheDocument();
  });

  it("supports Clear Search and the original View Details jump", async () => {
    render(<TestSavedFinancialReport kind="profit" />);
    await screen.findByRole("heading", { name: "Profit Details" });

    const heading = screen.getByRole("heading", { name: "Profit Details" });
    heading.scrollIntoView = vi.fn();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search by product name" }), { target: { value: "Milk" } });
    await waitFor(() => expect(screen.getByRole("rowheader", { name: "Milk Powder" })).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(screen.getByRole("rowheader", { name: /^Diapers\b/ })).toBeVisible());

    fireEvent.click(screen.getByRole("button", { name: "View Profit Details" }));
    expect(heading).toHaveFocus();
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("does not present partial product aggregates as a complete chart or highest product", async () => {
    reportFetchMock.mockImplementation(async (route: string) => {
      if (route === "overview") return { ...savedReport(products), productComparisonComplete: false };
      return matchingPage(products);
    });
    render(<TestSavedFinancialReport kind="profit" />);

    const chart = await screen.findByRole("region", { name: "Profit by Product" });
    expect(within(chart).getByText("Product comparison is unavailable for this period. Narrow the date range.")).toBeVisible();
    expect(within(chart).queryByRole("listitem")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Gross profit totals")).getByText("Unavailable")).toBeVisible();
  });

  it.each(["sales", "profit"] as const)("keeps the approved %s chart frame and true empty state when the period has no saved sales", async (kind) => {
    reportFetchMock.mockImplementation(async (route: string) => {
      if (route === "overview") return savedReport([]);
      return matchingPage([]);
    });
    render(<TestSavedFinancialReport kind={kind} />);

    const chart = await screen.findByRole("region", { name: kind === "sales" ? "Sales by Product" : "Profit by Product" });
    expect(within(chart).getByText("No product sales to compare.")).toBeVisible();
    expect(within(chart).queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(kind === "sales" ? "No sales found for this period." : "No sales for this period.")).toBeVisible();
    if (kind === "profit") expect(screen.getByText("No sales")).toBeVisible();
    const summary = within(screen.getByLabelText(kind === "sales" ? "Revenue totals" : "Gross profit totals"));
    expect(summary.getByText(kind === "sales" ? "Total Sales" : "Gross Profit").nextElementSibling).toHaveTextContent("Rs. 0.00");
  });
});
