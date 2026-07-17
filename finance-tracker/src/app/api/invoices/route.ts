import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { finYear, todayIST } from "@/lib/format";

// POST /api/invoices — creates an invoice with a gap-free, per-context number.
export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    client_id = null,
    project_id = null,
    prefix,                     // e.g. 'ACME' (client prefix) or your initials for personal invoices
    issue_date,
    due_date = null,
    items = [],
    discount = 0,
    tax_rate = 0,
    billed_by = null,
    bank_details = null,
    bank_account_id = null,
    notes = null,
    terms = null,
  } = body;

  // Validated here (not just in the UI) because it's baked permanently into
  // invoice_number/invoice_counters and later placed unescaped into a
  // Content-Disposition filename header when the PDF is downloaded.
  if (!prefix || typeof prefix !== "string" || !/^[A-Z0-9]{1,10}$/.test(prefix)) {
    return NextResponse.json(
      { error: "prefix must be 1-10 uppercase letters/digits" }, { status: 400 });
  }

  const fy = finYear(issue_date ? new Date(issue_date) : undefined);

  // 1) Reserve the next number atomically (RPC locks the counter row).
  const { data: num, error: numErr } = await supabase
    .rpc("next_invoice_number", { p_prefix: prefix, p_fin_year: fy })
    .single();
  if (numErr || !num) {
    return NextResponse.json({ error: numErr?.message ?? "numbering failed" }, { status: 500 });
  }

  // 2) Compute money.
  const subtotal = items.reduce(
    (s: number, it: any) => s + Number(it.quantity || 0) * Number(it.rate || 0), 0);
  const taxable = Math.max(subtotal - Number(discount || 0), 0);
  const tax_amount = +(taxable * Number(tax_rate || 0) / 100).toFixed(2);
  const total = +(taxable + tax_amount).toFixed(2);

  // 3) Insert invoice.
  const { data: inv, error: invErr } = await supabase.from("invoices").insert({
    owner_id: user.id,
    invoice_number: (num as any).invoice_number,
    fin_year: (num as any).out_fin_year,
    seq: (num as any).seq,
    prefix,
    client_id, project_id, bank_account_id,
    status: "draft",
    issue_date: issue_date ?? todayIST(),
    due_date,
    subtotal, discount, tax_rate, tax_amount, total,
    billed_by, bank_details, notes, terms,
  }).select("id").single();

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

  // 4) Insert line items.
  if (items.length) {
    const rows = items.map((it: any, idx: number) => ({
      invoice_id: inv!.id,
      description: it.description ?? "",
      quantity: Number(it.quantity || 1),
      rate: Number(it.rate || 0),
      amount: +(Number(it.quantity || 1) * Number(it.rate || 0)).toFixed(2),
      sort_order: idx,
    }));
    await supabase.from("invoice_items").insert(rows);
  }

  return NextResponse.json({ id: inv!.id, invoice_number: (num as any).invoice_number });
}
