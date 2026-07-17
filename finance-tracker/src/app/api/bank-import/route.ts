import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { parseBankStatement } from "@/lib/bankCsv";

// POST /api/bank-import — accepts a CSV bank statement, parses it, and stores
// every row as a bank_transactions record for later reconciliation.
export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const bank_account_id = (form.get("bank_account_id") as string) || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "only .csv files are supported right now" }, { status: 400 });
  }

  const text = await file.text();
  let parsed;
  try {
    parsed = parseBankStatement(text);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "could not parse CSV" }, { status: 400 });
  }
  if (!parsed.txns.length) {
    return NextResponse.json(
      { error: `No transaction rows recognized. Headers found: ${parsed.headers.join(", ")}` },
      { status: 400 });
  }

  const { data: imp, error: impErr } = await supabase.from("bank_statement_imports").insert({
    owner_id: user.id, bank_account_id, filename: file.name, row_count: parsed.txns.length,
  }).select("id").single();
  if (impErr) return NextResponse.json({ error: impErr.message }, { status: 500 });

  const rows = parsed.txns.map(t => ({
    owner_id: user.id,
    bank_account_id,
    import_id: imp!.id,
    txn_date: t.txn_date,
    description: t.description,
    amount: t.amount,
    direction: t.direction,
    balance: t.balance,
    raw: t.raw,
  }));
  const { error: txnErr } = await supabase.from("bank_transactions").insert(rows);
  if (txnErr) return NextResponse.json({ error: txnErr.message }, { status: 500 });

  const credits = parsed.txns.filter(t => t.direction === "credit").length;
  const debits = parsed.txns.length - credits;
  return NextResponse.json({ import_id: imp!.id, count: parsed.txns.length, credits, debits });
}
