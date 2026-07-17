import * as XLSX from "xlsx";
import { ParsedStatement, RawTxn } from "./types";

// Axis: binary XLS. Header row has SRL NO / Tran Date / CHQNO / PARTICULARS / DR / CR / BAL / SOL.
// Merchant sits inside PARTICULARS; DR and CR are separate columns (one is blank).
export function parseAxis(buf: Buffer | ArrayBuffer, fileName: string): ParsedStatement {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

  let account_no: string | null = null, ifsc: string | null = null;
  let period_from: string | null = null, period_to: string | null = null;

  for (const r of rows.slice(0, 20)) {
    const line = r.join(" ");
    const acc = line.match(/Axis Account No\s*-\s*(\d+)/i);
    if (acc) account_no = acc[1];
    const ic = line.match(/IFSC Code\s*:-\s*(\w+)/i);
    if (ic) ifsc = ic[1];
    const per = line.match(/From\s*:\s*(\d{2}-\d{2}-\d{4})\s+To\s*:\s*(\d{2}-\d{2}-\d{4})/i);
    if (per) { period_from = dmy(per[1]); period_to = dmy(per[2]); }
  }

  // find header row index
  const hIdx = rows.findIndex(r => String(r[0]).trim() === "SRL NO" || String(r[1]).includes("Tran Date"));
  const txns: RawTxn[] = [];
  for (const r of rows.slice(hIdx + 1)) {
    const srl = String(r[0]).trim();
    if (!srl || isNaN(Number(srl))) continue;
    const date = dmy(String(r[1]).trim());
    const particulars = String(r[3]).trim();      // PARTICULARS is col index 3 (col 2 = CHQNO, usually empty)
    const dr = num(r[4]); const cr = num(r[5]); const bal = num(r[6]);
    if (dr === 0 && cr === 0) continue;
    txns.push({
      txn_date: date, description: particulars, reference: "",
      amount: dr > 0 ? dr : cr,
      direction: dr > 0 ? "debit" : "credit",
      balance: bal,
    });
  }
  return {
    bank: "axis", account_no, ifsc,
    account_label: `Axis ${account_no ? "…" + account_no.slice(-4) : ""}`.trim(),
    period_from, period_to, txns,
  };
}

function num(v: any): number {
  const n = parseFloat(String(v ?? "").replace(/[, ]/g, ""));
  return isNaN(n) ? 0 : n;
}
function dmy(s: string): string {
  const m = s.match(/(\d{2})-(\d{2})-(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}
