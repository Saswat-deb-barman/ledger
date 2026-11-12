"use client";
import { useEffect, useRef, useState } from "react";
import { inr, fmtDate } from "@/lib/format";
import { X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

type Config = {
  version: 1; header_row: number; date_order: "DMY" | "MDY" | "YMD";
  amount_style: "split" | "signed" | "drcr"; invert_sign?: boolean;
  columns: Record<"date" | "description" | "reference" | "debit" | "credit" | "amount" | "drcr" | "balance", number | null>;
};
type Analysis = {
  config: Config; confident: boolean; errors: string[]; warnings: string[];
  preview: any[]; summary: { count: number; first: string | null; last: string | null; credits: number; debits: number } | null;
  skipped: number; grid_preview: string[][]; total_rows: number;
};

const colLetter = (i: number) => String.fromCharCode(65 + (i % 26)).padStart(i >= 26 ? 2 : 1, "A");
const FIELDS_BY_STYLE: Record<Config["amount_style"], [keyof Config["columns"], string][]> = {
  split:  [["date", "Date"], ["description", "Description"], ["debit", "Money out (debit)"], ["credit", "Money in (credit)"], ["balance", "Balance (optional)"], ["reference", "Reference (optional)"]],
  signed: [["date", "Date"], ["description", "Description"], ["amount", "Amount"], ["balance", "Balance (optional)"], ["reference", "Reference (optional)"]],
  drcr:   [["date", "Date"], ["description", "Description"], ["amount", "Amount"], ["drcr", "Dr/Cr marker"], ["balance", "Balance (optional)"], ["reference", "Reference (optional)"]],
};

export default function AddBankWizard({ file, accounts, onClose, onDone }: {
  file: File; accounts: { id: string; account_name: string }[];
  onClose: () => void; onDone: (msg: string) => void;
}) {
  const [a, setA] = useState<Analysis | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState("");
  const seq = useRef(0);   // ignore out-of-order responses

  const analyze = async (cfg?: Config) => {
    const my = ++seq.current;
    setLoading(true); setErr("");
    const fd = new FormData(); fd.append("file", file);
    if (cfg) fd.append("config", JSON.stringify(cfg));
    try {
      const res = await fetch("/api/statements/analyze", { method: "POST", body: fd });
      const j = await res.json();
      if (my !== seq.current) return;
      if (!res.ok) { setErr(j.error ?? "Couldn't read that file."); setLoading(false); return; }
      setA(j); setConfig(j.config);
    } catch { if (my === seq.current) setErr("Couldn't reach the server."); }
    if (my === seq.current) setLoading(false);
  };
  useEffect(() => { analyze(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Re-run the preview (debounced) whenever the user changes the mapping.
  const timer = useRef<any>(null);
  const update = (patch: Partial<Config> | ((c: Config) => Config)) => {
    if (!config) return;
    const next = typeof patch === "function" ? patch(config) : { ...config, ...patch };
    setConfig(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => analyze(next), 350);
  };
  const setCol = (k: keyof Config["columns"], v: string) =>
    update(c => ({ ...c, columns: { ...c.columns, [k]: v === "" ? null : Number(v) } }));

  const headers = a && config ? (a.grid_preview[config.header_row] ?? []) : [];
  const ready = !!a && !!config && a.errors.length === 0 && (a.summary?.count ?? 0) > 0 && name.trim().length > 0;

  const doImport = async () => {
    if (!config) return;
    setImporting(true); setErr("");
    const fd = new FormData();
    fd.append("file", file); fd.append("config", JSON.stringify(config));
    fd.append("format_name", name.trim()); fd.append("save_format", remember ? "1" : "0");
    if (accountId) fd.append("account_id", accountId);
    const res = await fetch("/api/statements/upload", { method: "POST", body: fd });
    const j = await res.json();
    setImporting(false);
    if (!res.ok) { setErr(j.error ?? "Import failed."); return; }
    onDone(`${j.bank} · ${j.inserted} new, ${j.duplicates} duplicates skipped${j.format_saved ? " · format saved for next time" : ""}`);
  };

  const sel = "w-full border border-line rounded-lg px-2.5 py-2 text-sm bg-white";
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Add a bank">
      <div className="card w-full max-w-4xl max-h-[92vh] overflow-auto bg-panel">
        <div className="flex items-start gap-3 p-5 border-b border-line">
          <div className="flex-1">
            <div className="eyebrow mb-1">Add a bank</div>
            <h2 className="text-xl font-semibold tracking-tight">We don&apos;t know this statement yet — let&apos;s teach Ledger</h2>
            <p className="text-sm text-muted mt-1">
              <b>{file.name}</b> was read on your server only. Check the detected columns and the preview below;
              Ledger remembers this layout so next time it imports automatically.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-muted hover:bg-line/50" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          {loading && !a && <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> Reading your statement…</div>}
          {err && <div className="text-sm text-outflow flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {err}</div>}

          {a && config && (<>
            {a.warnings.map((w, i) => <div key={i} className="text-sm text-warn flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {w}</div>)}

            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <label className="block">
                <div className="eyebrow mb-1.5">Bank name *</div>
                <input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="e.g. HDFC Bank"
                  className={sel} />
              </label>
              <label className="block">
                <div className="eyebrow mb-1.5">Which of your accounts is this?</div>
                <select value={accountId} onChange={e => setAccountId(e.target.value)} className={sel}>
                  <option value="">Create a new account from this file</option>
                  {accounts.map(x => <option key={x.id} value={x.id}>{x.account_name}</option>)}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-1">
              <label className="block">
                <div className="eyebrow mb-1.5">Header row</div>
                <select value={config.header_row} onChange={e => update({ header_row: Number(e.target.value) })} className={sel}>
                  {a.grid_preview.map((r, i) => (
                    <option key={i} value={i}>Row {i + 1}: {r.filter(Boolean).slice(0, 4).join(" | ").slice(0, 48) || "(blank)"}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="eyebrow mb-1.5">Money in / out is shown as</div>
                <select value={config.amount_style} onChange={e => update({ amount_style: e.target.value as Config["amount_style"] })} className={sel}>
                  <option value="split">Separate debit and credit columns</option>
                  <option value="signed">One amount column (minus = money out)</option>
                  <option value="drcr">Amount + a Dr/Cr column</option>
                </select>
              </label>
              <label className="block">
                <div className="eyebrow mb-1.5">Dates are written</div>
                <select value={config.date_order} onChange={e => update({ date_order: e.target.value as Config["date_order"] })} className={sel}>
                  <option value="DMY">Day first (31/12/2026)</option>
                  <option value="MDY">Month first (12/31/2026)</option>
                  <option value="YMD">Year first (2026-12-31)</option>
                </select>
              </label>
            </div>
            {config.amount_style === "signed" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!config.invert_sign} onChange={e => update({ invert_sign: e.target.checked })} />
                Positive amounts are money <b>out</b> (common for credit-card exports)
              </label>
            )}

            <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-1">
              {FIELDS_BY_STYLE[config.amount_style].map(([k, label]) => (
                <label key={k} className="block">
                  <div className="eyebrow mb-1.5">{label}</div>
                  <select value={config.columns[k] ?? ""} onChange={e => setCol(k, e.target.value)} className={sel}>
                    <option value="">— none —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{colLetter(i)}: {h || "(blank)"}</option>)}
                  </select>
                </label>
              ))}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="eyebrow">Preview</div>
                {loading && <Loader2 size={13} className="animate-spin text-muted" />}
              </div>
              {a.errors.length > 0 ? (
                <div className="text-sm text-muted">{a.errors[0]}</div>
              ) : a.summary && (
                <>
                  <div className="text-sm mb-2">
                    <b>{a.summary.count}</b> transactions · {fmtDate(a.summary.first)} – {fmtDate(a.summary.last)} ·
                    in <b className="tnum">{inr(a.summary.credits)}</b> · out <b className="tnum">{inr(a.summary.debits)}</b>
                    <span className="text-muted"> — compare these totals with your statement.</span>
                  </div>
                  <div className="card overflow-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-xs text-muted border-b border-line">
                        <th className="p-2">Date</th><th className="p-2">Description</th>
                        <th className="p-2 text-right">Money out</th><th className="p-2 text-right">Money in</th><th className="p-2 text-right">Balance</th>
                      </tr></thead>
                      <tbody className="divide-y divide-line">
                        {a.preview.map((t, i) => (
                          <tr key={i}>
                            <td className="p-2 whitespace-nowrap">{fmtDate(t.txn_date)}</td>
                            <td className="p-2 max-w-[22rem] truncate" title={t.description}>{t.description}</td>
                            <td className="p-2 text-right tnum">{t.direction === "debit" ? inr(t.amount) : ""}</td>
                            <td className="p-2 text-right tnum">{t.direction === "credit" ? inr(t.amount) : ""}</td>
                            <td className="p-2 text-right tnum text-muted">{t.balance !== null ? inr(t.balance) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {a.summary.count > a.preview.length && <div className="text-xs text-muted mt-1">Showing the first {a.preview.length}.</div>}
                </>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              Remember this layout so future {name.trim() ? `${name.trim()} statements` : "statements"} import automatically
            </label>
          </>)}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-line">
          <button onClick={onClose} className="rounded-xl border border-line px-4 py-2.5 text-sm">Cancel</button>
          <button onClick={doImport} disabled={!ready || importing || loading}
            className="rounded-xl bg-ink text-paper px-4 py-2.5 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-40">
            {importing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {importing ? "Importing…" : `Import ${a?.summary?.count ?? ""} transactions`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
