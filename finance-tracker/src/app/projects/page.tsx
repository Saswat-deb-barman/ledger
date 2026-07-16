import Shell from "@/components/Shell";
import { supabaseServer } from "@/lib/supabase-server";
import ProjectManager from "./ProjectManager";

export const dynamic = "force-dynamic";

export default async function Projects() {
  const supabase = supabaseServer();
  const [{ data: projects }, { data: clients }, { data: entries }] = await Promise.all([
    supabase.from("projects").select("*, clients(name)").order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("income_entries").select("project_id, received"),
  ]);

  // Billed-so-far per project = sum of received income entries tagged to it.
  const billed: Record<string, number> = {};
  (entries ?? []).forEach((e: any) => {
    if (e.project_id) billed[e.project_id] = (billed[e.project_id] ?? 0) + Number(e.received);
  });

  return (
    <Shell>
      <header className="mb-8">
        <div className="eyebrow mb-1">Money flow per initiative</div>
        <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
      </header>
      <ProjectManager projects={projects ?? []} clients={clients ?? []} billed={billed} />
    </Shell>
  );
}
