import { mockSalesBusinessDate, type MockSale } from "@/lib/admin/mock-sales";

export type MockReportPeriod =
  | { kind: "today" }
  | { kind: "monthly"; month: string }
  | { kind: "custom"; from: string; to: string };

// Civil dates in Asia/Karachi, compared directly. Never convert these to UTC.
function isBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

export function selectMockSalesPeriod(sales: readonly MockSale[], period: MockReportPeriod): { sales: readonly MockSale[]; error?: string } {
  if (period.kind === "today") return { sales: sales.filter((sale) => sale.businessDate === mockSalesBusinessDate.iso) };
  if (period.kind === "monthly") {
    if (!isBusinessDate(period.month + "-01")) return { sales: [], error: "Choose a valid month and year." };
    return { sales: sales.filter((sale) => sale.businessDate.slice(0, 7) === period.month) };
  }
  if (!isBusinessDate(period.from) || !isBusinessDate(period.to)) {
    return { sales: [], error: "Enter valid From and To dates." };
  }
  if (period.from > period.to) return { sales: [], error: "From Date must be on or before To Date." };
  return { sales: sales.filter((sale) => sale.businessDate >= period.from && sale.businessDate <= period.to) };
}

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Format the shop's civil date directly; the native input keeps its browser format.
export function formatMockBusinessDate(value: string): string {
  if (!isBusinessDate(value)) return "—";
  const [year, month, day] = value.split("-");
  return day + " " + monthNames[Number(month) - 1].slice(0, 3) + " " + year;
}

export function formatMockReportMonth(value: string): string {
  if (!isBusinessDate(value + "-01")) return "—";
  const [year, month] = value.split("-");
  return monthNames[Number(month) - 1] + " " + year;
}
