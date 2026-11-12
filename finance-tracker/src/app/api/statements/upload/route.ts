import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { readStatementUpload, UploadError } from "@/lib/statement-upload";
import {
  parseStatement, extractMerchant, tierOf, fingerprint, UnknownFormatError,
  readGrid, parseWithConfig, sanitizeConfig, signatureOf, matchSavedFormat,
  type ParsedStatement,
} from "@/lib/parsers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BANK_NAME: Record<string, string> = { yes: "Yes Bank", axis: "Axis Bank", kotak: "Kotak Mahindra Bank" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST multipart/form-data with `file`. Parses, dedupes, records history.
//   • Built-in banks (Yes / Kotak / Axis) are recognised automatically.
//   • Otherwise a format the user saved earlier ("Add any bank") is used if the
//     header matches.
//   • Otherwise → 422 { code: "unknown_format" } and the UI offers to add the bank.
//   • Optional fields from the "Add a bank" wizard: `config` (JSON column mapping),
//     `format_name`, `save_format` ("1"), `account_id`.
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let upload;
  try { upload = await readStatementUpload(req); }
  catch (e: any) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "invalid upload" }, { status: 400 });
  }
  const { form, file, buf } = upload;

  let p: ParsedStatement;
  let savedFormat: { id: string; account_id: string | null } | null = null;
  let saveAs: { name: string; signature: string; config: unknown } | null = null;

  const suppliedConfig = form.get("config");
  if (typeof suppliedConfig === "string" && suppliedConfig) {
    // ---- explicit mapping from the wizard --------------------------------
    const name = String(form.get("format_name") ?? "").trim();
    if (name.length < 1 || name.length > 60) {
      return NextResponse.json({ error: "Give this bank a name (1–60 characters)." }, { status: 400 });
    }
    try {
      const config = sanitizeConfig(JSON.parse(suppliedConfig));
      const grid = readGrid(file.name, buf);
      p = parseWithConfig(grid, config, name);
      if (form.get("save_format") === "1") {
        saveAs = { name, signature: signatureOf(grid[config.header_row] ?? []), config };
      }
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? "Couldn't read that file." }, { status: 422 });
    }
    if (p.txns.length === 0) return NextResponse.json({ error: "No transactions were found with that mapping." }, { status: 422 });
  } else {
    // ---- built-in banks, then the user's saved formats --------------------
    try { p = parseStatement(file.name, buf); }
    catch (e: any) {
      if (!(e instanceof UnknownFormatError)) {
        return NextResponse.json({ error: e?.message ?? "Couldn't read that file." }, { status: 422 });
      }
      let matched: { fmt: any; header_row: number } | null = null;
      let grid: ReturnType<typeof readGrid> | null = null;
      try {
        grid = readGrid(file.name, buf);
        const { data: formats } = await supabase.from("bank_formats").select("id, name, signature, config, account_id");
        const m = matchSavedFormat(grid, (formats ?? []).map((f: any) => ({ ...f, config: f.config })));
        if (m) matched = { fmt: m.format, header_row: m.header_row };
      } catch { /* unreadable as a table → falls through to unknown_format */ }

      if (!matched || !grid) {
        return NextResponse.json({
          error: "We don't recognise this bank's format yet.", code: "unknown_format",
        }, { status: 422 });
      }
      try {
        const config = sanitizeConfig({ ...matched.fmt.config, header_row: matched.header_row });
        p = parseWithConfig(grid, config, matched.fmt.name);
        savedFormat = { id: matched.fmt.id, account_id: matched.fmt.account_id ?? null };
      } catch (err: any) {
        return NextResponse.json({ error: err?.message ?? "Couldn't read that file." }, { status: 422 });
      }
    }
  }

  // ---- which account does this belong to? --------------------------------
  // Prefer an explicit choice, then the account number in the file, then the
  // account remembered on the saved format; otherwise create one.
  const usableNo = p.account_no && /^\d{6,20}$/.test(p.account_no) ? p.account_no : null;
  let accountId: string | null = null;
  const chosen = form.get("account_id");
  if (typeof chosen === "string" && chosen) {
    if (!UUID.test(chosen)) return NextResponse.json({ error: "invalid account" }, { status: 400 });
    const { data: acct } = await supabase.from("bank_accounts").select("id").eq("id", chosen).maybeSingle();
    if (!acct) return NextResponse.json({ error: "account not found" }, { status: 404 });
    accountId = acct.id;
  }
  if (!accountId && (p.custom ? usableNo : p.account_no)) {
    const { data: existing } = await supabase
      .from("bank_accounts").select("id").eq("account_number", (p.custom ? usableNo : p.account_no)!).maybeSingle();
    accountId = existing?.id ?? null;
  }
  if (!accountId && savedFormat?.account_id) accountId = savedFormat.account_id;
  if (!accountId) {
    const { data: created } = await supabase.from("bank_accounts").insert({
      owner_id: user.id,
      account_name: p.account_label,
      bank_name: BANK_NAME[p.bank] ?? p.bank,
      account_number: p.custom ? usableNo : p.account_no,
      ifsc: p.ifsc,
    }).select("id").single();
    accountId = created?.id ?? null;
  }

  if (saveAs) {
    await supabase.from("bank_formats").upsert({
      owner_id: user.id, name: saveAs.name, signature: saveAs.signature,
      config: saveAs.config, account_id: accountId,
    }, { onConflict: "owner_id,signature" });
  } else if (savedFormat && !savedFormat.account_id && accountId) {
    await supabase.from("bank_formats").update({ account_id: accountId }).eq("id", savedFormat.id);
  }

  const { data: imp } = await supabase.from("statement_imports").insert({
    owner_id: user.id, account_id: accountId, bank: p.bank, file_name: file.name.slice(0, 200),
    period_from: p.period_from, period_to: p.period_to, row_count: p.txns.length,
  }).select("id").single();

  const { data: rules } = await supabase.from("tag_rules").select("keyword, tag").eq("owner_id", user.id);
  const applyTag = (desc: string, merchant: string) => {
    const hay = `${desc} ${merchant}`.toUpperCase();
    for (const r of rules ?? []) if (hay.includes(r.keyword.toUpperCase())) return r.tag;
    return null;
  };

  // Built-in banks keep their original fingerprint key (so existing rows still
  // dedupe). Custom formats key on the account row when the file has no number.
  const fpKey = p.custom ? (usableNo ?? `acct-${accountId}`) : p.account_no;
  const rows = p.txns.map(t => {
    const merchant = extractMerchant(p.custom ? "generic" : p.bank, t.description);
    return {
      owner_id: user.id, account_id: accountId, import_id: imp?.id,
      txn_date: t.txn_date, description: t.description, reference: t.reference,
      amount: t.amount, direction: t.direction, balance: t.balance,
      merchant, tier: tierOf(t.amount), tag: applyTag(t.description, merchant),
      fingerprint: fingerprint(fpKey, t),
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
    format_saved: !!saveAs,
  });
}
