"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { inr, monthLabel, finYearMonths, monthKey } from "@/lib/format";
import { Plus, Check, ChevronLeft, ChevronRight } from "lucide-react";

export default function IncomeManager({ month, sources, entries, clients }: any) {
  const router = useRouter();
  const sb = supabaseBrowser();
  const months = finYearMonths();
  const idx = months.indexOf(month);
  const go = (m: string) => router.push(`/income?m=${m}`);

  const retainers = entries.filter((e: any) => e.income_sources?.kind === "retainer");
  const projects  = entries.filter((e: any) => e.income_sources?.kind === "project");
  const expectedTotal = entries.reduce((s: number, e: any) => s + Number(e.expected), 0);
  const receivedTotal = entries.reduce((s: number, e: any) => s + Number(e.received), 0);

  // Override a single month's expected amount (entry wins over source default).
  const setExpected = async (id: string, v: number) => {
    await sb.from("income_entries").update({ expected: v }).eq("id", id);
    router.refresh();
  };
  const markReceived = async (e: any) => {
    const received = e.is_received ? 0 : Number(e.expected);
    await sb.from("income_entries")
      .update({ is_received: !e.is_received, received }).eq("id", e.id);
    router.refresh();
  };

  return (
    <>
      <header className="flex items-end justify-between mb-6">
        <div>
          <div className="eyebrow mb-1">Income</div>
          <h1 className="text-3xl font-semibold tracking-tight">{monthLabel(month)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button disabled={idx <= 0} onClick={() => go(months[idx - 1])}
            className="p-2 rounded-lg border border-line disabled:opacity-30"><ChevronLeft size={16} /></button>
          <button disabled={idx >= 11} onClick={() => go(months[idx + 1])}
            className="p-2 rounded-lg border border-line disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-4 mb-6 max-sm:grid-cols-1">
        <div className="card p-4"><div className="eyebrow">Expected</div>
          <div className="tnum text-xl mt-1">{inr(expectedTotal)}</div></div>
        <div className="card p-4"><div className="eyebrow">Received</div>
          <div className="tnum text-xl mt-1 text-income">{inr(receivedTotal)}</div></div>
        <div className="card p-4"><div className="eyebrow">Pending</div>
          <div className="tnum text-xl mt-1 text-warn">{inr(expectedTotal - receivedTotal)}</div></div>
      </div>

      <Section title="Retainers" hint="Recurring — auto-filled, override any month">
        {retainers.length === 0 && <Empty>No active retainers this month.</Empty>}
        {retainers.map((e: any) => (
          <Row key={e.id} e={e} onExpected={setExpected} onReceived={markReceived} />
        ))}
      </Section>

      <Section title="Projects & one-offs" hint="Added as they happen">
        {projects.length === 0 && <Empty>No project income logged for this month.</Empty>}
        {projects.map((e: any) => (
          <Row key={e.id} e={e} onExpected={setExpected} onReceived={markReceived} />
        ))}
        <AddProjectIncome month={month} sources={sources} onDone={() => router.refresh()} />
      </Section>

      <div className="mt-8">
        <AddSource clients={clients} onDone={() => router.refresh()} />
      </div>
    </>
  );
}

function Row({ e, onExpected, onReceived }: any) {
  const [val, setVal] = useState(Number(e.expected));
  return (
    <div className="flex items-center gap-3 p-3.5 border-t border-line first:border-t-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{e.income_sources?.name ?? e.label ?? "—"}</div>
        {e.label && <div className="text-xs text-muted">{e.label}</div>}
      </div>
      <input type="number" value={val}
        onChange={ev => setVal(+ev.target.value)}
        onBlur={() => val !== Number(e.expected) && onExpected(e.id, val)}
        className="tnum w-32 text-right border border-line rounded-lg px-2.5 py-1.5 text-sm bg-white" />
      <button onClick={() => onReceived(e)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
          e.is_received ? "bg-income text-white" : "border border-line text-muted hover:border-income/50"}`}>
        <Check size={13} /> {e.is_received ? "Received" : "Mark received"}
      </button>
    </div>
  );
}

function Section({ title, hint, children }: any) {
  return (
    <section className="mb-6">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-lg font-medium">{title}</h2>
        <span className="text-xs text-muted">{hint}</span>
      </div>
      <div className="card">{children}</div>
    </section>
  );
}
function Empty({ children }: any) {
  return <div className="p-5 text-center text-sm text-muted">{children}</div>;
}

function AddProjectIncome({ month, sources, onDone }: any) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);
  const projectSources = sources.filter((s: any) => s.kind === "project");
  const [sourceId, setSourceId] = useState("");

  const add = async () => {
    const sb = supabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    let sid = sourceId;
    if (!sid && name) {
      const { data } = await sb.from("income_sources")
        .insert({ owner_id: user!.id, name, kind: "project", default_amount: amount })
        .select("id").single();
      sid = data!.id;
    }
    await sb.from("income_entries").insert({
      owner_id: user!.id, source_id: sid || null, month,
      label: sid ? null : name, expected: amount,
    });
    setOpen(false); setName(""); setAmount(0); setSourceId(""); onDone();
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 p-3.5 border-t border-line text-sm text-accent w-full">
      <Plus size={15} /> Add project income
    </button>
  );
  return (
    <div className="p-3.5 border-t border-line grid grid-cols-[1fr_140px_auto] gap-2 items-center max-sm:grid-cols-1">
      {projectSources.length > 0 ? (
        <select value={sourceId} onChange={e => setSourceId(e.target.value)} className="inp">
          <option value="">— new project —</option>
          {projectSources.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      ) : <span />}
      {!sourceId && <input placeholder="Project name" value={name} onChange={e => setName(e.target.value)} className="inp" />}
      <input type="number" placeholder="Amount" value={amount} onChange={e => setAmount(+e.target.value)} className="inp tnum" />
      <button onClick={add} className="rounded-lg bg-income text-white px-4 py-2 text-sm">Add</button>
      <style>{`.inp{border:1px solid #E7E3DA;border-radius:10px;padding:8px 10px;font-size:14px;background:#fff}`}</style>
    </div>
  );
}

function AddSource({ clients, onDone }: any) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", kind: "retainer", default_amount: 0, client_id: "" });
  const add = async () => {
    if (!f.name) return;
    const sb = supabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    await sb.from("income_sources").insert({
      owner_id: user!.id, name: f.name, kind: f.kind,
      default_amount: f.default_amount, client_id: f.client_id || null,
      active_from: new Date().toISOString().slice(0, 10),
    });
    setF({ name: "", kind: "retainer", default_amount: 0, client_id: "" });
    setOpen(false); onDone();
  };
  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm hover:border-ink/30">
      <Plus size={15} /> New income source
    </button>
  );
  return (
    <div className="card p-5 grid grid-cols-[1fr_140px_140px_140px_auto] gap-3 items-end max-sm:grid-cols-1">
      <L label="Name"><input className="inp2" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Northwind" /></L>
      <L label="Type">
        <select className="inp2" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
          <option value="retainer">Retainer</option><option value="project">Project</option>
        </select>
      </L>
      <L label="Monthly default"><input type="number" className="inp2 tnum" value={f.default_amount} onChange={e => setF({ ...f, default_amount: +e.target.value })} /></L>
      <L label="Client">
        <select className="inp2" value={f.client_id} onChange={e => setF({ ...f, client_id: e.target.value })}>
          <option value="">—</option>
          {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </L>
      <button onClick={add} className="rounded-xl bg-ink text-paper px-4 py-2.5 text-sm">Save</button>
      <style>{`.inp2{width:100%;border:1px solid #E7E3DA;border-radius:10px;padding:8px 10px;font-size:14px;background:#fff}`}</style>
    </div>
  );
}
function L({ label, children }: any) {
  return <label className="block"><div className="eyebrow mb-1.5">{label}</div>{children}</label>;
}
