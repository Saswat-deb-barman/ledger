# Ledger

**A self-hosted money tracker for freelancers and creators** — invoices, monthly
income vs. expenses, bank-statement reconciliation and a tax-document vault, all
in one place, with your data in *your own* database.

Built around how freelancers actually track money: the **month** is the unit of
truth (`in-hand = received − expenses`). Income is either a **retainer** that
auto-fills every month, or a **project** you log as it lands. Invoices are a
document you generate when you need one, not the thing everything hangs off.

> ⚠️ **Built for India.** Currency is INR, dates are IST, the financial year is
> April–March, statement parsers cover Yes Bank / Kotak / Axis, and the tax
> module uses Indian document types (Form 16A, 26AS, AIS/TIS, FIRC…). See
> [India-specific scope](#india-specific-scope).
>
> ⚠️ **Not financial, accounting or tax advice.** Ledger is a record-keeping
> tool provided as-is (see [LICENSE](LICENSE)). Check your numbers with your CA.

## Features

| Module | What it does |
|---|---|
| **Dashboard** | Monthly in-vs-out for the financial year; earned / expenses / pending at a glance. |
| **Income** | Per-month view. Retainers auto-fill from a default and can be overridden for any single month; mark each as received; add project income inline. |
| **Expenses** | Four light buckets (living / leisure / saving / other), per month. |
| **Invoices** | Gap-free numbering per client per financial year (`ACME/26-27/0001`), draft → sent → paid flow, PDF export, only drafts can be deleted. |
| **Clients & Projects** | Optional invoice prefix, GSTIN/PAN, billing address; projects roll up billed-so-far. |
| **Bank accounts** | Your accounts — used for invoice "pay to" details and as statement targets. |
| **Reconcile** | Upload a bank statement → de-duplicated transactions → triage (small / medium / large), tag rules, and **match bank credits to expected income**. Yes Bank, Kotak and Axis work out of the box; for **any other bank**, upload one sample statement and Ledger [learns its layout](#add-any-bank). |
| **Tax** | Financial-year-organised document vault for your CA (private storage, short-lived download links, "added by me / CA" marker). |

## Install it (about 30 minutes)

**Easiest — let Claude Code walk you through it:**

1. Install [Claude Code](https://claude.com/claude-code) and open this repo in it.
2. Say **"Set up Ledger for me."** (or run `/setup`).

Claude follows [`INSTALL.md`](INSTALL.md) **one step at a time**, does what it
safely can, tells you exactly what to click for the parts only you can do
(Supabase, Google sign-in), checks each step worked, and waits for you before
moving on.

**Or do it by hand:** follow [`INSTALL.md`](INSTALL.md) yourself — the same
11 steps with the same checks.

What you'll create: your own free **Supabase** project (database, login, file
storage) and a **Google OAuth** client for sign-in. Optionally a **Vercel**
deployment. Nothing is shared with anyone else.

## How your data is protected

- **Your own database.** Each installer runs their own Supabase project. There
  is no central server and no telemetry.
- **Row Level Security on every table.** Rows are visible only to the signed-in
  owner (`owner_id = auth.uid()`), enforced by Postgres itself.
- **Anon key only.** The app never uses a service-role key, so it cannot bypass
  RLS even if the code had a bug.
- **Private tax bucket.** Files live under `{your-user-id}/…` with storage RLS;
  downloads use 60-second signed links.
- **Hardened by default:** auth-guarded routes, security headers + CSP, upload
  size/type limits, server-side input validation, no known dependency
  vulnerabilities at release (`npm audit` clean).
- **Your invoices and statements never touch git** — `.gitignore` blocks
  common data file types and CI runs a secret/PII scan.

Full details and the pre-flight checklist: [`SECURITY.md`](SECURITY.md).

## Stack

Next.js 16 (App Router) · React 19 · Supabase (Postgres, Auth, Storage) ·
Tailwind CSS · `@react-pdf/renderer` · SheetJS (`xlsx`) for statement parsing.

```
finance-tracker/
  src/app/            pages + API routes (dashboard, income, invoices, reconciliation, tax …)
  src/lib/parsers/    one file per bank statement format
  src/lib/format.ts   INR / IST / financial-year helpers
  src/proxy.ts        auth guard for every route
  supabase/schema.sql the whole database: tables, RLS, functions, storage policies
  supabase/seed_example.sql  optional fictional demo data
```

## India-specific scope

| Assumption | Where it lives |
|---|---|
| Currency INR, `en-IN` number formatting | `src/lib/format.ts`, invoice PDF route |
| IST dates, April–March financial year (`26-27`) | `src/lib/format.ts` |
| GSTIN / PAN fields; GST rate defaults to 0 (unregistered freelancers) | `schema.sql`, client form |
| Yes Bank, Kotak, Axis statement formats | `src/lib/parsers/` |
| Tax categories: 16A, 26AS, AIS/TIS, FIRC … | `src/app/tax/TaxManager.tsx`, `schema.sql` |

Using it elsewhere means changing those places. PRs that make currency and
fiscal year configurable are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Add any bank

Not on Yes / Kotak / Axis? You don't need a developer:

1. **Reconcile → Upload statement** with a `.csv`, `.xls` or `.xlsx` from your bank.
2. Ledger doesn't recognise it, so it opens **Add a bank**: it detects the header row,
   the date / description / debit / credit / amount / balance columns, the date order
   and whether money in/out is separate columns, a signed amount or a Dr/Cr marker.
3. You get a **preview with totals** to check against your statement, and dropdowns to
   fix anything it got wrong. Name the bank and import.
4. The layout is saved, so the **next file from that bank imports automatically**
   (manage them under *Upload history → Banks you've added*).

It works by saving a small *column mapping* (plain data) — nothing is generated or
executed, and your statement never leaves your own server and Supabase project.
Duplicate rows are skipped across overlapping uploads.

**Existing install?** Run `finance-tracker/supabase/upgrades/2026-11-bank-formats.sql` once
in the Supabase SQL Editor (fresh installs get it from `schema.sql`).

**For contributors:** the engine is `src/lib/parsers/generic.ts` (tests in
`generic.test.ts`). The three built-in banks keep dedicated parsers in the same folder;
a dedicated parser is only worth adding for formats the generic engine can't express
(e.g. a layout where account details sit in odd places). Test with a **synthetic** file —
never commit a real statement.

## Known limitations

- Single-user by design (one owner per data set; no teams or roles).
- INR/IST/April–March only; no multi-currency invoices.
- **Statements must be CSV / XLS / XLSX.** PDF-only statements aren't supported (ask your bank for a CSV/Excel export). Only the first sheet is read, decimals must use `.` (not `1.234,56`), and one file = one account.
- No profile-editing screen yet (profile fields are set via SQL — see INSTALL Step 8).
- Supabase's free tier auto-pauses after ~7 days of inactivity (INSTALL Step 11).
- Tests cover the statement parsers and import routes (`npm test`); there are no UI tests yet. CI also runs typecheck, build, audit and a secret scan.

## License

[MIT](LICENSE). Provided **as is**, with no warranty. You are responsible for the
accuracy of the invoices and records you produce with it.
