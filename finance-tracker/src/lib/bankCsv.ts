// Bank statement CSV parsing — header names vary a lot bank to bank (HDFC,
// Kotak, ICICI, SBI, ...), so this matches by keyword rather than hardcoding
// one bank's column names. No sample statement was available when this was
// written; if a real export doesn't parse, the header list returned in the
// error is meant to make the mismatch obvious rather than fail silently.

export type ParsedTxn = {
  txn_date: string;      // YYYY-MM-DD
  description: string;
  amount: number;        // always positive
  direction: "credit" | "debit";
  balance: number | null;
  raw: Record<string, string>;
};

// Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas,
// escaped quotes ("") and CRLF/LF line endings.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else if (c === "\r") {
      // skip; \n follows
    } else {
      field += c;
    }
  }
  if (field.length || row.length) pushRow();
  return rows.filter(r => r.some(c => c.trim() !== ""));
}

function findCol(headers: string[], keywords: string[], exclude: string[] = []): number {
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const kw of keywords) {
    const idx = lower.findIndex(h => h.includes(kw) && !exclude.some(ex => h.includes(ex)));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^\d.\-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // DD/MM/YY or DD-MM-YY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m) return `20${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // DD-MMM-YYYY (e.g. 17-Jul-2026) or DD MMM YYYY
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  m = s.match(/^(\d{1,2})[\-\s]([A-Za-z]{3,})[\-\s](\d{4})/);
  if (m) {
    const mon = months[m[2].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export function parseBankStatement(csvText: string): { txns: ParsedTxn[]; headers: string[] } {
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new Error("CSV has no data rows");

  // Some bank exports have a few title/metadata rows before the real header —
  // scan the first 10 rows for one that looks like a header (contains a date-ish
  // and amount-ish keyword together).
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const lower = rows[i].map(c => c.toLowerCase());
    const hasDate = lower.some(c => c.includes("date"));
    const hasAmount = lower.some(c => c.includes("debit") || c.includes("credit") || c.includes("amount") || c.includes("withdrawal") || c.includes("deposit"));
    if (hasDate && hasAmount) { headerIdx = i; break; }
  }
  const headers = rows[headerIdx];
  const dataRows = rows.slice(headerIdx + 1);

  const dateCol = findCol(headers, ["txn date", "transaction date", "date"], ["value"]);
  const descCol = findCol(headers, ["narration", "description", "particulars", "remarks", "details"]);
  const debitCol = findCol(headers, ["debit", "withdrawal"]);
  const creditCol = findCol(headers, ["credit", "deposit"]);
  const amountCol = findCol(headers, ["amount"], ["debit", "credit"]);
  const typeCol = findCol(headers, ["type", "dr/cr", "cr/dr"]);
  const balanceCol = findCol(headers, ["balance"]);

  if (dateCol < 0) {
    throw new Error(`Couldn't find a date column. Headers found: ${headers.join(", ")}`);
  }
  if (debitCol < 0 && creditCol < 0 && amountCol < 0) {
    throw new Error(`Couldn't find debit/credit/amount columns. Headers found: ${headers.join(", ")}`);
  }

  const txns: ParsedTxn[] = [];
  for (const r of dataRows) {
    const dateRaw = r[dateCol] ?? "";
    const txn_date = parseDate(dateRaw);
    if (!txn_date) continue; // skip footer/summary rows that don't have a real date

    let amount = 0;
    let direction: "credit" | "debit" | null = null;

    if (debitCol >= 0 && parseAmount(r[debitCol] ?? "") > 0) {
      amount = parseAmount(r[debitCol]); direction = "debit";
    } else if (creditCol >= 0 && parseAmount(r[creditCol] ?? "") > 0) {
      amount = parseAmount(r[creditCol]); direction = "credit";
    } else if (amountCol >= 0) {
      const raw = parseAmount(r[amountCol] ?? "");
      amount = Math.abs(raw);
      if (raw !== 0) {
        if (typeCol >= 0) {
          const t = (r[typeCol] ?? "").toLowerCase();
          direction = t.includes("cr") || t.includes("credit") ? "credit" : "debit";
        } else {
          direction = raw < 0 ? "debit" : "credit";
        }
      }
    }
    if (!direction || amount === 0) continue; // no real movement on this row

    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { raw[h || `col_${i}`] = r[i] ?? ""; });

    txns.push({
      txn_date,
      description: descCol >= 0 ? (r[descCol] ?? "").trim() : "",
      amount,
      direction,
      balance: balanceCol >= 0 ? (parseAmount(r[balanceCol] ?? "") || null) : null,
      raw,
    });
  }

  return { txns, headers };
}
