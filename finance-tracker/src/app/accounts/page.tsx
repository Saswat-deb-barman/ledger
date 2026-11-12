import Shell from "@/components/Shell";
import { supabaseServer } from "@/lib/supabase-server";
import BankAccountManager from "./BankAccountManager";

export const dynamic = "force-dynamic";

export default async function Accounts() {
  const supabase = await supabaseServer();
  const { data: accounts } = await supabase.from("bank_accounts").select("*").order("created_at");
  return (
    <Shell>
      <header className="mb-8">
        <div className="eyebrow mb-1">Where the money lands</div>
        <h1 className="text-3xl font-semibold tracking-tight">Bank accounts</h1>
      </header>
      <BankAccountManager accounts={accounts ?? []} />
    </Shell>
  );
}
