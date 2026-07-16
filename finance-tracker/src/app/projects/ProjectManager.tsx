"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { inr } from "@/lib/format";
import { Plus } from "lucide-react";

export default function ProjectManager({ projects, clients, billed }: any) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [agreed, setAgreed] = useState(0);

  const create = async () => {
    if (!name) return;
    const { data: { user } } = await supabaseBrowser().auth.getUser();
    await supabaseBrowser().from("projects").insert({
      owner_id: user!.id, name, client_id: clientId || null,
      agreed_value: agreed || null,
    });
    setName(""); setAgreed(0); setClientId(""); setAdding(false);
    router.refresh();
  };

  const STATUS = ["active", "on_hold", "completed", "archived"];
  const setStatus = async (id: string, status: string) => {
    await supabaseBrowser().from("projects").update({ status }).eq("id", id);
    router.refresh();
  };

  return (
    <>
      <button onClick={() => setAdding(!adding)}
        className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-ink text-paper px-4 py-2.5 text-sm font-medium">
        <Plus size={15} /> New project
      </button>

      {adding && (
        <div className="card p-5 mb-6 grid grid-cols-[1fr_180px_140px_auto] gap-3 items-end max-sm:grid-cols-1">
          <label className="block">
            <div className="eyebrow mb-1.5">Name</div>
            <input value={name} onChange={e => setName(e.target.value)} className="pinput" placeholder="e.g. BPL App" />
          </label>
          <label className="block">
            <div className="eyebrow mb-1.5">Client (or personal)</div>
            <select value={clientId} onChange={e => setClientId(e.target.value)} className="pinput">
              <option value="">Personal</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block">
            <div className="eyebrow mb-1.5">Agreed value</div>
            <input type="number" value={agreed} onChange={e => setAgreed(+e.target.value)} className="pinput tnum" />
          </label>
          <button onClick={create} className="rounded-xl bg-income text-white px-4 py-2.5 text-sm">Save</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        {projects.map((p: any) => {
          const done = billed[p.id] ?? 0;
          const pct = p.agreed_value ? Math.min(100, (done / Number(p.agreed_value)) * 100) : 0;
          return (
            <div key={p.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted">{p.clients?.name ?? "Personal"}</div>
                </div>
                <select value={p.status} onChange={e => setStatus(p.id, e.target.value)}
                  className="text-xs border border-line rounded-lg px-2 py-1 bg-paper">
                  {STATUS.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
              </div>
              {p.agreed_value ? (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>Billed {inr(done)}</span>
                    <span>of {inr(p.agreed_value)}</span>
                  </div>
                  <div className="h-1.5 bg-line rounded-full overflow-hidden">
                    <div className="h-full bg-income" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-xs text-muted">Billed so far: {inr(done)}</div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`.pinput{width:100%;border:1px solid #E7E3DA;border-radius:10px;padding:8px 10px;font-size:14px;background:#fff}`}</style>
    </>
  );
}
