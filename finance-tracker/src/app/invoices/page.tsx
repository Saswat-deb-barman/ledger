import Shell from "@/components/Shell";
import { supabaseServer } from "@/lib/supabase-server";
import { inr, fmtDate, STATUS_COLORS } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Invoices() {
  const supabase = await supabaseServer();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, total, issue_date, due_date, clients(name), projects(name)")
    .order("issue_date", { ascending: false });

  return (
    <Shell>
      <header className="flex items-end justify-between mb-8">
        <div>
          <div className="eyebrow mb-1">All records</div>
          <h1 className="text-3xl font-semibold tracking-tight">Invoices</h1>
        </div>
        <Link href="/invoices/new" className="rounded-xl bg-ink text-paper px-4 py-2.5 text-sm font-medium">
          New invoice
        </Link>
      </header>

      <div className="card divide-y divide-line">
        {(invoices ?? []).length === 0 && (
          <div className="p-8 text-center text-muted text-sm">
            Nothing here yet. <Link href="/invoices/new" className="text-accent">Create your first invoice</Link>.
          </div>
        )}
        {(invoices ?? []).map((i: any) => (
          <Link key={i.id} href={`/invoices/${i.id}`}
            className="flex items-center gap-4 p-4 hover:bg-line/30 transition">
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[i.status]}`}>{i.status}</span>
            <div className="flex-1 min-w-0">
              <div className="tnum text-sm">{i.invoice_number}</div>
              <div className="text-xs text-muted truncate">
                {i.clients?.name ?? "Personal"} · {i.projects?.name ?? "—"} · {fmtDate(i.issue_date)}
              </div>
            </div>
            <div className="tnum text-sm w-28 text-right text-income">{inr(i.total)}</div>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
