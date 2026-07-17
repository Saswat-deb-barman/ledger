import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// POST /api/bank-import/match — confirm, unmatch, or ignore a bank transaction.
export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { transaction_id, action, income_entry_id } = await req.json();
  if (!transaction_id) return NextResponse.json({ error: "transaction_id required" }, { status: 400 });

  const { data: txn, error: txnErr } = await supabase
    .from("bank_transactions").select("*").eq("id", transaction_id).single();
  if (txnErr || !txn) return NextResponse.json({ error: "transaction not found" }, { status: 404 });

  if (action === "ignore") {
    await supabase.from("bank_transactions")
      .update({ status: "ignored", matched_income_entry_id: null }).eq("id", transaction_id);
    return NextResponse.json({ ok: true });
  }

  if (action === "unmatch") {
    // Revert the income entry this was matched to, then clear the match.
    if (txn.matched_income_entry_id) {
      await supabase.from("income_entries")
        .update({ received: 0, is_received: false }).eq("id", txn.matched_income_entry_id);
    }
    await supabase.from("bank_transactions")
      .update({ status: "unmatched", matched_income_entry_id: null }).eq("id", transaction_id);
    return NextResponse.json({ ok: true });
  }

  // default: confirm a match
  if (!income_entry_id) return NextResponse.json({ error: "income_entry_id required to confirm a match" }, { status: 400 });
  if (txn.direction !== "credit") {
    return NextResponse.json({ error: "only credit transactions can be matched to income" }, { status: 400 });
  }

  const { error: incErr } = await supabase.from("income_entries")
    .update({ received: txn.amount, is_received: true }).eq("id", income_entry_id);
  if (incErr) return NextResponse.json({ error: incErr.message }, { status: 500 });

  const { error: matchErr } = await supabase.from("bank_transactions")
    .update({ status: "matched", matched_income_entry_id: income_entry_id }).eq("id", transaction_id);
  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
