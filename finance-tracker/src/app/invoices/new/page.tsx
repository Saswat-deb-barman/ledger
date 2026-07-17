import Shell from "@/components/Shell";
import { supabaseServer } from "@/lib/supabase-server";
import InvoiceForm from "./InvoiceForm";

export const dynamic = "force-dynamic";

export default async function NewInvoice() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: clients }, { data: projects }, { data: profile }, { data: bankAccounts }] = await Promise.all([
    supabase.from("clients").select("id, name, invoice_prefix").order("name"),
    supabase.from("projects").select("id, name, client_id").order("name"),
    supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
    supabase.from("bank_accounts").select("*").order("is_default", { ascending: false }),
  ]);

  return (
    <Shell>
      <header className="mb-8">
        <div className="eyebrow mb-1">New</div>
        <h1 className="text-3xl font-semibold tracking-tight">Create invoice</h1>
      </header>
      <InvoiceForm
        clients={clients ?? []}
        projects={projects ?? []}
        myProfile={profile ?? null}
        bankAccounts={bankAccounts ?? []}
      />
    </Shell>
  );
}
