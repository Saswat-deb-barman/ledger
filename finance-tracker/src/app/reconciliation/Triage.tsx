"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { inr, fmtDate } from "@/lib/format";
import { Upload, ChevronDown, ChevronRight, Tag, Check, X } from "lucide-react";

const TIER_LABEL: Record<string,string> = { small: "Small (<₹2k)", medium: "Medium (₹2k–25k)", large: "Large (>₹25k)" };

export default function Triage({ triage, merchants, imports, rules, bigTxns }: any) {
  const router = useRouter();
  const [tab, setTab] = useState<"triage" | "merchants" | "history">("triage");
  const [dir, setDir] = useState<"debit" | "credit">("debit");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const t = (tier: string, d: string) =>
    triage.find((x: any) => x.tier === tier && x.direction === d) ?? { n: 0, total: 0 };

  const upload = async (file: File) => {
    setUploading(true); setMsg("");
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/statements/upload", { method: "POST", body: fd });
    const j = await res.json();
    setUploading(false);
    setMsg(res.ok
      ? `${j.bank} · ${j.inserted} new, ${j.duplicates} duplicates skipped`
      : `Error: ${j.error}`);
    router.refresh();
  };

  return (
    <>
      <header className="flex items-end justify-between mb-6">
        <div>
          <div className="eyebrow mb-1">Segregation · pre-reconciliation</div>
          <h1 className="text-3xl font-semibold tracking-tight">Reconciliation</h1>
        </div>
        <label className="rounded-xl bg-ink text-paper px-4 py-2.5 text-sm font-medium cursor-pointer inline-flex items-center gap-2">
          <Upload size={15} /> {uploading ? "Parsing…" : "Upload statement"}
          <input type="file" accept=".xls,.csv,.CSV" className="hidden"
            onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </header>
      {msg && <div className="card p-3 mb-4 text-sm">{msg}</div>}

      <div className="flex gap-1 mb-6 border-b border-line">
        {(["triage", "merchants", "history"] as const).map(x => (
          <button key={x} onClick={() => setTab(x)}
            className={`px-4 py-2 text-sm capitalize border-b-2 -mb-px transition ${
              tab === x ? "border-ink font-medium" : "border-transparent text-muted"}`}>
            {x === "merchants" ? "Where money goes" : x === "history" ? "Upload history" : "Triage"}
          </button>
        ))}
      </div>

      {tab === "triage" && (
        <>
          <div className="inline-flex card p-1 rounded-xl mb-5">
            {(["debit", "credit"] as const).map(d => (
              <button key={d} onClick={() => setDir(d)}
                className={`px-4 py-1.5 rounded-lg text-sm transition ${
                  dir === d ? "bg-ink text-paper" : "text-muted"}`}>
                {d === "debit" ? "Money out" : "Money in"}
              </button>
            ))}
          </div>

          <TierBlock tier="large"  data={t("large", dir)}  dir={dir} txns={bigTxns} rules={rules} defaultOpen />
          <TierBlock tier="medium" data={t("medium", dir)} dir={dir} txns={bigTxns} rules={rules} />
          <SmallSummary data={t("small", dir)} dir={dir} />
        </>
      )}

      {tab === "merchants" && <Merchants merchants={merchants} dir={dir} setDir={setDir} rules={rules} onRule={() => router.refresh()} />}
      {tab === "history" && <History imports={imports} />}
    </>
  );
}

function TierBlock({ tier, data, dir, txns, rules, defaultOpen }: any) {
  const [open, setOpen] = useState(!!defaultOpen);
  const rows = txns.filter((x: any) => x.tier === tier && x.direction === dir);
  return (
    <div className="card mb-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-4">
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="font-medium">{TIER_LABEL[tier]}</span>
        <span className="text-xs text-muted">{data.n} txns</span>
        <span className={`tnum ml-auto ${dir === "credit" ? "text-income" : "text-outflow"}`}>{inr(data.total)}</span>
      </button>
      {open && rows.length > 0 && (
        <div className="divide-y divide-line border-t border-line">
          {rows.map((x: any) => (
            <div key={x.id} className="flex items-center gap-3 p-3.5">
              <div className="w-16 text-xs text-muted">{fmtDate(x.txn_date)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{x.merchant}</div>
                <div className="text-xs text-muted truncate">{x.description}</div>
              </div>
              {x.tag && <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent">{x.tag}</span>}
              <div className={`tnum text-sm w-24 text-right ${dir === "credit" ? "text-income" : "text-outflow"}`}>{inr(x.amount)}</div>
            </div>
          ))}
        </div>
      )}
      {open && rows.length === 0 && <div className="p-4 text-sm text-muted border-t border-line">Nothing in this tier.</div>}
    </div>
  );
}

function SmallSummary({ data, dir }: any) {
  return (
    <div className="card p-4 bg-line/20 flex items-center gap-3">
      <span className="font-medium">{TIER_LABEL.small}</span>
      <span className="text-xs text-muted">{data.n} txns · collapsed (the noise)</span>
      <span className={`tnum ml-auto ${dir === "credit" ? "text-income" : "text-outflow"}`}>{inr(data.total)}</span>
    </div>
  );
}

function Merchants({ merchants, dir, setDir, rules, onRule }: any) {
  const rows = merchants.filter((m: any) => m.direction === dir);
  const tagged = new Set(rules.map((r: any) => r.keyword.toUpperCase()));
  const addRule = async (keyword: string, tag: string) => {
    const sb = supabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    await sb.from("tag_rules").upsert({ owner_id: user!.id, keyword, tag }, { onConflict: "owner_id,keyword" });
    // Apply retroactively to already-imported rows from this merchant too —
    // matches what the caption below promises ("this and every future import").
    await sb.from("bank_txns").update({ tag }).eq("owner_id", user!.id).eq("merchant", keyword);
    onRule();
  };
  return (
    <>
      <div className="inline-flex card p-1 rounded-xl mb-5">
        {(["debit","credit"] as const).map(d => (
          <button key={d} onClick={() => setDir(d)}
            className={`px-4 py-1.5 rounded-lg text-sm ${dir===d?"bg-ink text-paper":"text-muted"}`}>
            {d==="debit"?"Money out":"Money in"}
          </button>
        ))}
      </div>
      <div className="card divide-y divide-line">
        {rows.map((m: any) => (
          <div key={m.merchant} className="flex items-center gap-3 p-3.5">
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{m.merchant}</div>
              <div className="text-xs text-muted">{m.n} txns{m.tag && ` · tagged ${m.tag}`}</div>
            </div>
            {!m.tag && !tagged.has(m.merchant?.toUpperCase()) && (
              <div className="flex gap-1">
                {["income","living","leisure","saving"].map(tg => (
                  <button key={tg} onClick={() => addRule(m.merchant, tg)}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-line hover:border-accent hover:text-accent">
                    {tg}
                  </button>
                ))}
              </div>
            )}
            <div className={`tnum text-sm w-28 text-right ${dir==="credit"?"text-income":"text-outflow"}`}>{inr(m.total)}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted mt-3">Tap a tag to create a rule — it auto-applies to this and every future import.</p>
    </>
  );
}

function History({ imports }: any) {
  return (
    <div className="card divide-y divide-line">
      {imports.length === 0 && <div className="p-6 text-center text-sm text-muted">No statements uploaded yet.</div>}
      {imports.map((im: any) => (
        <div key={im.id} className="flex items-center gap-4 p-4">
          <div className="flex-1">
            <div className="text-sm font-medium">{im.bank_accounts?.account_name ?? im.bank} · {im.file_name}</div>
            <div className="text-xs text-muted">
              {fmtDate(im.period_from)} – {fmtDate(im.period_to)} · uploaded {fmtDate(im.uploaded_at)}
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="tnum">{im.row_count} rows</div>
            {im.duplicate_count > 0 && <div className="text-warn">{im.duplicate_count} dupes skipped</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
