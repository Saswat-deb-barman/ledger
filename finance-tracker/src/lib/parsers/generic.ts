import * as XLSX from "xlsx";
import { ParsedStatement, RawTxn } from "./types";

// ============================================================================
//  Generic, config-driven statement parser — powers "Add any bank".
//
//  Design rules (this code handles untrusted files and untrusted JSON):
//   • A "format" is plain DATA (a column mapping), never code or a regex.
//   • Everything user-supplied is validated: integers in range, enums only.
//   • Row / size caps stop pathological files from exhausting memory.
// ============================================================================

export const MAX_ROWS = 100_000;
const MAX_COLS = 60;
const HEADER_SCAN_ROWS = 100;
const MAX_CELL_LEN = 500;

export type DateOrder = "DMY" | "MDY" | "YMD";
export type AmountStyle = "split" | "signed" | "drcr";
type ColIdx = number | null;

export type FormatConfig = {
  version: 1;
  header_row: number;             // 0-based row index of the header in the grid
  date_order: DateOrder;          // order of numeric dates (month names are automatic)
  amount_style: AmountStyle;      // split = debit & credit columns; signed = one column,
                                  // negative = money out; drcr = amount + a Dr/Cr marker column
  invert_sign?: boolean;          // signed style only: positive = money OUT (e.g. card exports)
  columns: {
    date: ColIdx; description: ColIdx; reference: ColIdx;
    debit: ColIdx; credit: ColIdx; amount: ColIdx; drcr: ColIdx; balance: ColIdx;
  };
};

export type Grid = string[][];

// ---------------------------------------------------------------- reading ---

export function readGrid(fileName: string, buf: Buffer): Grid {
  const isXlsLike =
    (buf[0] === 0xD0 && buf[1] === 0xCF) ||                // OLE2 (.xls)
    (buf[0] === 0x50 && buf[1] === 0x4B) ||                // zip (.xlsx)
    /^\s*(<\?xml|<Workbook)/i.test(buf.subarray(0, 200).toString("utf8")); // SpreadsheetML

  let rows: unknown[][];
  if (isXlsLike) {
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true, dateNF: "yyyy-mm-dd" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error("The file has no readable sheet.");
    const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    if (ref && ref.e.r - ref.s.r > MAX_ROWS * 2) throw new Error("File has too many rows.");
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false }) as unknown[][];
  } else {
    rows = parseDelimited(buf.toString("utf8").replace(/^﻿/, ""));
  }
  if (rows.length > MAX_ROWS) throw new Error(`File has more than ${MAX_ROWS} rows.`);
  return rows
    .map(r => r.slice(0, MAX_COLS).map(c => String(c ?? "").trim().slice(0, MAX_CELL_LEN)))
    .filter(r => r.some(c => c !== ""));
}

// RFC-4180-style parser with delimiter sniffing (comma / semicolon / tab / pipe).
function parseDelimited(text: string): string[][] {
  const sample = text.split("\n").slice(0, 8).join("\n");
  const count = (ch: string) => (sample.match(new RegExp(`\\${ch}`, "g")) ?? []).length;
  const delim = [",", ";", "\t", "|"].map(d => [d, count(d)] as const).sort((a, b) => b[1] - a[1])[0][0];

  const out: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = ""; out.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); out.push(row); }
  return out;
}

// -------------------------------------------------------------- detection ---

type Field = "date" | "valuedate" | "description" | "reference" | "debit" | "credit" | "amount" | "drcr" | "balance";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const EXACT: Record<string, Field> = {
  date: "date", txndate: "date", transactiondate: "date", trandate: "date", transdate: "date",
  postdate: "date", postingdate: "date", bookingdate: "date", valuedate: "valuedate", valdt: "valuedate",
  description: "description", narration: "description", particulars: "description", details: "description",
  remarks: "description", transactiondetails: "description", transactionremarks: "description",
  transactiondescription: "description", transactionnarration: "description", narrative: "description",
  chqrefno: "reference", chequerefno: "reference", chqno: "reference", chequeno: "reference", refno: "reference",
  reference: "reference", referenceno: "reference", utr: "reference", utrno: "reference", transactionid: "reference",
  txnid: "reference", instrumentid: "reference", refnochqno: "reference",
  debit: "debit", debits: "debit", dr: "debit", withdrawal: "debit", withdrawals: "debit",
  withdrawalamt: "debit", withdrawalamount: "debit", debitamount: "debit", paidout: "debit", moneyout: "debit",
  credit: "credit", credits: "credit", cr: "credit", deposit: "credit", deposits: "credit",
  depositamt: "credit", depositamount: "credit", creditamount: "credit", paidin: "credit", moneyin: "credit",
  amount: "amount", amt: "amount", transactionamount: "amount", txnamount: "amount", amountinr: "amount",
  drcr: "drcr", crdr: "drcr", type: "drcr", transactiontype: "drcr", txntype: "drcr", debitcredit: "drcr", creditdebit: "drcr",
  balance: "balance", bal: "balance", closingbalance: "balance", runningbalance: "balance",
  balanceinr: "balance", availablebalance: "balance",
};

function fieldOf(label: string): Field | null {
  const n = norm(label);
  if (!n) return null;
  if (EXACT[n]) return EXACT[n];
  if (n.includes("withdraw")) return "debit";
  if (n.includes("deposit")) return "credit";
  if (n.includes("debit") && n.includes("credit")) return "drcr";
  if (n.includes("debit")) return "debit";
  if (n.includes("credit")) return "credit";
  if (n.includes("balance")) return "balance";
  if (n.includes("narration") || n.includes("particular") || n.includes("description")) return "description";
  if (n.includes("date")) return n.includes("value") ? "valuedate" : "date";
  if (n.includes("chq") || n.includes("cheque") || n.includes("utr") || n.startsWith("ref")) return "reference";
  if (n.includes("amount")) return "amount";
  return null;
}

function mapRow(cells: string[]): Partial<Record<Field, number>> {
  const m: Partial<Record<Field, number>> = {};
  cells.forEach((c, i) => { const f = fieldOf(c); if (f && m[f] === undefined) m[f] = i; });
  return m;
}

export type Detection = { config: FormatConfig; warnings: string[]; confident: boolean };

export function detectConfig(grid: Grid): Detection {
  const warnings: string[] = [];
  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(grid.length, HEADER_SCAN_ROWS); i++) {
    const m = mapRow(grid[i]);
    const hasDate = m.date !== undefined || m.valuedate !== undefined;
    const hasMoney = (m.debit !== undefined && m.credit !== undefined) || m.amount !== undefined;
    if (!hasDate || !hasMoney || m.description === undefined) continue;
    const score = Object.keys(m).length;
    if (score > bestScore) { best = i; bestScore = score; }
  }

  if (best < 0) {
    warnings.push("Couldn't find a header row automatically — pick the header row and map the columns yourself.");
    return {
      confident: false, warnings,
      config: {
        version: 1, header_row: 0, date_order: "DMY", amount_style: "split",
        columns: { date: null, description: null, reference: null, debit: null, credit: null, amount: null, drcr: null, balance: null },
      },
    };
  }

  const m = mapRow(grid[best]);
  const dateCol = m.date ?? m.valuedate ?? null;
  const amountCol = m.amount ?? null;
  // Prefer the Dr/Cr marker that sits to the right of the amount column.
  let drcrCol: ColIdx = null;
  grid[best].forEach((c, i) => {
    if (fieldOf(c) === "drcr" && drcrCol === null && (amountCol === null || i > amountCol)) drcrCol = i;
  });

  const split = m.debit !== undefined && m.credit !== undefined;
  const data = grid.slice(best + 1);
  const samples = data.map(r => r[dateCol ?? 0] ?? "").filter(Boolean).slice(0, 60);
  const date_order = inferDateOrder(samples);

  let amount_style: AmountStyle = "split";
  let invert_sign = false;
  if (!split) {
    amount_style = drcrCol !== null ? "drcr" : "signed";
    if (amount_style === "signed") {
      const neg = data.slice(0, 200).some(r => (parseAmount(r[amountCol ?? 0] ?? "")?.value ?? 0) < 0);
      const hasSuffix = data.slice(0, 200).some(r => parseAmount(r[amountCol ?? 0] ?? "")?.dir);
      if (!neg && !hasSuffix) warnings.push(
        "All amounts look positive and there's no Dr/Cr column, so money in/out can't be told apart. " +
        "Pick the Dr/Cr column if there is one, otherwise this layout isn't supported yet.");
    }
  }

  return {
    confident: warnings.length === 0, warnings,
    config: {
      version: 1, header_row: best, date_order, amount_style, invert_sign,
      columns: {
        date: dateCol, description: m.description ?? null, reference: m.reference ?? null,
        debit: split ? m.debit! : null, credit: split ? m.credit! : null,
        amount: split ? null : amountCol, drcr: split ? null : drcrCol, balance: m.balance ?? null,
      },
    },
  };
}

// ----------------------------------------------------------- value parsing ---

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function mk(y: number, mo: number, d: number): string | null {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const fullYear = (s: string) => { const n = +s; return s.length === 2 ? (n < 70 ? 2000 + n : 1900 + n) : n; };

export function parseDate(raw: string, order: DateOrder): string | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  s = s.replace(/[T\s]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s?([AaPp][Mm])?\s*(Z|[+-]\d{2}:?\d{2})?$/, "").trim();

  // Excel serial number that slipped through as text
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Math.round((parseFloat(s) - 25569) * 86400000));
    return mk(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return mk(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-\s/.]([A-Za-z]{3,9})[-\s/.,]*(\d{2,4})$/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return mk(fullYear(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return mk(fullYear(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const [a, b, y] = [+m[1], +m[2], fullYear(m[3])];
    return order === "MDY" ? mk(y, a, b) : mk(y, b, a);
  }
  return null;
}

export function inferDateOrder(samples: string[]): DateOrder {
  for (const s of samples) {
    const m = s.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!m) continue;
    if (+m[1] > 12) return "DMY";
    if (+m[2] > 12) return "MDY";
  }
  return "DMY"; // ambiguous → default to day-first (India); the user can flip it in the preview
}

export function parseAmount(raw: string): { value: number; dir: "credit" | "debit" | null } | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  let dir: "credit" | "debit" | null = null;
  const suffix = s.match(/\s*(cr|dr|credit|debit)\.?$/i);
  if (suffix) { dir = suffix[1][0].toLowerCase() === "c" ? "credit" : "debit"; s = s.slice(0, suffix.index).trim(); }
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/[-−]$/.test(s)) { neg = true; s = s.slice(0, -1); }
  if (/^[-−]/.test(s)) { neg = true; s = s.slice(1); }
  s = s.replace(/₹|\$|€|£|rs\.?|inr/gi, "").replace(/[,\s]/g, "");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const v = parseFloat(s);
  return isFinite(v) ? { value: neg ? -v : v, dir } : null;
}

function markerDir(s: string): "credit" | "debit" | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (t[0] === "c") return "credit";
  if (t[0] === "d" || t[0] === "w") return "debit";
  return null;
}

// -------------------------------------------------------------- validation ---

const ORDERS = ["DMY", "MDY", "YMD"] as const;
const STYLES = ["split", "signed", "drcr"] as const;
const COLS = ["date", "description", "reference", "debit", "credit", "amount", "drcr", "balance"] as const;

// Turns arbitrary JSON from the client into a safe FormatConfig (throws on garbage).
export function sanitizeConfig(input: unknown): FormatConfig {
  const o = input as any;
  if (!o || typeof o !== "object") throw new Error("Invalid format config.");
  const int = (v: unknown, max: number): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > max) throw new Error("Invalid column number in format config.");
    return n;
  };
  if (!ORDERS.includes(o.date_order)) throw new Error("Invalid date order.");
  if (!STYLES.includes(o.amount_style)) throw new Error("Invalid amount style.");
  const columns: any = {};
  for (const c of COLS) columns[c] = int(o.columns?.[c], MAX_COLS - 1);
  const header_row = int(o.header_row, HEADER_SCAN_ROWS * 5);
  if (header_row === null) throw new Error("Missing header row.");
  return {
    version: 1, header_row, date_order: o.date_order, amount_style: o.amount_style,
    invert_sign: o.invert_sign === true, columns,
  };
}

export function configErrors(c: FormatConfig): string[] {
  const e: string[] = [];
  const k = c.columns;
  if (k.date === null) e.push("Choose the date column.");
  if (k.description === null) e.push("Choose the description column.");
  if (c.amount_style === "split" && (k.debit === null || k.credit === null)) e.push("Choose both the debit and credit columns.");
  if (c.amount_style !== "split" && k.amount === null) e.push("Choose the amount column.");
  if (c.amount_style === "drcr" && k.drcr === null) e.push("Choose the Dr/Cr marker column.");
  return e;
}

// ----------------------------------------------------------------- applying ---

export type ApplyResult = { txns: RawTxn[]; skipped: number; warnings: string[] };

export function applyConfig(grid: Grid, c: FormatConfig): ApplyResult {
  const errs = configErrors(c);
  if (errs.length) throw new Error(errs[0]);
  const k = c.columns;
  const cell = (r: string[], i: ColIdx) => (i === null ? "" : r[i] ?? "");
  const txns: RawTxn[] = [];
  let skipped = 0, ambiguous = 0;
  const seen = new Map<string, number>();

  for (const r of grid.slice(c.header_row + 1)) {
    const date = parseDate(cell(r, k.date), c.date_order);
    if (!date) { skipped++; continue; }              // footers, totals, repeated headers, blanks

    let amount = 0, direction: "credit" | "debit" | null = null;
    if (c.amount_style === "split") {
      const d = Math.abs(parseAmount(cell(r, k.debit))?.value ?? 0);
      const cr = Math.abs(parseAmount(cell(r, k.credit))?.value ?? 0);
      if (d > 0 && cr > 0) { ambiguous++; continue; }
      if (d > 0) { amount = d; direction = "debit"; }
      else if (cr > 0) { amount = cr; direction = "credit"; }
    } else {
      const a = parseAmount(cell(r, k.amount));
      if (a) {
        amount = Math.abs(a.value);
        if (c.amount_style === "drcr") direction = a.dir ?? markerDir(cell(r, k.drcr));
        else {
          const out = c.invert_sign ? a.value > 0 : a.value < 0;
          direction = a.dir ?? (out ? "debit" : "credit");
        }
      }
    }
    if (!direction || amount === 0) { skipped++; continue; }

    const bal = parseAmount(cell(r, k.balance));
    const txn: RawTxn = {
      txn_date: date,
      description: cell(r, k.description).slice(0, 500),
      reference: cell(r, k.reference).slice(0, 100),
      amount: Math.round(amount * 100) / 100, direction,
      balance: bal ? Math.round(bal.value * 100) / 100 : null,
    };
    if (txn.balance === null) {
      // Without a running balance, identical same-day rows would collapse in the
      // dedupe fingerprint — number them within the file instead.
      const key = `${date}|${txn.amount}|${direction}|${txn.description}`;
      const n = seen.get(key) ?? 0; seen.set(key, n + 1); txn.seq = n;
    }
    txns.push(txn);
  }

  const warnings: string[] = [];
  if (ambiguous) warnings.push(`${ambiguous} row(s) had both a debit and a credit and were skipped.`);
  if (txns.length === 0) warnings.push("No transactions were read with this mapping.");
  return { txns, skipped, warnings };
}

export function summarize(txns: RawTxn[]) {
  const dates = txns.map(t => t.txn_date).sort();
  const sum = (d: "credit" | "debit") => Math.round(txns.filter(t => t.direction === d).reduce((s, t) => s + t.amount, 0) * 100) / 100;
  return {
    count: txns.length, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null,
    credits: sum("credit"), debits: sum("debit"),
  };
}

// ------------------------------------------------- recognising saved formats ---

export function signatureOf(cells: string[]): string {
  return cells.map(norm).filter(Boolean).join("|");
}

// Finds the saved format whose header signature appears in this file.
export function matchSavedFormat<T extends { signature: string; config: FormatConfig }>(
  grid: Grid, formats: T[],
): { format: T; header_row: number } | null {
  for (let i = 0; i < Math.min(grid.length, HEADER_SCAN_ROWS); i++) {
    const sig = signatureOf(grid[i]);
    if (!sig) continue;
    const f = formats.find(x => x.signature === sig);
    if (f) return { format: f, header_row: i };
  }
  return null;
}

// Pulls an account number / IFSC out of the lines above the header, if present.
export function extractAccountInfo(grid: Grid, headerRow: number): { account_no: string | null; ifsc: string | null } {
  let account_no: string | null = null, ifsc: string | null = null;
  for (const r of grid.slice(0, Math.max(headerRow, 0) + 1).slice(0, 40)) {
    const line = r.join(" ");
    const a = line.match(/(?:a\/c|account)\s*(?:no|number|num|#)?\.?\s*[:\-–]?\s*([0-9Xx*]{6,20})/i);
    if (a && !account_no) account_no = a[1];
    const i = line.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/);
    if (i && !ifsc) ifsc = i[1];
  }
  return { account_no, ifsc };
}

export function parseWithConfig(
  grid: Grid, config: FormatConfig, bankLabel: string,
): ParsedStatement & { skipped: number; warnings: string[] } {
  const { txns, skipped, warnings } = applyConfig(grid, config);
  const info = extractAccountInfo(grid, config.header_row);
  const dates = txns.map(t => t.txn_date).sort();
  return {
    bank: bankLabel, custom: true,
    account_no: info.account_no, ifsc: info.ifsc,
    account_label: bankLabel,
    period_from: dates[0] ?? null, period_to: dates[dates.length - 1] ?? null,
    txns, skipped, warnings,
  };
}
