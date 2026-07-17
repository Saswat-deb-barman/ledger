"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { inr, fmtDate, monthLabel } from "@/lib/format";
import { Upload, Check, X, Undo2 } from "lucide-react";

type BankAccount = { id: string; account_name: string; is_default: boolean };
type Txn = {
  id: string; txn_date: string; description: string; amount: number;
  direction: "credit" | "debit"; status: "unmatched" | "matched" | "ignored";
  matched_income_entry_id: string | null;
};
type PendingEntry = any;

export default function ReconciliationManager({
  bankAccounts, transactions, pendingEntries,
}: { bankAccounts: BankAccount[]; transactions: Txn[]; pendingEntries: PendingEntry[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [bankAccountId, setBankAccountId] = useState(
    () => bankAccounts.find(a => a.is_default)?.id ?? bankAccounts[0]?.id ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { alert("Choose a CSV file first."); return; }
    setUploading(true); setUploadMsg(null);
    const form = new FormData();
    form.append("file", file);
    if (bankAccountId) form.append("bank_account_id", bankAccountId);
    const res = await fetch("/api/bank-import", { method: "POST", body: form });
    const json = await res.json();
    setUploading(false);
    if (json.error) { setUploadMsg(`Error: ${json.error}`); return; }
    setUploadMsg(`Imported ${json.count} transactions (${json.credits} credits, ${json.debits} debits).`);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  };

  const unmatchedCredits = transactions.filter(t => t.direction === "credit" && t.status === "unmatched");
  const unmatchedDebits = transactions.filter(t => t.direction === "debit" && t.status === "unmatched");
  const resolved = transactions.filter(t => t.status !== "unmatched");

  return (
    <div className="space-y-8">
      <section className="card p-5">
        <div className="eyebrow mb-3">Import a statement</div>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="block">
            <div className="eyebrow mb-1.5">Bank account</div>
            <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)}
              className="border border-line rounded-[10px] px-2.5 py-2 text-sm bg-white w-56">
              <option value="">— unspecified —</option>
              {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
            </select>
          </label>
          <label className="block">
            <div className="eyebrow mb-1.5">CSV file</div>
            <input ref={fileRef} type="file" accept=".csv"
              className="text-sm border border-line rounded-[10px] px-2.5 py-2 bg-white" />
          </label>
          <button onClick={upload} disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-ink text-paper px-4 py-2.5 text-sm font-medium disabled:opacity-50">
            <Upload size={15} /> {uploading ? "Importing…" : "Import"}
          </button>
        </div>
        {uploadMsg && <div className="text-sm text-muted mt-3">{uploadMsg}</div>}
        {bankAccounts.length === 0 && (
          <div className="text-xs text-muted mt-3">
            No bank accounts yet — add one on the Bank accounts page to tag imports by account (optional).
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">
          Unmatched credits <span className="text-muted text-sm font-normal">({unmatchedCredits.length})</span>
        </h2>
        <div className="card divide-y divide-line">
          {unmatchedCredits.length === 0 && (
            <div className="p-6 text-center text-sm text-muted">
              {transactions.length === 0 ? "Import a statement to get started." : "Nothing unmatched — you're caught up."}
            </div>
          )}
          {unmatchedCredits.map(t => (
            <CreditRow key={t.id} txn={t} pendingEntries={pendingEntries} onDone={() => router.refresh()} />
          ))}
        </div>
      </section>

      {unmatchedDebits.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">
            Debits <span className="text-muted text-sm font-normal">({unmatchedDebits.length}) — not yet reconciled</span>
          </h2>
          <div className="card divide-y divide-line">
            {unmatchedDebits.map(t => (
              <div key={t.id} className="flex items-center gap-4 p-3.5">
                <div className="w-24 text-sm text-muted">{fmtDate(t.txn_date)}</div>
                <div className="flex-1 text-sm truncate">{t.description || "—"}</div>
                <div className="tnum text-sm text-outflow w-28 text-right">{inr(t.amount)}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-2">
            Expense matching lands with the Free Cash Flow classification phase — these are captured now so nothing gets lost.
          </p>
        </section>
      )}

      {resolved.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">
            Resolved <span className="text-muted text-sm font-normal">({resolved.length})</span>
          </h2>
          <div className="card divide-y divide-line">
            {resolved.map(t => (
              <div key={t.id} className="flex items-center gap-4 p-3.5">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  t.status === "matched" ? "bg-income/10 text-income" : "bg-line text-muted"}`}>
                  {t.status}
                </span>
                <div className="w-24 text-sm text-muted">{fmtDate(t.txn_date)}</div>
                <div className="flex-1 text-sm truncate">{t.description || "—"}</div>
                <div className={`tnum text-sm w-28 text-right ${t.direction === "credit" ? "text-income" : "text-outflow"}`}>
                  {inr(t.amount)}
                </div>
                {t.status === "matched" && (
                  <UndoButton txnId={t.id} onDone={() => router.refresh()} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function scoreMatch(txn: Txn, entry: PendingEntry): number {
  const amountDiff = Math.abs(entry.expected - txn.amount);
  const dateDiff = Math.abs(new Date(txn.txn_date).getTime() - new Date(entry.month).getTime()) / 86400000;
  // Amount closeness dominates; date proximity (days) as tiebreaker, capped so
  // it can't outweigh a large amount mismatch.
  return amountDiff * 10 + Math.min(dateDiff, 60);
}

function CreditRow({ txn, pendingEntries, onDone }: { txn: Txn; pendingEntries: PendingEntry[]; onDone: () => void }) {
  const ranked = useMemo(
    () => [...pendingEntries].sort((a, b) => scoreMatch(txn, a) - scoreMatch(txn, b)),
    [txn, pendingEntries]);
  const best = ranked[0];
  const [selected, setSelected] = useState(best?.id ?? "");
  const [busy, setBusy] = useState(false);

  // A candidate this row was pointing at can disappear from `ranked` (e.g.
  // another row just matched it) — a stale `selected` value that's no longer
  // a valid <option> makes the <select> silently fall back to unselected.
  // Re-pick the best remaining candidate whenever the ranked list changes.
  useEffect(() => {
    if (selected && !ranked.some(e => e.id === selected)) setSelected(best?.id ?? "");
  }, [ranked]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (e: PendingEntry) => {
    const who = e.income_sources?.clients?.name ?? e.income_sources?.name ?? e.label ?? "—";
    return `${who} · ${monthLabel(e.month)} · ${inr(e.expected)}`;
  };

  const confirm = async () => {
    if (!selected) return;
    setBusy(true);
    const res = await fetch("/api/bank-import/match", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction_id: txn.id, income_entry_id: selected }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.error) { alert(json.error); return; }
    onDone();
  };
  const ignore = async () => {
    setBusy(true);
    await fetch("/api/bank-import/match", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction_id: txn.id, action: "ignore" }),
    });
    setBusy(false);
    onDone();
  };

  const exactMatch = best && Math.abs(best.expected - txn.amount) < 1;

  return (
    <div className="flex items-center gap-3 p-3.5 flex-wrap">
      <div className="w-24 text-sm text-muted">{fmtDate(txn.txn_date)}</div>
      <div className="flex-1 min-w-[160px] text-sm truncate" title={txn.description}>{txn.description || "—"}</div>
      <div className="tnum text-sm text-income w-28 text-right">{inr(txn.amount)}</div>

      <select value={selected} onChange={e => setSelected(e.target.value)}
        className="border border-line rounded-lg px-2 py-1.5 text-sm bg-white flex-1 min-w-[220px]">
        <option value="">— no match —</option>
        {ranked.map(e => <option key={e.id} value={e.id}>{label(e)}</option>)}
      </select>
      {exactMatch && selected === best.id && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-income/10 text-income">exact amount</span>
      )}

      <button onClick={confirm} disabled={busy || !selected}
        className="inline-flex items-center gap-1 rounded-lg bg-income text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50">
        <Check size={13} /> Confirm
      </button>
      <button onClick={ignore} disabled={busy}
        className="inline-flex items-center gap-1 rounded-lg border border-line text-muted px-3 py-1.5 text-xs disabled:opacity-50">
        <X size={13} /> Ignore
      </button>
    </div>
  );
}

function UndoButton({ txnId, onDone }: { txnId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const undo = async () => {
    setBusy(true);
    await fetch("/api/bank-import/match", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction_id: txnId, action: "unmatch" }),
    });
    setBusy(false);
    onDone();
  };
  return (
    <button onClick={undo} disabled={busy} className="text-xs text-muted hover:text-ink inline-flex items-center gap-1">
      <Undo2 size={13} /> Undo
    </button>
  );
}
