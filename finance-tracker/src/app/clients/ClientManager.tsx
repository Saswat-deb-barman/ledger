"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Plus } from "lucide-react";

export default function ClientManager({ clients }: any) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", invoice_prefix: "", gstin: "", pan: "", email: "", phone: "", billing_address: "" });
  const [open, setOpen] = useState(false);

  const create = async () => {
    if (!f.name || !f.invoice_prefix) { alert("Name and invoice prefix are required."); return; }
    const { data: { user } } = await supabaseBrowser().auth.getUser();
    const { error } = await supabaseBrowser().from("clients").insert({ owner_id: user!.id, ...f });
    if (error) { alert(error.message); return; }
    setF({ name: "", invoice_prefix: "", gstin: "", pan: "", email: "", phone: "", billing_address: "" });
    setOpen(false); router.refresh();
  };
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  return (
    <>
      <button onClick={() => setOpen(!open)}
        className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-ink text-paper px-4 py-2.5 text-sm font-medium">
        <Plus size={15} /> New client
      </button>

      {open && (
        <div className="card p-5 mb-6 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <In label="Name *" v={f.name} on={(v: string)=>set("name",v)} ph="Acme Studios" />
          <In label="Invoice prefix *" v={f.invoice_prefix} on={(v: string)=>set("invoice_prefix",v.toUpperCase())} ph="ACME" />
          <In label="GSTIN" v={f.gstin} on={(v: string)=>set("gstin",v)} ph="22AAAAA0000A1Z5" />
          <In label="PAN" v={f.pan} on={(v: string)=>set("pan",v)} />
          <In label="Email" v={f.email} on={(v: string)=>set("email",v)} />
          <In label="Phone" v={f.phone} on={(v: string)=>set("phone",v)} />
          <div className="col-span-2 max-sm:col-span-1">
            <In label="Billing address" v={f.billing_address} on={(v: string)=>set("billing_address",v)} />
          </div>
          <button onClick={create} className="rounded-xl bg-income text-white px-4 py-2.5 text-sm w-fit">Save client</button>
        </div>
      )}

      <div className="card divide-y divide-line">
        {clients.length === 0 && <div className="p-6 text-center text-muted text-sm">No clients yet.</div>}
        {clients.map((c: any) => (
          <div key={c.id} className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-xl bg-ink/5 grid place-items-center tnum text-sm font-medium">
              {c.invoice_prefix}
            </div>
            <div className="flex-1">
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-muted">
                {[c.gstin && `GSTIN ${c.gstin}`, c.email].filter(Boolean).join(" · ") || "No tax details"}
              </div>
            </div>
            <div className="text-xs text-muted">Series {c.invoice_prefix}/…</div>
          </div>
        ))}
      </div>
    </>
  );
}

function In({ label, v, on, ph }: any) {
  return (
    <label className="block">
      <div className="eyebrow mb-1.5">{label}</div>
      <input value={v} onChange={e => on(e.target.value)} placeholder={ph}
        className="w-full border border-line rounded-[10px] px-2.5 py-2 text-sm bg-white" />
    </label>
  );
}
