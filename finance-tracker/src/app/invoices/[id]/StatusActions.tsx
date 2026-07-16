"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

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

  const actions = NEXT[status] ?? [];
  if (!actions.length) return null;
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
    </div>
  );
}
