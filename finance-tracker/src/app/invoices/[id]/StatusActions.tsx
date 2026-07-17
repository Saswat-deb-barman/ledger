"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Trash2 } from "lucide-react";

const NEXT: Record<string, { to: string; label: string }[]> = {
  draft:   [{ to: "sent", label: "Mark as sent" }],
  sent:    [{ to: "paid", label: "Mark as paid" }, { to: "cancelled", label: "Cancel" }],
  overdue: [{ to: "paid", label: "Mark as paid" }],
  paid:    [],
  cancelled: [],
};

export default function StatusActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const update = async (to: string) => {
    setBusy(true);
    const patch: any = { status: to };
    if (to === "paid") patch.paid_date = new Date().toISOString().slice(0, 10);
    await supabaseBrowser().from("invoices").update(patch).eq("id", id);
    setBusy(false);
    router.refresh();
  };

  // Draft only — the API route enforces this too, since a sent/paid invoice
  // has already left a permanent, possibly client-visible number behind it.
  const remove = async () => {
    if (!confirm("Delete this draft invoice? This can't be undone.")) return;
    setBusy(true);
    const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.error) { setBusy(false); alert(json.error); return; }
    router.push("/invoices");
  };

  const actions = NEXT[status] ?? [];
  return (
    <div className="flex gap-2">
      {actions.map(a => (
        <button key={a.to} onClick={() => update(a.to)} disabled={busy}
          className={`rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-50 ${
            a.to === "paid" ? "bg-income text-white"
            : a.to === "cancelled" ? "border border-line text-muted"
            : "bg-ink text-paper"}`}>
          {a.label}
        </button>
      ))}
      {status === "draft" && (
        <button onClick={remove} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line text-outflow px-3 py-2 text-sm font-medium disabled:opacity-50 hover:border-outflow/40">
          <Trash2 size={15} /> Delete
        </button>
      )}
    </div>
  );
}
