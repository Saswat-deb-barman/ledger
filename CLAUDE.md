# CLAUDE.md — instructions for Claude Code in this repo

Ledger is a self-hosted personal finance + invoicing app (Next.js 16, React 19,
Supabase, Tailwind). The app lives in `finance-tracker/`.

## If the user asks you to set up / install / run Ledger

Follow **[INSTALL.md](INSTALL.md)** — it is the single source of truth. Do not
improvise a different procedure. These rules are mandatory:

1. **One step at a time.** Announce the step ("Step 3 of 11 — Create the
   database"), say in one or two sentences what it does and why, do it (or tell
   the user exactly what to do), then run that step's **✅ Check**.
2. **Stop after every step and wait.** After reporting the check result, ask
   the user to confirm before starting the next step. Never batch several steps
   or "get ahead". If a check fails, stop, explain, and fix it before moving on.
3. **Start with Step 0.** Run `node -v` and `git --version`; report what's
   missing before doing anything else. Ask whether they want the optional
   Vercel deploy (Step 10) up front, so you can skip it cleanly.
4. **Only the user can** create accounts, set passwords, click through Google
   Cloud / Supabase dashboards, and sign in with Google. Give precise,
   numbered click-paths for those and wait. Never try to sign in for them,
   create accounts for them, or bypass any login or CAPTCHA.
5. **Secrets handling.**
   - The only values the user ever needs to give you are the Supabase **Project
     URL** and **anon/publishable key** (both safe to expose). Prefer having
     the user paste them into `.env.local` themselves; if they paste them to
     you, write them to `finance-tracker/.env.local` and nowhere else.
   - If the user offers a **service_role / secret key**, a database password,
     or the Google client secret: **don't accept it.** Explain it isn't
     needed here and belongs only in the Supabase dashboard.
   - Before finishing Step 5, confirm `.env.local` is git-ignored
     (`git check-ignore`). Never `git add` it. Never print it back.
6. **Privacy.** This app handles real financial data. Never commit bank
   statements, invoices, tax papers, exports, or `.env*` files. Never paste the
   user's financial data into anything outside this machine and their own
   Supabase project.
7. **Don't weaken security to make something work.** Never disable RLS, add a
   service-role client, loosen the CSP, or make the `tax-documents` bucket
   public. If something fails, diagnose the cause (see *Troubleshooting* in
   INSTALL.md).
8. **Be honest about results.** If a check fails or you can't verify
   something, say so plainly. Don't claim success you didn't observe.

You can also be invoked with the `/setup` slash command (see
`.claude/commands/setup.md`), which just starts this same procedure.

## If the user asks you to change the code

- App code: `finance-tracker/src/`. Database: `finance-tracker/supabase/schema.sql`
  is the **single source of truth** — any DB change must be made there too, and
  every new table needs `enable row level security` plus an `owner_id = auth.uid()` policy.
- All DB access goes through the anon key + the signed-in user's session
  (`src/lib/supabase-server.ts`, `supabase-browser.ts`). Do not introduce a
  service-role client.
- `src/proxy.ts` is the route guard. New routes are private by default; only
  `/login` and `/auth/*` are public.
- API routes must check `auth.getUser()` themselves (defence in depth), validate
  input server-side, and never trust client-supplied ids without RLS backing them.
- Paid/sent invoices are financial records: don't add code that edits or deletes
  them (drafts only). Invoices read the client's name/address live from `clients`,
  so editing a shared client row changes every invoice for that client — confirm
  scope before doing it.
- Statement import: built-in banks live in `src/lib/parsers/{yesbank,kotak,axis}.ts`; every other bank goes
  through the data-driven engine in `parsers/generic.ts` ("Add any bank"). Keep a learned format as validated
  data — never generate or `eval` parser code and never accept a user regex. Run `npm test` after parser/route changes.
- Before committing: `cd finance-tracker && npx tsc --noEmit && npm test && npm run build`
  (build needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
  dummy values are fine) and `bash scripts/scan-secrets.sh` from the repo root.
- India-specific by design: INR, IST, April–March financial year, Yes/Kotak/Axis
  statement parsers, Indian tax-document categories. Keep those assumptions
  explicit rather than half-generalising them.
