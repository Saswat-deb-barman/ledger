# Ledger — Ledger (Model B: monthly cash flow)

Built to match how you actually track money in your spreadsheet: the **month**
is the unit of truth, and `in-hand = received − expenses`. Income comes in two
shapes — **retainers** that auto-fill each month (override any single month) and
**projects** you log as they land. Invoices are a document you attach when you
need one, not the thing everything hangs off.

## Modules
- **Dashboard** — monthly in-vs-out bars for the financial year, earned/expenses/
  pending headline, and a month-by-month table mirroring your Master Sheet.
- **Income** — per month. Retainers auto-fill from a default and can be overridden
  for any single month; mark each as received. Add project income inline.
- **Expenses** — four light buckets (living / leisure / saving / other), per month.
- **Invoices** — create, gap-free per-context numbering, status flow, PDF export.
- **Projects** — lightweight; billed-so-far pulls from received income tagged to them.
- **Clients** — Acme, Northwind, Globex, Pied Piper… with optional invoice series + tax details.

## Stack
Next.js 14 · Supabase (Postgres + Google auth) · Tailwind · @react-pdf/renderer.

---

## Deploy (~15 min)

1. **Supabase project** → SQL Editor → run `supabase/schema.sql`.
2. **Auth → Providers → Google**: enable it (create an OAuth client in Google
   Cloud Console; redirect URI `https://YOUR-PROJECT.supabase.co/auth/v1/callback`).
3. **Settings → API**: copy URL + anon key into `.env.local` (see `.env.local.example`).
4. `npm install && npm run dev` → open http://localhost:3000 → sign in with Google.
5. Add one row to `profiles` (your PAN + `default_bank` JSON) — powers the PDF "Billed By".
6. *(optional)* Run `supabase/seed_example.sql` after first sign-in for starter data
   from your own spreadsheet (Northwind, Globex, Globex Learning retainers, etc.).
7. Push to GitHub → import to Vercel → add the same env vars → live.

## How retainers work
When you open `/income` for a month, the app calls `ensure_retainer_entries`,
which creates a row for each active retainer at its default amount — but only if
no row exists yet. So editing a month's amount (say Northwind ₹75k instead of ₹1.5L)
is never overwritten. Stop a retainer by setting its `active_to` date or status.

## Deferred to V2 (clean hooks left in place)
- **Bank reconciliation** — your "Client Credits" tab (match actual credits to
  expected income). The `expected` vs `received` split already models this.
- **Retirement/FIRE model** — your "Thought Experiment" tab.
- **Gmail subscription auto-detect** — recurring expenses are already a bucket.

## Notes
- No GST on issued invoices (matches your invoices); tax fields default to 0 and
  are ready if you ever register.
- `supabase/schema_v1_invoice_spine.sql.bak` is the earlier invoice-centric model,
  kept for reference. The live schema is `schema.sql`.
