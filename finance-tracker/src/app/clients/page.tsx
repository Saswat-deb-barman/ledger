import Shell from "@/components/Shell";
import { supabaseServer } from "@/lib/supabase-server";
import ClientManager from "./ClientManager";

export const dynamic = "force-dynamic";

export default async function Clients() {
  const supabase = await supabaseServer();
  const { data: clients } = await supabase.from("clients").select("*").order("name");
  return (
    <Shell>
      <header className="mb-8">
        <div className="eyebrow mb-1">Who you bill, and who bills you</div>
        <h1 className="text-3xl font-semibold tracking-tight">Clients</h1>
      </header>
      <ClientManager clients={clients ?? []} />
    </Shell>
  );
}
