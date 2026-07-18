import Shell from "@/components/Shell";
import { supabaseServer } from "@/lib/supabase-server";
import Triage from "./Triage";

export const dynamic = "force-dynamic";

export default async function ReconciliationPage() {
  const supabase = supabaseServer();

  const [{ data: triage }, { data: merchants }, { data: imports }, { data: rules }, { data: txns }, { data: incomeEntries }] =
    await Promise.all([
      supabase.from("v_txn_triage").select("*"),
      supabase.from("v_merchant_rollup").select("*").order("total", { ascending: false }).limit(40),
      supabase.from("statement_imports").select("*, bank_accounts(account_name)").order("uploaded_at", { ascending: false }),
      supabase.from("tag_rules").select("*").order("created_at"),
      // pull medium+large rows for row-by-row triage; small stays summarized
      supabase.from("bank_txns").select("id, txn_date, description, merchant, amount, direction, tier, tag, matched_income_id")
        .in("tier", ["medium", "large"]).order("amount", { ascending: false }).limit(400),
      // candidates for the income-matching pass
      supabase.from("income_entries").select("id, month, expected, received, income_sources(name)")
        .order("month", { ascending: false }),
    ]);

  return (
    <Shell>
      <Triage
        triage={triage ?? []}
        merchants={merchants ?? []}
        imports={imports ?? []}
        rules={rules ?? []}
        bigTxns={txns ?? []}
        incomeEntries={incomeEntries ?? []}
      />
    </Shell>
  );
}
