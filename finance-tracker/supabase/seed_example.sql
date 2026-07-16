-- ============================================================================
--  Optional demo data — entirely fictional, so the app isn't empty on first
--  run. Run AFTER schema.sql and AFTER you've signed in once (so auth.users
--  has your row). Replace the owner id below with your auth user id:
--
--    select id from auth.users where email = 'you@example.com';
--
--  (In the Supabase SQL editor, replace :'owner' with the quoted uuid, or run
--  this file with psql:  psql "$DATABASE_URL" -v owner="'<your-uuid>'" -f seed_example.sql)
-- ============================================================================
\set owner 'PASTE-YOUR-AUTH-UID-HERE'

-- Example clients (all fictional)
insert into public.clients (owner_id, name, invoice_prefix) values
  (:'owner', 'Acme Studios',    'ACME'),
  (:'owner', 'Northwind Media', 'NWM'),
  (:'owner', 'Globex Learning', 'GLX');

-- Example retainers (monthly defaults)
insert into public.income_sources (owner_id, name, kind, default_amount, active_from, status) values
  (:'owner', 'Acme Studios — retainer',    'retainer', 100000, date_trunc('month', current_date)::date, 'active'),
  (:'owner', 'Northwind Media — retainer', 'retainer',  50000, date_trunc('month', current_date)::date, 'active');

-- Example one-off project income
insert into public.income_sources (owner_id, name, kind, default_amount, status) values
  (:'owner', 'Product launch video', 'project', 25000, 'active');

-- Example expense buckets for the current month (edit freely)
insert into public.expenses (owner_id, month, bucket, description, amount) values
  (:'owner', date_trunc('month', current_date)::date, 'living', 'Rent',        25000),
  (:'owner', date_trunc('month', current_date)::date, 'living', 'Electricity',  2500),
  (:'owner', date_trunc('month', current_date)::date, 'saving', 'Savings',     20000);

-- Then open /income for the current month — retainers auto-fill on page load.
