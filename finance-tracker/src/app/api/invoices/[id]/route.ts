import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// DELETE /api/invoices/[id] — only draft invoices can be deleted. Anything
// sent/paid/overdue/cancelled is a financial record that's already left an
// invoice_number behind it; deleting those would break gap-free numbering
// and destroy an audit trail. The status check is enforced here (not just
// hidden in the UI) since RLS alone only checks ownership, not status.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: inv } = await supabase.from("invoices").select("id, status").eq("id", params.id).single();
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (inv.status !== "draft") {
    return NextResponse.json({ error: "only draft invoices can be deleted" }, { status: 400 });
  }

  await supabase.from("invoice_items").delete().eq("invoice_id", params.id);
  const { error } = await supabase.from("invoices").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
