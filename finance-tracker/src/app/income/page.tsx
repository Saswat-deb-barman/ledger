import Shell from "@/components/Shell";
import { supabaseServer } from "@/lib/supabase-server";
import { monthKey } from "@/lib/format";
import IncomeManager from "./IncomeManager";

export const dynamic = "force-dynamic";

export default async function IncomePage(props: { searchParams: Promise<{ m?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await supabaseServer();
  const month = searchParams.m ?? monthKey();

  // Make sure this month's retainer rows exist (auto-fill, non-destructive).
  await supabase.rpc("ensure_retainer_entries", { p_month: month });

  const [{ data: sources }, { data: entries }, { data: clients }] = await Promise.all([
    supabase.from("income_sources").select("*").order("kind").order("name"),
    supabase.from("income_entries")
      .select("*, income_sources(name, kind, client_id)")
      .eq("month", month).order("created_at"),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  return (
    <Shell>
      <IncomeManager
        month={month}
        sources={sources ?? []}
        entries={entries ?? []}
        clients={clients ?? []}
      />
    </Shell>
  );
}
