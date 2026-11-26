import "server-only";

// What the Return & Refund search box matches, worked out once so the SQL filter and the
// per-line "matched" flag agree. Lower-casing is plain JavaScript, exactly like pos_lower().
export type ReturnSearch = Readonly<{
  /** Lower-cased text matched against bill number, product name/code/size/barcode and customer name. */
  text: string;
  /** Digits only, when the text looks like a phone number; matched against the saved customer phone. */
  phone: string | null;
  /** A whole day (YYYY-MM-DD) or month (YYYY-MM), only when the text is clearly a date. */
  date: string | null;
}>;

export function returnSearch(query: string): ReturnSearch {
  const text = query.trim().toLowerCase();
  const digits = text.replace(/[\s()+-]/g, "");
  const phone = /^\d{4,}$/.test(digits) ? digits : null;
  // Bills in Pakistan are read day-first (26/11/2026); ISO days and months also work. A bare
  // number such as "11" is deliberately not a date, so it cannot list every November bill.
  let date: string | null = null;
  const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (dayFirst) {
    const day = Number(dayFirst[1]), month = Number(dayFirst[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) date = `${dayFirst[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } else if (/^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/.test(text)) date = text;
  return Object.freeze({ text, phone, date });
}

export function lineMatches(search: ReturnSearch, line: { name: string; code: string; sizeLabel: string | null; barcode: string | null }): boolean {
  if (!search.text) return false;
  return [line.name, line.code, line.sizeLabel, line.barcode].some(value => typeof value === "string" && value.toLowerCase().includes(search.text));
}
