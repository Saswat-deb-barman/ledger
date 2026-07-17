"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Plus, Star } from "lucide-react";

const EMPTY = { account_name: "", bank_name: "", account_holder: "", account_number: "", ifsc: "", branch: "", upi: "", notes: "" };

export default function BankAccountManager({ accounts }: any) {
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const [open, setOpen] = useState(false);

  const create = async () => {
    if (!f.account_name) { alert("Account name is required."); return; }
    const { data: { user } } = await supabaseBrowser().auth.getUser();
    const is_default = accounts.length === 0; // first account added becomes default automatically
    const { error } = await supabaseBrowser().from("bank_accounts").insert({ owner_id: user!.id, is_default, ...f });
    if (error) { alert(error.message); return; }
    setF(EMPTY); setOpen(false); router.refresh();
  };
  const makeDefault = async (id: string) => {
    const sb = supabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    await sb.from("bank_accounts").update({ is_default: false }).eq("owner_id", user!.id).eq("is_default", true);
    await sb.from("bank_accounts").update({ is_default: true }).eq("id", id);
    router.refresh();
  };
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  return (
    <>
      <button onClick={() => setOpen(!open)}
        className="mb-4 inline-flex items-center gap-1.5 rounded-xl bg-ink text-paper px-4 py-2.5 text-sm font-medium">
        <Plus size={15} /> New bank account
      </button>

      {open && (
        <div className="card p-5 mb-6 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
          <In label="Account name *" v={f.account_name} on={(v: string) => set("account_name", v)} ph="HDFC - Primary" />
          <In label="Bank name" v={f.bank_name} on={(v: string) => set("bank_name", v)} ph="HDFC Bank" />
          <In label="Account holder" v={f.account_holder} on={(v: string) => set("account_holder", v)} ph="Your full name" />
          <In label="Account number" v={f.account_number} on={(v: string) => set("account_number", v)} />
          <In label="IFSC" v={f.ifsc} on={(v: string) => set("ifsc", v.toUpperCase())} />
          <In label="Branch" v={f.branch} on={(v: string) => set("branch", v)} />
          <In label="UPI ID" v={f.upi} on={(v: string) => set("upi", v)} />
          <In label="Notes" v={f.notes} on={(v: string) => set("notes", v)} />
          <button onClick={create} className="rounded-xl bg-income text-white px-4 py-2.5 text-sm w-fit">Save account</button>
        </div>
      )}

      <div className="card divide-y divide-line">
        {accounts.length === 0 && <div className="p-6 text-center text-muted text-sm">No bank accounts yet.</div>}
        {accounts.map((a: any) => (
          <div key={a.id} className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-xl bg-ink/5 grid place-items-center tnum text-[10px] font-medium text-center leading-tight">
              {(a.bank_name || a.account_name).slice(0, 4).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="font-medium flex items-center gap-1.5">
                {a.account_name}
                {a.is_default && <Star size={13} className="fill-warn text-warn" />}
              </div>
              <div className="text-xs text-muted">
                {[a.bank_name, a.account_number && `A/C ${a.account_number}`, a.ifsc].filter(Boolean).join(" · ") || "No details"}
              </div>
            </div>
            {!a.is_default && (
              <button onClick={() => makeDefault(a.id)} className="text-xs text-accent">Make default</button>
            )}
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
