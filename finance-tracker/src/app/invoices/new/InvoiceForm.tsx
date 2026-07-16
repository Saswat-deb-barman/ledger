"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { inr } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";

type Item = { description: string; quantity: number; rate: number };
type Client = { id: string; name: string; invoice_prefix: string };
type Project = { id: string; name: string; client_id: string | null };

export default function InvoiceForm({
  clients, projects, myProfile,
}: { clients: Client[]; projects: Project[]; myProfile: any }) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string>("");     // "" = Personal
  const [projectId, setProjectId] = useState<string>("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState(0);
  const [items, setItems] = useState<Item[]>([{ description: "", quantity: 1, rate: 0 }]);
  const [saving, setSaving] = useState(false);

  // Personal invoices use your initials; client invoices use client prefix.
  const prefix = clientId
    ? clients.find(c => c.id === clientId)?.invoice_prefix ?? "INV"
    : "INV";

  const visibleProjects = projects.filter(p =>
    clientId ? p.client_id === clientId : p.client_id === null);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + it.quantity * it.rate, 0), [items]);
  const total = Math.max(subtotal - discount, 0);

  const setItem = (i: number, patch: Partial<Item>) =>
    setItems(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const submit = async () => {
    setSaving(true);
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId || null,
        project_id: projectId || null,
        prefix,
        issue_date: issueDate,
        due_date: dueDate || null,
        discount,
        items,
        billed_by: {
          name: myProfile?.full_name, email: myProfile?.email,
          phone: myProfile?.phone, pan: myProfile?.pan, address: myProfile?.address,
        },
        bank_details: myProfile?.default_bank ?? null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.id) router.push(`/invoices/${json.id}`);
    else alert(json.error ?? "Could not create invoice");
  };

  return (
    <div className="grid grid-cols-[1fr_320px] gap-6 max-lg:grid-cols-1">
      <div className="space-y-5">
        <div className="card p-5 grid grid-cols-2 gap-4 max-sm:grid-cols-1">
          <Field label="Client / context">
            <select value={clientId} onChange={e => { setClientId(e.target.value); setProjectId(""); }}
              className="input">
              <option value="">Personal</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Project">
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="input">
              <option value="">— none —</option>
              {visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Issue date">
            <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="input" />
          </Field>
          <Field label="Due date">
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input" />
          </Field>
        </div>

        {/* line items */}
        <div className="card p-5">
          <div className="eyebrow mb-3">Line items</div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_100px_100px_32px] gap-2 items-center">
                <input placeholder="Description" value={it.description}
                  onChange={e => setItem(i, { description: e.target.value })} className="input" />
                <input type="number" value={it.quantity}
                  onChange={e => setItem(i, { quantity: +e.target.value })} className="input tnum" />
                <input type="number" value={it.rate} placeholder="Rate"
                  onChange={e => setItem(i, { rate: +e.target.value })} className="input tnum" />
                <div className="tnum text-sm text-right">{inr(it.quantity * it.rate)}</div>
                <button onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                  className="text-muted hover:text-outflow"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => setItems([...items, { description: "", quantity: 1, rate: 0 }])}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent">
            <Plus size={15} /> Add line
          </button>
        </div>
      </div>

      {/* summary rail */}
      <aside className="space-y-4">
        <div className="card p-5 sticky top-6">
          <div className="eyebrow mb-1">Invoice number</div>
          <div className="tnum text-lg mb-4">{prefix}/…/next</div>
          <div className="hairline my-3" />
          <SummaryRow label="Subtotal" value={inr(subtotal)} />
          <label className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-muted">Discount</span>
            <input type="number" value={discount} onChange={e => setDiscount(+e.target.value)}
              className="input tnum w-24 text-right" />
          </label>
          <div className="hairline my-2" />
          <SummaryRow label="Total" value={inr(total)} strong />
          <button onClick={submit} disabled={saving}
            className="mt-5 w-full rounded-xl bg-ink text-paper py-2.5 text-sm font-medium disabled:opacity-50">
            {saving ? "Creating…" : "Create invoice"}
          </button>
          <p className="text-xs text-muted mt-3">
            Saved as a draft. You can mark it sent or paid from the invoice page.
          </p>
        </div>
      </aside>

      <style>{`
        .input { width:100%; border:1px solid #E7E3DA; border-radius:10px;
          padding:8px 10px; font-size:14px; background:#fff; }
        .input:focus { outline:2px solid #3D5AFE33; border-color:#3D5AFE; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <label className="block">
      <div className="eyebrow mb-1.5">{label}</div>
      {children}
    </label>
  );
}
function SummaryRow({ label, value, strong }: any) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={`text-sm ${strong ? "font-medium" : "text-muted"}`}>{label}</span>
      <span className={`tnum text-sm ${strong ? "font-semibold text-lg" : ""}`}>{value}</span>
    </div>
  );
}
