# Security

Ledger handles sensitive financial data (invoices, bank transactions, tax
documents, PAN). This file explains how it is protected, what you must do when
you install it, and how to report a problem.

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Use GitHub's
**private vulnerability reporting** (*Security → Report a vulnerability* on
this repository). Include steps to reproduce and the impact. Do **not** include
real financial data in a report.

## Security model

Ledger is **single-tenant and self-hosted**: every installer runs their own
Supabase project and (optionally) their own Vercel deployment. There is no
shared backend.

| Layer | Protection |
|---|---|
| Authentication | Google OAuth via Supabase Auth; cookie sessions through `@supabase/ssr`. |
| Route guard | `src/proxy.ts` redirects every unauthenticated request to `/login`. Only `/login` and `/auth/*` are public. |
| API routes | Each also calls `auth.getUser()` itself (defence in depth) and validates input server-side (invoice prefix allow-list, upload size/type limits, draft-only deletes). |
| Authorization | **Row Level Security on every table**, policy `owner_id = auth.uid()`. This — not application code — is the boundary between users. |
| Privilege | Only the **anon key** is used. There is **no service-role key** anywhere in the code, and one must never be added. |
| Storage | `tax-documents` bucket is private; storage RLS restricts every object to the `{auth.uid()}/` folder; downloads are 60-second signed URLs; 25 MB per-file limit. |
| DB functions | `SECURITY DEFINER` functions pin `search_path`, derive the owner from `auth.uid()` (never from an argument), and have `EXECUTE` revoked from `anon`/`PUBLIC`. |
| Views | Created with `security_invoker = true` so they obey the caller's RLS. |
| Browser | CSP (`default-src 'self'`, no framing, restricted `connect-src` to your Supabase origin), `X-Frame-Options`, `nosniff`, HSTS, strict referrer policy, no `X-Powered-By`. |
| Untrusted files | Uploaded statements are size-capped (10 MB), extension-checked, row/column/cell-capped, and parsed in memory; nothing is executed or written to disk. |
| "Add any bank" | A learned bank format is **plain validated data** (column numbers + enums, ≤2 KB, per-user RLS) — never generated code, never a user-supplied regex, so there is nothing to execute or ReDoS. The statement is analysed on your own server; no third-party or AI service sees it. |
| Supply chain | `package-lock.json` committed; Dependabot + CI `npm audit`. `xlsx` is installed from the **official SheetJS CDN tarball** (0.20.3) because the npm registry copy is unmaintained and has known CVEs — `npm audit` cannot see this one, so **check for new SheetJS releases yourself**. |

## Install-time checklist (every installer)

- [ ] `schema.sql` ran fully; every table shows RLS **on** (INSTALL Step 3 check).
- [ ] `tax-documents` bucket is **not public** (same check).
- [ ] `.env.local` contains **only** the Project URL and **anon** key, and is git-ignored.
- [ ] You did **not** put the `service_role` key, DB password or Google client secret in `.env.local` or Vercel.
- [ ] **"Allow new users to sign up" is switched off** in Supabase after your first sign-in (INSTALL Step 7).
- [ ] Google OAuth consent screen is in *Testing* with only your own email, or you understand the alternative.
- [ ] Your fork is **private** if it contains anything beyond this code.
- [ ] You never commit bank statements, invoices, tax papers or exports (`.gitignore` blocks common types; `scripts/scan-secrets.sh` checks).
- [ ] You keep private backups of your database somewhere that is not git.

## Known limitations & risks

- **Sign-ups are open until you disable them.** A stranger could create an
  (empty) account on your project. They cannot read your data, but they use your quota.
- **No rate limiting** on API routes beyond what Vercel/Supabase provide.
- **No application-level encryption.** Data is protected by Supabase's
  encryption at rest and TLS in transit, not end-to-end encryption; the
  Supabase project owner (you) and Supabase can access it.
- **Invoices read client name/address live** from the `clients` table, so
  editing a client changes how *all* of that client's invoices render — including paid ones.
- **Page loads of `/income` have a write side-effect** (`ensure_retainer_entries` creates missing retainer rows).
- The CSP allows `'unsafe-inline'` scripts/styles (needed by Next.js hydration and Tailwind). A nonce-based CSP would be stricter.
- No automated security tests yet.

## Keeping it safe over time

- Turn on **Dependabot alerts** for your fork and merge security updates promptly.
- Run `npm audit --omit=dev` before deploying.
- Rotate your Supabase keys from the dashboard if you ever suspect exposure
  (the anon key is public by design, but rotating is cheap).
- If you ever commit a secret, treat it as leaked: **rotate it first**, then clean git history.
