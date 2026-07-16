import Shell from "@/components/Shell";
import { supabaseServer } from "@/lib/supabase-server";
import { inr, inrExact, fmtDate, STATUS_COLORS } from "@/lib/format";
import StatusActions from "./StatusActions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function InvoiceDetail({ params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const { data: inv } = await supabase
    .from("invoices")
    .select("*, clients(name, gstin, pan, billing_address, email), projects(name)")
    .eq("id", params.id).single();

  const { data: items } = await supabase
    .from("invoice_items").select("*").eq("invoice_id", params.id).order("sort_order");

  if (!inv) return <Shell><p className="text-muted">Invoice not found.</p></Shell>;

  return (
    <Shell>
      <div className="flex items-center justify-between mb-6">
        <Link href="/invoices" className="text-sm text-muted">← All invoices</Link>
        <StatusActions id={inv.id} status={inv.status} />
      </div>

      <div className="card p-8 max-w-3xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="eyebrow mb-1">Invoice</div>
            <h1 className="tnum text-2xl">{inv.invoice_number}</h1>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full ${STATUS_COLORS[inv.status]}`}>
            {inv.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-6 mt-6 text-sm max-sm:grid-cols-1">
          <div>
            <div className="eyebrow mb-1">Billed to</div>
            <div className="font-medium">{inv.clients?.name ?? "Personal"}</div>
            {inv.clients?.billing_address && <div className="text-muted">{inv.clients.billing_address}</div>}
            {inv.clients?.gstin && <div className="text-muted">GSTIN: {inv.clients.gstin}</div>}
          </div>
          <div className="text-right max-sm:text-left">
            <div className="eyebrow mb-1">Dates</div>
            <div>Issued {fmtDate(inv.issue_date)}</div>
            <div className="text-muted">Due {fmtDate(inv.due_date)}</div>
            {inv.projects?.name && <div className="text-muted mt-1">Project: {inv.projects.name}</div>}
          </div>
        </div>

        <table className="w-full mt-8 text-sm">
          <thead>
            <tr className="eyebrow border-b border-line">
              <th className="text-left py-2 font-medium">Item</th>
              <th className="text-right py-2 font-medium">Qty</th>
              <th className="text-right py-2 font-medium">Rate</th>
              <th className="text-right py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((it: any) => (
              <tr key={it.id} className="border-b border-line/60">
                <td className="py-2.5">{it.description}</td>
                <td className="py-2.5 text-right tnum">{it.quantity}</td>
                <td className="py-2.5 text-right tnum">{inr(it.rate)}</td>
                <td className="py-2.5 text-right tnum">{inr(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 ml-auto max-w-xs space-y-1.5 text-sm">
          <Line label="Subtotal" value={inrExact(inv.subtotal)} />
          {Number(inv.discount) > 0 && <Line label="Discount" value={`−${inrExact(inv.discount)}`} />}
          {Number(inv.tax_rate) > 0 && <Line label={`Tax (${inv.tax_rate}%)`} value={inrExact(inv.tax_amount)} />}
          <div className="hairline my-1.5" />
          <Line label="Total" value={inrExact(inv.total)} strong />
        </div>

        <a href={`/api/invoices/${inv.id}/pdf`}
          className="mt-8 inline-block rounded-xl border border-line px-4 py-2 text-sm hover:border-ink/30">
          Download PDF
        </a>
      </div>
    </Shell>
  );
}

function Line({ label, value, strong }: any) {
  return (
    <div className="flex justify-between">
      <span className={strong ? "font-medium" : "text-muted"}>{label}</span>
      <span className={`tnum ${strong ? "font-semibold text-base" : ""}`}>{value}</span>
    </div>
  );
}
