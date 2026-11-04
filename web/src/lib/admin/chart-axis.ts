import { formatProfitMoney } from "@/lib/admin/mock-profit";
import { chartWidthPercent, type ChartRow, type ChartGrouping } from "@/lib/admin/report-chart-data";

export type ChartMeasure = "quantity" | "money";
export type ChartAxis = Readonly<{ minimum: bigint; maximum: bigint; ticks: readonly bigint[] }>;

function niceStep(value: bigint): bigint {
  let power = BigInt(1);
  while (power * BigInt(10) < value) power *= BigInt(10);
  for (const factor of [1, 2, 5, 10]) {
    if (power * BigInt(factor) >= value) return power * BigInt(factor);
  }
  return power * BigInt(10);
}

// Presentation bounds only. The verified data/financial helpers stay unchanged.
export function chartAxis(rows: readonly ChartRow[], measure: ChartMeasure): ChartAxis {
  let low = BigInt(0), high = BigInt(0);
  for (const { value } of rows) {
    if (value !== null && value < low) low = value;
    if (value !== null && value > high) high = value;
  }
  if (low === high) high = measure === "money" ? BigInt(100) : BigInt(1_000_000);
  const step = niceStep((high - low + BigInt(2)) / BigInt(3));
  const minimum = -((-low + step - BigInt(1)) / step * step);
  const maximum = (high + step - BigInt(1)) / step * step;
  const ticks: bigint[] = [];
  for (let tick = minimum; tick <= maximum; tick += step) ticks.push(tick);
  return { minimum, maximum, ticks };
}

export function chartCoordinate(value: bigint, axis: ChartAxis, length: number): number {
  if (!Number.isFinite(length) || length < 0 || value <= axis.minimum) return 0;
  // Only a bounded drawing ratio becomes a Number, never a financial amount.
  return chartWidthPercent(value - axis.minimum, axis.maximum - axis.minimum) / 100 * length;
}

export function chartTick(value: bigint, measure: ChartMeasure): string {
  if (measure === "money") return formatProfitMoney(value).replace("Rs. ", "");
  const negative = value < BigInt(0);
  const magnitude = negative ? -value : value;
  const whole = (magnitude / BigInt(1_000_000)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (magnitude % BigInt(1_000_000)).toString().padStart(6, "0").replace(/0+$/, "");
  return (negative ? "-" : "") + whole + (fraction ? "." + fraction : "");
}

// Calendar arithmetic for horizontal spacing. No browser time zone conversion.
export function chartDateOrdinal(id: string, grouping: ChartGrouping): number | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(id);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return null;
  if (grouping === "monthly") return match[3] ? null : year * 12 + month - 1;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!Number.isInteger(day) || day < 1 || day > monthDays[month - 1]) return null;
  const prior = year - 1;
  return prior * 365 + Math.floor(prior / 4) - Math.floor(prior / 100) + Math.floor(prior / 400)
    + monthDays.slice(0, month - 1).reduce((sum, days) => sum + days, 0) + day;
}
