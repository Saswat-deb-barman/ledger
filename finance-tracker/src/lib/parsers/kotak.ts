import { ParsedStatement, RawTxn } from "./types";

// Kotak: CSV. Header: Sl. No. / Transaction Date / Value Date / Description /
//   Chq /Ref No. / Amount / Dr / Cr / Balance / Dr / Cr
export function parseKotak(text: string, fileName: string): ParsedStatement {
  const rows = csvRows(text);
  let account_no: string | null = null, ifsc: string | null = null;
  let period_from: string | null = null, period_to: string | null = null;

  for (const r of rows.slice(0, 15)) {
    const key = r[4]?.trim(); const val = r[5]?.trim();
    if (key === "Account No.") account_no = val;
    if (key === "IFSC") ifsc = val;
    if (key === "Period") {
      const m = val?.match(/From\s+(\d{2}\/\d{2}\/\d{4})\s+To\s+(\d{2}\/\d{2}\/\d{4})/i);
      if (m) { period_from = dmy(m[1]); period_to = dmy(m[2]); }
    }
  }

  const hIdx = rows.findIndex(r => r[0]?.trim() === "Sl. No.");
  const txns: RawTxn[] = [];
  for (const r of rows.slice(hIdx + 1)) {
    const sl = r[0]?.trim();
    if (!sl || isNaN(Number(sl))) continue;
    const date = (r[1] || "").split(" ")[0];      // "10-07-2026 01:18:16"
    const desc = (r[3] || "").trim();
    const ref = (r[4] || "").trim();
    const amount = num(r[5]);
    const drcr = (r[6] || "").trim().toUpperCase();
    const bal = num(r[7]);
    if (!amount) continue;
    txns.push({
      txn_date: dmyDash(date), description: desc, reference: ref,
      amount, direction: drcr === "CR" ? "credit" : "debit", balance: bal,
    });
  }
  return {
    bank: "kotak", account_no, ifsc,
    account_label: `Kotak ${account_no ? "…" + account_no.slice(-4) : ""}`.trim(),
    period_from, period_to, txns,
  };
}

function csvRows(text: string): string[][] {
  // minimal CSV parse handling quoted fields
  const out: string[][] = [];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (line === "") continue;
    const cells: string[] = []; let cur = "", q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    out.push(cells);
  }
  return out;
}
function num(v: any): number {
  const n = parseFloat(String(v ?? "").replace(/[, ]/g, ""));
  return isNaN(n) ? 0 : n;
}
function dmy(s: string): string { const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : s; }
function dmyDash(s: string): string { const m = s.match(/(\d{2})-(\d{2})-(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : s; }
