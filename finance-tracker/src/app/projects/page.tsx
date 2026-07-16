import Shell from "@/components/Shell";
import { supabaseServer } from "@/lib/supabase-server";
import ProjectManager from "./ProjectManager";

export const dynamic = "force-dynamic";

export default async function Projects() {
  const supabase = supabaseServer();
  const [{ data: projects }, { data: clients }] = await Promise.all([
    supabase.from("projects").select("*, clients(name)").order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  // Billed-so-far per project = sum of received income entries tagged to it.
  // Scoped to this page's actual project ids instead of pulling every
  // income entry ever recorded — that table only grows over time and most
  // rows (retainers, unrelated one-offs) aren't tagged to any project.
  const projectIds = (projects ?? []).map((p: any) => p.id);
  const { data: entries } = projectIds.length
    ? await supabase.from("income_entries").select("project_id, received").in("project_id", projectIds)
    : { data: [] as any[] };

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
