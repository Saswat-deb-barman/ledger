# Installing Ledger — step by step

This guide takes about 30–40 minutes. It is written so that **you can follow it
by hand, or have Claude Code walk you through it one step at a time** (see
[Using Claude Code](#using-claude-code-to-do-this) at the bottom).

Every step ends with a **✅ Check**. Don't move on until the check passes.

Ledger is **self-hosted and single-user**: you create your *own* Supabase
project, so your financial data lives in *your* database and nowhere else.

---

## Step 0 — What you need

| Need | Why | Check |
|---|---|---|
| Node.js **20.9 or newer** | runs the app | `node -v` |
| git | gets the code | `git --version` |
| A free [Supabase](https://supabase.com) account | database + login + file storage | you can sign in |
| A Google account | "Sign in with Google" | — |
| *(optional)* GitHub + [Vercel](https://vercel.com) accounts | to host it online | — |

✅ **Check:** `node -v` prints `v20.9` or higher.

---

## Step 1 — Get the code and install dependencies

```bash
git clone <your-fork-or-this-repo-url> ledger
cd ledger/finance-tracker
npm install
```

✅ **Check:** `npm install` finishes with no errors, and `npm audit --omit=dev`
reports no **critical** or **high** vulnerabilities.

---

## Step 2 — Create your Supabase project

1. In the Supabase dashboard click **New project**.
2. Pick a name (e.g. `ledger`) and the **region closest to you**.
3. Set a strong **database password** and save it in a password manager.
4. Wait ~2 minutes for provisioning.

✅ **Check:** the project dashboard opens and shows a **Project URL** under
*Project Settings → API*.

---

## Step 3 — Create the database

1. Supabase dashboard → **SQL Editor → New query**.
2. Paste the **entire** contents of `finance-tracker/supabase/schema.sql` and click **Run**.
3. Then run this verification query:

```sql
select
  (select count(*) from pg_tables where schemaname = 'public')                      as tables,
  (select count(*) from pg_tables where schemaname = 'public' and rowsecurity)      as tables_with_rls,
  (select public from storage.buckets where id = 'tax-documents')                   as bucket_is_public;
```

✅ **Check:** `tables` and `tables_with_rls` are the **same number (14)**, and
`bucket_is_public` is **`false`**. If RLS is not on for every table, **stop** —
your data would not be private. Re-run `schema.sql`.

> If the schema errors halfway, don't patch it by hand. On a brand-new project
> the cleanest fix is to delete the project (*Project Settings → General →
> Delete project*), create a fresh one (Step 2), and run `schema.sql` again
> from the top.

---

## Step 4 — Set up Google sign-in

You create a Google "OAuth client" so Supabase can ask Google who you are.

1. Go to [Google Cloud Console](https://console.cloud.google.com) → create a project (any name).
2. **APIs & Services → OAuth consent screen**: choose **External**, fill the app
   name and your email. Leave it in **Testing** mode and add **your own Google
   email under Test users**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   type **Web application**.
4. Under **Authorized redirect URIs** add exactly:
   `https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback`
   (your project ref is the first part of your Supabase Project URL).
5. Copy the **Client ID** and **Client secret**.
6. Supabase → **Authentication → Sign In / Providers → Google** → enable it and
   paste the Client ID + secret → **Save**.
7. Supabase → **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:3000`
   - **Redirect URLs:** add `http://localhost:3000/auth/callback`

✅ **Check:** the Google provider shows **Enabled** in Supabase, and both URLs
are saved.

> The Client **secret** goes into Supabase only. It never goes into this app's
> `.env.local` and must never be committed.

---

## Step 5 — Configure the app

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill the two values from *Supabase → Project Settings → API*:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the "anon" / "publishable" key>
```

> ⚠️ Use the **anon / publishable** key. **Never** use the `service_role` /
> secret key — it bypasses all privacy rules and this app does not need it.

✅ **Check:** `git check-ignore finance-tracker/.env.local` (or `git check-ignore .env.local`
from inside `finance-tracker/`) prints the path, proving the file is ignored by git.

---

## Step 6 — Run it and sign in

```bash
npm run dev
```

Open <http://localhost:3000> and click **Continue with Google**.

✅ **Check:** you land on the **Dashboard**, and in Supabase *Table Editor →
`profiles`* there is **one row with your name and email** (it is created
automatically on first sign-in).

---

## Step 7 — Lock the door behind you

Right now anyone with a Google account who finds your URL could sign up. They
could only ever see *their own* (empty) data, but you don't want strangers on
your project.

Supabase → **Authentication → Sign In / Providers** → turn **off**
**"Allow new users to sign up"**.

✅ **Check:** the toggle is off. You can still sign in (you already exist).
To let a family member in later, turn it on briefly, let them sign in once, then turn it off.

---

## Step 8 — Fill in your invoice details

The "Billed by" block on invoice PDFs comes from your profile. There is no
profile form yet, so use the SQL Editor (replace the values):

```sql
update public.profiles set
  full_name = 'Your Name',
  pan       = 'ABCDE1234F',
  phone     = '+91 90000 00000',
  address   = 'Your address, City, PIN'
where email = 'you@example.com';
```

Then in the app: **Bank accounts** → add the account you want shown as
"pay to" on invoices (mark it default), and **Clients** → add a client with an
invoice prefix (e.g. `ACME`).

✅ **Check:** **Invoices → New** → pick the client → add one line item → create
it → open the **PDF**. Your name, address, bank details and client should all
appear, and the number looks like `ACME/26-27/0001`.

---

## Step 9 — Try the optional modules

- **Reconcile:** *Reconcile → upload statement*. Yes Bank, Kotak and Axis work
  out of the box. **Any other bank:** upload a `.csv`/`.xls`/`.xlsx` and Ledger opens
  **Add a bank** — check the detected columns and preview totals, name the bank, import;
  it remembers the layout for next time (see [Add any bank](README.md#add-any-bank)).
  Max 10 MB; duplicate rows are skipped automatically.
- **Tax:** *Tax → pick a financial year → upload a document*. Files go to a
  **private** storage bucket; only you can open them (via 60-second links).
- **Demo data (optional):** `finance-tracker/supabase/seed_example.sql` loads
  fictional clients/retainers/expenses so the dashboard isn't empty. Read the
  header of that file first.

✅ **Check:** the Tax page accepts an upload and you can download it back.

---

## Step 10 *(optional)* — Put it online with Vercel

1. Push your fork to **your own private GitHub repo**.
2. Vercel → **Add New → Project** → import it.
3. **Root Directory:** `finance-tracker`   ← important, the app is in a subfolder.
4. Add the **two** environment variables from Step 5 (same names, same values).
5. Deploy. Note your URL, e.g. `https://ledger-xyz.vercel.app`.
6. Supabase → **Authentication → URL Configuration**:
   - set **Site URL** to your Vercel URL,
   - add `https://<your-vercel-url>/auth/callback` to **Redirect URLs**
     (keep the localhost one for development).

✅ **Check:** open the Vercel URL → sign in with Google → Dashboard.
Visiting `/dashboard` while signed out must bounce you to `/login`.

---

## Step 11 — Know the free-tier gotchas

- **Auto-pause:** Supabase's free tier **pauses projects after ~7 days of
  inactivity**. A paused project makes the app time out or show a DNS error.
  Fix: *Supabase dashboard → Restore project* (takes a few minutes). Upgrading
  to Pro removes the pause. Occasional use of the app usually avoids it.
- **Backups:** the free tier has no point-in-time recovery. Periodically
  export your data (*Table Editor → Export*, or `pg_dump`) and keep it
  **somewhere private**, never in git.
- **Updates:** `git pull`, then `npm install`, then run any new file in
  `finance-tracker/supabase/upgrades/` once in the SQL Editor (each is safe to re-run).
  Installed before **Nov 2026**? Run `upgrades/2026-11-bank-formats.sql` to enable *Add any bank*.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Google says `redirect_uri_mismatch` | The URI in Google Cloud isn't exactly `https://<ref>.supabase.co/auth/v1/callback` |
| After Google login you're sent back to `/login?error=…` | Step 4.7 URLs missing/wrong in Supabase, or your email isn't a Google *Test user* |
| `permission denied` / empty lists everywhere | `schema.sql` didn't fully run — redo Step 3 and its check |
| Page spins / `ENOTFOUND` / 504 | Supabase project is paused (Step 11) |
| Blank page, CSP errors in console | `NEXT_PUBLIC_SUPABASE_URL` was missing at **build** time — set it and redeploy |
| Tax upload fails | Storage policies missing — re-run the **STORAGE** section at the end of `schema.sql` |
| "Add a bank" says it couldn't save / `bank_formats` error | Run `supabase/upgrades/2026-11-bank-formats.sql` |

---

## Using Claude Code to do this

Open this repo in [Claude Code](https://claude.com/claude-code) and say:

> **Set up Ledger for me.**

Claude reads [`CLAUDE.md`](CLAUDE.md), which tells it to walk you through *this
exact guide* one step at a time: it explains each step, does what it safely
can (installing, checking, editing `.env.local`), tells you precisely what to
click for the parts only you can do (Supabase, Google, signing in), runs the
✅ Check, and **waits for your go-ahead before the next step**.
