"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { inr, monthLabel, finYearMonths } from "@/lib/format";
import { Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

const BUCKETS = [
  { key: "living",  label: "Living",  hint: "rent, utilities, help, food" },
  { key: "leisure", label: "Leisure", hint: "travel, events, gifts" },
  { key: "saving",  label: "Saving",  hint: "savings, investment, insurance" },
  { key: "other",   label: "Other",   hint: "purchases, misc" },
];

export default function ExpenseManager({ month, expenses }: any) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const months = finYearMonths();
  const idx = months.indexOf(month);
  const go = (m: string) => router.push(`/expenses?m=${m}`);

  const [bucket, setBucket] = useState("living");
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState(0);

  const total = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
  const byBucket = (b: string) => expenses.filter((e: any) => e.bucket === b);
  const bucketTotal = (b: string) => byBucket(b).reduce((s: number, e: any) => s + Number(e.amount), 0);

  const add = async () => {
    if (!amount) return;
    const { data: { user } } = await sb.auth.getUser();
    await sb.from("expenses").insert({ owner_id: user!.id, month, bucket, description: desc, amount });
    setDesc(""); setAmount(0); router.refresh();
  };
  const remove = async (id: string) => { await sb.from("expenses").delete().eq("id", id); router.refresh(); };

  return (
    <>
      <header className="flex items-end justify-between mb-6">
        <div>
          <div className="eyebrow mb-1">Expenses · {inr(total)}</div>
          <h1 className="text-3xl font-semibold tracking-tight">{monthLabel(month)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button disabled={idx <= 0} onClick={() => go(months[idx - 1])} className="p-2 rounded-lg border border-line disabled:opacity-30"><ChevronLeft size={16} /></button>
          <button disabled={idx >= 11} onClick={() => go(months[idx + 1])} className="p-2 rounded-lg border border-line disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      </header>

      <div className="card p-4 mb-6 grid grid-cols-[140px_1fr_140px_auto] gap-2 items-center max-sm:grid-cols-1">
        <select value={bucket} onChange={e => setBucket(e.target.value)} className="einp">
          {BUCKETS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
        <input placeholder="What was it?" value={desc} onChange={e => setDesc(e.target.value)} className="einp" />
        <input type="number" placeholder="Amount" value={amount} onChange={e => setAmount(+e.target.value)} className="einp tnum" />
        <button onClick={add} className="rounded-lg bg-ink text-paper px-4 py-2 text-sm inline-flex items-center gap-1.5"><Plus size={15} /> Add</button>
      </div>

      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        {BUCKETS.map(b => (
          <div key={b.key} className="card p-5">
            <div className="flex items-baseline justify-between mb-3">
              <div><div className="font-medium">{b.label}</div><div className="text-xs text-muted">{b.hint}</div></div>
              <div className="tnum text-outflow">{inr(bucketTotal(b.key))}</div>
            </div>
            <div className="space-y-1.5">
              {byBucket(b.key).length === 0 && <div className="text-xs text-muted">Nothing yet.</div>}
              {byBucket(b.key).map((e: any) => (
                <div key={e.id} className="flex items-center gap-2 text-sm group">
                  <span className="flex-1 truncate">{e.description || "—"}</span>
                  <span className="tnum">{inr(e.amount)}</span>
                  <button onClick={() => remove(e.id)} className="text-muted opacity-0 group-hover:opacity-100 hover:text-outflow"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <style>{`.einp{width:100%;border:1px solid #E7E3DA;border-radius:10px;padding:8px 10px;font-size:14px;background:#fff}`}</style>
    </>
  );
}
