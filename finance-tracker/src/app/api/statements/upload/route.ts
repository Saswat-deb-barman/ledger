import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { parseStatement, extractMerchant, tierOf, fingerprint } from "@/lib/parsers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BANK_NAME: Record<string, string> = { yes: "Yes Bank", axis: "Axis Bank", kotak: "Kotak Mahindra Bank" };

// POST multipart/form-data with `file`. Parses, dedupes, records history.
export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  let p;
  try { p = parseStatement(file.name, buf); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 422 }); }

  // Match against an existing bank_accounts row (the ones already used for
  // invoice "pay to" details) by account number, rather than keeping a
  // second, statement-only accounts table. Create one only if this account
  // hasn't been seen before.
  let accountId: string | null = null;
  if (p.account_no) {
    const { data: existing } = await supabase
      .from("bank_accounts").select("id").eq("account_number", p.account_no).maybeSingle();
    accountId = existing?.id ?? null;
  }
  if (!accountId) {
    const { data: created } = await supabase.from("bank_accounts").insert({
      owner_id: user.id,
      account_name: p.account_label,
      bank_name: BANK_NAME[p.bank] ?? p.bank,
      account_number: p.account_no,
      ifsc: p.ifsc,
    }).select("id").single();
    accountId = created?.id ?? null;
  }

  const { data: imp } = await supabase.from("statement_imports").insert({
    owner_id: user.id, account_id: accountId, bank: p.bank, file_name: file.name,
    period_from: p.period_from, period_to: p.period_to, row_count: p.txns.length,
  }).select("id").single();

  const { data: rules } = await supabase.from("tag_rules").select("keyword, tag").eq("owner_id", user.id);
  const applyTag = (desc: string, merchant: string) => {
    const hay = `${desc} ${merchant}`.toUpperCase();
    for (const r of rules ?? []) if (hay.includes(r.keyword.toUpperCase())) return r.tag;
    return null;
  };

  const rows = p.txns.map(t => {
    const merchant = extractMerchant(p.bank, t.description);
    return {
      owner_id: user.id, account_id: accountId, import_id: imp?.id,
      txn_date: t.txn_date, description: t.description, reference: t.reference,
      amount: t.amount, direction: t.direction, balance: t.balance,
      merchant, tier: tierOf(t.amount), tag: applyTag(t.description, merchant),
      fingerprint: fingerprint(p.account_no, t),
    };
  });

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { count } = await supabase.from("bank_txns")
      .upsert(rows.slice(i, i + 500),
        { onConflict: "owner_id,fingerprint", ignoreDuplicates: true, count: "exact" });
    inserted += count ?? 0;
  }
  const dupes = rows.length - inserted;
  await supabase.from("statement_imports").update({ duplicate_count: dupes }).eq("id", imp?.id);

  return NextResponse.json({
    bank: p.bank, account: p.account_label,
    period: [p.period_from, p.period_to], total: rows.length, inserted, duplicates: dupes,
  });
}
