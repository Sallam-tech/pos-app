import { describe, expect, it } from "vitest";
import { chartAxis, chartCoordinate, chartDateOrdinal, chartTick } from "@/lib/admin/chart-axis";
import type { ChartRow } from "@/lib/admin/report-chart-data";

const row = (value: bigint): ChartRow => ({ id: "test", label: "Test only", value, display: value.toString() });

describe("SVG presentation axes (no financial aggregation)", () => {
  it("uses a real zero and readable ticks covering the exact positive values", () => {
    const axis = chartAxis([row(BigInt(10_000_000)), row(BigInt(7_000_000))], "quantity");
    expect(axis.minimum).toBe(BigInt(0));
    expect(axis.maximum).toBeGreaterThanOrEqual(BigInt(10_000_000));
    expect(axis.ticks.map((tick) => chartTick(tick, "quantity"))).toEqual(["0", "5", "10"]);
    expect(chartCoordinate(BigInt(0), axis, 354)).toBe(0);
    expect(chartCoordinate(BigInt(10_000_000), axis, 354)).toBe(354);
  });

  it("includes a zero tick and covers both signs without an artificial midpoint baseline", () => {
    const axis = chartAxis([row(BigInt(-100)), row(BigInt(1000))], "money");
    expect(axis.minimum).toBeLessThanOrEqual(BigInt(-100));
    expect(axis.maximum).toBeGreaterThanOrEqual(BigInt(1000));
    expect(axis.ticks).toContain(BigInt(0));
    const zero = chartCoordinate(BigInt(0), axis, 400);
    expect(zero).toBeGreaterThan(0);
    expect(zero).toBeLessThan(200);
    expect(chartCoordinate(BigInt(-100), axis, 400)).toBeLessThan(zero);
  });

  it("has a meaningful positive drawing range for all-zero values", () => {
    const axis = chartAxis([row(BigInt(0))], "money");
    expect(axis.minimum).toBe(BigInt(0));
    expect(axis.maximum).toBeGreaterThan(BigInt(0));
    expect(axis.ticks.length).toBeGreaterThan(1);
  });

  it("bounds drawing coordinates safely even for values far beyond Number precision", () => {
    const huge = BigInt(10) ** BigInt(100);
    const axis = chartAxis([row(-huge), row(huge)], "money");
    expect(axis.ticks.length).toBeLessThanOrEqual(6);
    expect(Number.isFinite(chartCoordinate(huge, axis, 400))).toBe(true);
    expect(chartCoordinate(axis.minimum - huge, axis, 400)).toBe(0);
    expect(chartCoordinate(axis.maximum + huge, axis, 400)).toBe(400);
    expect(chartCoordinate(huge, axis, Number.NaN)).toBe(0);
  });

  it("formats exact signed PKR and fractional quantity tick labels without floating point", () => {
    expect(chartTick(BigInt(-1), "money")).toBe("-0.01");
    expect(chartTick(BigInt(125025), "money")).toBe("1,250.25");
    expect(chartTick(BigInt(500000), "quantity")).toBe("0.5");
    expect(chartTick(BigInt(999999000001), "quantity")).toBe("999,999.000001");
  });

  it("uses calendar days/months without UTC or local-browser date shifts", () => {
    const date = (id: string) => chartDateOrdinal(id, "daily")!;
    expect(date("2024-03-01") - date("2024-02-28")).toBe(2);
    expect(date("1900-03-01") - date("1900-02-28")).toBe(1);
    expect(date("2026-12-01") - date("2026-11-30")).toBe(1);
    expect(chartDateOrdinal("2026-12", "monthly")! - chartDateOrdinal("2026-11", "monthly")!).toBe(1);
    expect(chartDateOrdinal("2026-02-29", "daily")).toBeNull();
    expect(chartDateOrdinal("2026-13", "monthly")).toBeNull();
    expect(chartDateOrdinal("2026-11", "daily")).toBeNull();
    expect(chartDateOrdinal("0000-11-02", "daily")).toBeNull();
  });
});
