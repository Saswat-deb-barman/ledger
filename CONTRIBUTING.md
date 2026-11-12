# Contributing

Thanks for helping make Ledger better! A few ground rules, mostly to keep
everyone's financial data safe.

## Never include real data

Do **not** put real invoices, bank statements, tax papers, account numbers,
PAN/GSTIN, names, or addresses in issues, pull requests, screenshots, test
fixtures or commit messages. Use obviously fake data (`Acme Studios`,
`ABCDE1234F`, `22AAAAA0000A1Z5`). Run `bash scripts/scan-secrets.sh` before you push.

## Dev setup

Follow [INSTALL.md](INSTALL.md) steps 0–6 against your **own** Supabase project.
Never test against someone else's data.

## Before opening a PR

```bash
cd finance-tracker
npx tsc --noEmit
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
cd .. && bash scripts/scan-secrets.sh
```

## Rules of the road

- **Database changes** go in `finance-tracker/supabase/schema.sql`. Every new
  table must enable RLS and have an `owner_id = auth.uid()` policy. Say in the PR
  what a user with an existing database must run to upgrade.
- **No service-role key**, ever. All access uses the anon key + the user session.
- API routes must authenticate and validate input themselves.
- Keep India-specific assumptions explicit and documented; PRs that make
  currency / fiscal year configurable are very welcome.
- New bank parsers: see *Adding a bank parser* in the README, and test with a synthetic file.
- Keep dependencies few and current; explain any new one in the PR.

## Reporting security issues

Privately, via GitHub's *Report a vulnerability* — see [SECURITY.md](SECURITY.md).
