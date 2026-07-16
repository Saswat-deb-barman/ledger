import Shell from "@/components/Shell";
import { supabaseServer } from "@/lib/supabase-server";
import { monthKey } from "@/lib/format";
import ExpenseManager from "./ExpenseManager";

export const dynamic = "force-dynamic";

export default async function ExpensesPage({ searchParams }: { searchParams: { m?: string } }) {
  const supabase = supabaseServer();
  const month = searchParams.m ?? monthKey();
  const { data: expenses } = await supabase
    .from("expenses").select("*").eq("month", month).order("bucket").order("created_at");
  return (
    <Shell>
      <ExpenseManager month={month} expenses={expenses ?? []} />
    </Shell>
  );
}
