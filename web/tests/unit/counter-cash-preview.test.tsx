import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { CounterCashSummary } from "@/components/admin/counter-cash-summary";
import { expectedCounterCash, inspectCounterCash, type CounterCashSource } from "@/lib/counter-cash-preview";
const date = "2026-11-09";
const source: CounterCashSource = { businessDate: date, complete: true, openingCashPaise: BigInt(100000), cashSalesPaise: BigInt(500000), cashRefundsPaise: BigInt(20000), counterExpensesPaise: BigInt(1000) };
it("includes cash refunds and counter expenses once, using exact paisa", () => {
  expect(expectedCounterCash(source, date)).toBe(BigInt(579000));
  expect(inspectCounterCash(source, date, "5700").differencePaise).toBe(-BigInt(9000));
  expect(inspectCounterCash(source, date, "5800.01").differencePaise).toBe(BigInt(1001));
  expect(inspectCounterCash(source, date, "5790").differencePaise).toBe(BigInt(0));
  expect(source.openingCashPaise).toBe(BigInt(100000));
});
it("rejects unknown opening cash, incomplete/mismatched periods, invalid flows and dates", () => {
  for (const field of ["openingCashPaise", "cashSalesPaise", "cashRefundsPaise", "counterExpensesPaise"] as const) {
    expect(expectedCounterCash({ ...source, [field]: null }, date)).toBeNull();
    expect(expectedCounterCash({ ...source, [field]: -BigInt(1) }, date)).toBeNull();
  }
  expect(expectedCounterCash({ ...source, complete: false }, date)).toBeNull();
  expect(expectedCounterCash(source, "2026-11-08")).toBeNull();
  expect(expectedCounterCash(source, "")).toBeNull();
  expect(expectedCounterCash(null, date)).toBeNull();
  expect(inspectCounterCash(null, date, "5700").differencePaise).toBeNull();
});
it.each(["-1", "NaN", "Infinity", "1e2", "100.999"])("rejects invalid counted cash %s", (value) => {
  expect(inspectCounterCash(source, date, value)).toMatchObject({ actualPaise: null, differencePaise: null, error: expect.any(String) });
});
it("distinguishes known zero cash, missing actual cash and negative expected balance", () => {
  expect(inspectCounterCash(source, date, "0").actualPaise).toBe(BigInt(0));
  expect(inspectCounterCash(source, date, "").error).toBeUndefined();
  expect(expectedCounterCash({ ...source, openingCashPaise: BigInt(0), cashSalesPaise: BigInt(0) }, date)).toBe(-BigInt(21000));
});
it("shows shortage, extra and matching cash without recording a difference as expense", () => {
  render(<CounterCashSummary businessDate={date} source={source} />);
  const input = screen.getByLabelText("Actual Cash Counted (Rs.)");
  fireEvent.change(input, { target: { value: "5700" } }); expect(screen.getByLabelText("Cash Difference")).toHaveTextContent("Short by Rs. 90.00");
  fireEvent.change(input, { target: { value: "5800" } }); expect(screen.getByLabelText("Cash Difference")).toHaveTextContent("Extra Rs. 10.00");
  fireEvent.change(input, { target: { value: "5790" } }); expect(screen.getByLabelText("Cash Difference")).toHaveTextContent("Cash matches");
  expect(screen.getByText("Preview only. A cash difference is not recorded as an expense.")).toBeVisible();
});
it("keeps real demo cash unavailable even after an actual count is entered", () => {
  render(<CounterCashSummary businessDate={date} />);
  fireEvent.change(screen.getByLabelText("Actual Cash Counted (Rs.)"), { target: { value: "5700" } });
  expect(screen.getByLabelText("Cash Difference")).toHaveTextContent("Not available");
  expect(screen.queryByText(/Short by|Extra Rs/)).toBeNull();
});
