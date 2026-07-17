import Shell from "@/components/Shell";
import { supabaseServer } from "@/lib/supabase-server";
import ReconciliationManager from "./ReconciliationManager";

export const dynamic = "force-dynamic";

export default async function Reconciliation() {
  const supabase = supabaseServer();

  const [{ data: bankAccounts }, { data: transactions }, { data: pendingEntries }] = await Promise.all([
    supabase.from("bank_accounts").select("id, account_name, is_default").order("is_default", { ascending: false }),
    supabase.from("bank_transactions").select("*").order("txn_date", { ascending: false }).limit(300),
    supabase
      .from("income_entries")
      .select("id, month, label, expected, received, is_received, income_sources(name, client_id, clients(name))")
      .eq("is_received", false)
      .order("month"),
  ]);

  return (
    <Shell>
      <header className="mb-8">
        <div className="eyebrow mb-1">Match statement credits to expected income</div>
        <h1 className="text-3xl font-semibold tracking-tight">Reconcile</h1>
      </header>
      <ReconciliationManager
        bankAccounts={bankAccounts ?? []}
        transactions={transactions ?? []}
        pendingEntries={pendingEntries ?? []}
      />
    </Shell>
  );
}
