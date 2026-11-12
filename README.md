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
| **Reconcile** | Upload a bank statement → de-duplicated transactions → triage (small / medium / large), tag rules, and **match bank credits to expected income**. |
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

## Adding a bank parser

1. Add `src/lib/parsers/<bank>.ts` exporting `parse<Bank>(input, fileName): ParsedStatement`
   (see `types.ts` — each transaction needs a date, description, amount,
   direction `credit|debit`, optional reference and balance).
2. Teach `parseStatement()` in `src/lib/parsers/index.ts` to **detect** the
   format from file *content* (don't rely on the file name alone) and dispatch.
3. Add the bank to `BANK_NAME` in `src/app/api/statements/upload/route.ts`.
4. Test with a **synthetic** file. Never commit a real statement.

## Known limitations

- Single-user by design (one owner per data set; no teams or roles).
- INR/IST/April–March only; no multi-currency invoices.
- No profile-editing screen yet (profile fields are set via SQL — see INSTALL Step 8).
- Supabase's free tier auto-pauses after ~7 days of inactivity (INSTALL Step 11).
- No automated test suite yet; CI runs typecheck, build, audit and a secret scan.

## License

[MIT](LICENSE). Provided **as is**, with no warranty. You are responsible for the
accuracy of the invoices and records you produce with it.
