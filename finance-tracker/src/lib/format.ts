// Indian numbering + money helpers.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// "Now", anchored to India Standard Time regardless of the server's local
// timezone (Vercel runs Node in UTC — without this, month/FY boundaries
// compute wrong for a few hours around IST midnight). Read this back with
// the UTC getters (getUTCFullYear/getUTCMonth/getUTCDate), not local ones.
export function nowIST(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}

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
// Uses UTC getters throughout: `d` is either nowIST() (already offset to IST
// wall-clock time, so UTC getters read it correctly) or a date-only value
// like new Date("2026-07-16") (parsed as UTC midnight for that calendar
// day) — either way, UTC getters give the intended calendar date regardless
// of the server's own timezone.
export function finYear(d: Date = nowIST()): string {
  const y = d.getUTCFullYear();
  const startYear = d.getUTCMonth() >= 3 ? y : y - 1; // month 3 = April
  const a = String(startYear).slice(-2);
  const b = String(startYear + 1).slice(-2);
  return `${a}-${b}`;
}

// Today's calendar date in IST as YYYY-MM-DD.
export function todayIST(): string {
  const d = nowIST();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
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
export function monthKey(d: Date = nowIST()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
export function monthLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}
// The 12 months of the current Indian financial year (Apr–Mar), as month keys.
export function finYearMonths(d: Date = nowIST()): string[] {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return Array.from({ length: 12 }, (_, i) => {
    const m = (3 + i) % 12;
    const year = 3 + i > 11 ? y + 1 : y;
    return `${year}-${String(m + 1).padStart(2, "0")}-01`;
  });
}
