import { ParsedStatement, RawTxn } from "./types";

// Yes Bank: SpreadsheetML (XML). Columns: Transaction Date / Value Date /
//   Cheque No/Reference No / Description / Withdrawals / Deposits / Running Balance
export function parseYesBank(xml: string, fileName: string): ParsedStatement {
  const rowsRaw = [...xml.matchAll(/<Row[^>]*>([\s\S]*?)<\/Row>/g)].map(m => {
    // Split by <Cell> so empty/self-closing cells still hold a position.
    const cells = [...m[1].matchAll(/<Cell\b[^>]*>([\s\S]*?)<\/Cell>/g)].map(c => {
      // self-closing <Data .../> => empty; otherwise capture inner text
      const dm = c[1].match(/<Data[^>]*>([\s\S]*?)<\/Data>/);
      return dm ? decode(dm[1]) : "";
    });
    return cells;
  });

  let account_no: string | null = null, ifsc: string | null = null;
  let period_from: string | null = null, period_to: string | null = null;

  for (const r of rowsRaw.slice(0, 20)) {
    const line = r.join(" ");
    const acc = r.findIndex(c => c === "Account No :");
    if (acc >= 0 && r[acc + 1]) account_no = r[acc + 1].split(" ")[0].replace(/\D/g, "") || account_no;
    const per = line.match(/FROM\s+(\d{2}\s+\w{3}\s+\d{4})\s+TO\s+(\d{2}\s+\w{3}\s+\d{4})/i);
    if (per) { period_from = mon(per[1]); period_to = mon(per[2]); }
    const ic = line.match(/IFSC[^:]*:\s*(\w{11})/i);
    if (ic) ifsc = ic[1];
  }

  const hIdx = rowsRaw.findIndex(r => r[0] === "Transaction Date");
  const txns: RawTxn[] = [];
  for (const r of rowsRaw.slice(hIdx + 1)) {
    if (r.length < 7) continue;
    const [tdate, , ref, desc, wd, dep, bal] = r;
    if (!tdate || tdate === "Transaction Date") continue;
    const w = num(wd), d = num(dep);
    if (w === 0 && d === 0) continue;
    txns.push({
      txn_date: mon(tdate), description: (desc || "").trim(), reference: (ref || "").trim(),
      amount: w > 0 ? w : d, direction: w > 0 ? "debit" : "credit", balance: num(bal),
    });
  }
  return {
    bank: "yes", account_no, ifsc,
    account_label: `Yes Bank ${account_no ? "…" + account_no.slice(-4) : ""}`.trim(),
    period_from, period_to, txns,
  };
}

const MON: Record<string, string> = { Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12" };
function mon(s: string): string {
  const m = s.match(/(\d{2})\s+(\w{3})\s+(\d{4})/);
  return m ? `${m[3]}-${MON[m[2]] ?? "01"}-${m[1]}` : s;
}
function num(v: any): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[, ]/g, ""));
  return isNaN(n) ? 0 : n;
}
function decode(s: string): string {
  return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
          .replace(/&#10;/g," ").replace(/&quot;/g,'"').trim();
}
