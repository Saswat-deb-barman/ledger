// Indian numbering + money helpers.
export function inr(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(v);
}

export function inrExact(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: 2,
  }).format(v);
}

// Indian financial year for a date: Apr 1 -> Mar 31, formatted "25-26".
export function finYear(d: Date = new Date()): string {
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1; // month 3 = April
  const a = String(startYear).slice(-2);
  const b = String(startYear + 1).slice(-2);
  return `${a}-${b}`;
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN",
    { day: "2-digit", month: "short", year: "numeric" });
}

export const STATUS_COLORS: Record<string, string> = {
  draft:     "bg-line text-muted",
  sent:      "bg-accent/10 text-accent",
  paid:      "bg-income/10 text-income",
  overdue:   "bg-warn/15 text-warn",
  cancelled: "bg-line text-muted line-through",
};

// First day of a month as YYYY-MM-DD (our canonical month key).
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
export function monthLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}
// The 12 months of the current Indian financial year (Apr–Mar), as month keys.
export function finYearMonths(d: Date = new Date()): string[] {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return Array.from({ length: 12 }, (_, i) => {
    const m = (3 + i) % 12;
    const year = 3 + i > 11 ? y + 1 : y;
    return `${year}-${String(m + 1).padStart(2, "0")}-01`;
  });
}
