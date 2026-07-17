-- ============================================================================
--  Ledger — Schema (Model B: monthly cash-flow spine)
--
--  Mental model (from a real spreadsheet):
--    The MONTH is the unit of truth.  in_hand = received − expenses, per month.
--    Income has two shapes:
--      • retainer  — recurring monthly, auto-fills until stopped, override-able
--      • project   — one-off, often (not always) invoiced
--    Expenses carry a light bucket (living / leisure / saving / other).
--    Invoices + projects still exist, but hang off income — they don't define it.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------- PROFILE (your default "Billed By" for PDFs) ----------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  email         text,
  phone         text,
  pan           text,
  address       text,
  default_bank  jsonb,
  created_at    timestamptz not null default now()
);

-- ---------- CLIENTS (Acme, Northwind, Globex, Pied Piper…) ----------
create table public.clients (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  invoice_prefix  text,
  gstin           text,
  pan             text,
  billing_address text,
  email           text,
  phone           text,
  created_at      timestamptz not null default now()
);

-- ---------- BANK ACCOUNTS (your accounts; invoices + statement imports both reference these) ----------
create table public.bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  account_name    text not null,           -- e.g. "HDFC - Primary"
  bank_name       text,
  account_holder  text,
  account_number  text,
  ifsc            text,
  branch          text,
  upi             text,
  is_default      boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now()
);
create index on public.bank_accounts (owner_id);
-- at most one default account per owner
create unique index one_default_bank_account on public.bank_accounts (owner_id) where is_default;

-- ---------- PROJECTS (lightweight; declared before income_entries refs it) ----------
create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  client_id     uuid references public.clients(id) on delete set null,
  name          text not null,
  status        text not null default 'active'
                  check (status in ('active','on_hold','completed','archived')),
  agreed_value  numeric(14,2),
  currency      text not null default 'INR',
  notes         text,
  created_at    timestamptz not null default now()
);

-- ---------- INVOICES (declared before income_entries refs it) ----------
create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  invoice_number  text not null,
  fin_year        text not null,
  seq             int  not null,
  prefix          text not null,
  client_id       uuid references public.clients(id) on delete set null,
  project_id      uuid references public.projects(id) on delete set null,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  status          text not null default 'draft'
                    check (status in ('draft','sent','paid','overdue','cancelled')),
  issue_date      date not null default current_date,
  due_date        date,
  paid_date       date,
  currency        text not null default 'INR',
  subtotal        numeric(14,2) not null default 0,
  discount        numeric(14,2) not null default 0,
  tax_rate        numeric(5,2)  not null default 0,
  tax_amount      numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  billed_by       jsonb,
  bank_details    jsonb,
  notes           text,
  terms           text,
  created_at      timestamptz not null default now(),
  unique (owner_id, invoice_number)
);
create index on public.invoices (owner_id, status);

create table public.invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  description  text not null,
  quantity     numeric(12,2) not null default 1,
  rate         numeric(14,2) not null default 0,
  amount       numeric(14,2) not null default 0,
  sort_order   int not null default 0
);
create index on public.invoice_items (invoice_id);

-- ============================================================================
--  INCOME SOURCES — a stream of money. The heart of Model B.
--    kind='retainer' -> auto-fills a monthly entry at default_amount
--    kind='project'  -> entries added as they happen
--    active_to set = "STOPPED"
-- ============================================================================
create table public.income_sources (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  client_id       uuid references public.clients(id) on delete set null,
  name            text not null,
  kind            text not null default 'retainer'
                    check (kind in ('retainer','project')),
  default_amount  numeric(14,2) not null default 0,
  currency        text not null default 'INR',
  active_from     date,
  active_to       date,
  status          text not null default 'active'
                    check (status in ('active','stopped','inactive','tbd')),
  notes           text,
  created_at      timestamptz not null default now()
);
create index on public.income_sources (owner_id, kind);

-- ============================================================================
--  INCOME ENTRIES — actual per-month money. Entry ALWAYS wins over default.
--    month = first day of month.  expected vs received keeps reconciliation.
-- ============================================================================
create table public.income_entries (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  source_id     uuid references public.income_sources(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete set null,
  invoice_id    uuid references public.invoices(id) on delete set null,
  month         date not null,
  label         text,
  expected      numeric(14,2) not null default 0,
  received      numeric(14,2) not null default 0,
  is_received   boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (source_id, month)
);
create index on public.income_entries (owner_id, month);

-- ---------- EXPENSES (light bucket taxonomy) ----------
create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  month         date not null,
  bucket        text not null default 'living'
                  check (bucket in ('living','leisure','saving','other')),
  description   text,
  amount        numeric(14,2) not null default 0,
  currency      text not null default 'INR',
  created_at    timestamptz not null default now()
);
create index on public.expenses (owner_id, month);

-- ============================================================================
--  BANK RECONCILIATION — statement uploads, normalized + classified.
--    account_id points at the existing bank_accounts table (already used by
--    invoices for "pay to" details) rather than a separate accounts concept.
--    matched_income_id is reserved for a later pass that ties credits back
--    to income_entries — this phase focuses on triage/classification.
-- ============================================================================
create table public.statement_imports (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  account_id      uuid references public.bank_accounts(id) on delete set null,
  bank            text not null,                 -- 'yes' | 'axis' | 'kotak'
  file_name       text not null,
  period_from     date,
  period_to       date,
  row_count       int not null default 0,
  duplicate_count int not null default 0,        -- rows skipped as already-present
  uploaded_at     timestamptz not null default now()
);
create index on public.statement_imports (owner_id, uploaded_at desc);

create table public.bank_txns (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  account_id    uuid references public.bank_accounts(id) on delete set null,
  import_id     uuid references public.statement_imports(id) on delete set null,
  txn_date      date not null,
  description   text,
  reference     text,
  amount        numeric(14,2) not null,          -- always positive
  direction     text not null check (direction in ('credit','debit')),
  balance       numeric(14,2),
  merchant      text,                            -- extracted counterparty
  tier          text not null                    -- 'small' | 'medium' | 'large'
                  check (tier in ('small','medium','large')),
  tag           text,                            -- from tag_rules or manual
  -- dedupe fingerprint: same account + date + amount + balance = same txn
  fingerprint   text not null,
  reconciled    boolean not null default false,  -- reserved for the matching pass
  matched_income_id uuid references public.income_entries(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (owner_id, fingerprint)
);
create index on public.bank_txns (owner_id, txn_date desc);
create index on public.bank_txns (owner_id, tier);
create index on public.bank_txns (owner_id, direction);
create index on public.bank_txns (owner_id, tag);

-- ---------- TAG RULES (keyword → tag, auto-applied on every future import) ----------
create table public.tag_rules (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  keyword     text not null,                     -- matched case-insensitively vs description/merchant
  tag         text not null,                     -- 'income' | 'living' | 'leisure' | ...
  created_at  timestamptz not null default now(),
  unique (owner_id, keyword)
);

-- ---------- TRIAGE ROLL-UP VIEW ----------
create or replace view public.v_txn_triage
with (security_invoker = true) as
select owner_id, direction, tier, count(*) as n, sum(amount) as total
from public.bank_txns
group by owner_id, direction, tier;

-- ---------- MERCHANT ROLL-UP (for "where money goes" + rule suggestions) ----------
create or replace view public.v_merchant_rollup
with (security_invoker = true) as
select owner_id, direction, coalesce(merchant,'(unknown)') as merchant,
       count(*) as n, sum(amount) as total, max(tag) as tag
from public.bank_txns
group by owner_id, direction, coalesce(merchant,'(unknown)');

-- ============================================================================
--  GAP-FREE INVOICE NUMBERING (carried over from v1)
-- ============================================================================
create table public.invoice_counters (
  owner_id  uuid not null references auth.users(id) on delete cascade,
  prefix    text not null,
  fin_year  text not null,
  last_seq  int  not null default 0,
  primary key (owner_id, prefix, fin_year)
);

create or replace function public.next_invoice_number(p_prefix text, p_fin_year text)
returns table (invoice_number text, seq int, out_fin_year text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_seq int;
begin
  -- RETURNS TABLE columns become implicit plpgsql variables for the whole
  -- function body, so naming one `fin_year` collided with
  -- invoice_counters.fin_year everywhere that column is referenced
  -- unqualified below — including the ON CONFLICT target list, which (unlike
  -- an INSERT column list) is parsed as expressions and so is also subject
  -- to plpgsql's ambiguous-variable resolution ("column reference \"fin_year\"
  -- is ambiguous"). Renamed the output column instead of chasing every call
  -- site that needed qualifying.
  insert into public.invoice_counters (owner_id, prefix, fin_year, last_seq)
    values (v_uid, p_prefix, p_fin_year, 0)
    on conflict (owner_id, prefix, fin_year) do nothing;
  update public.invoice_counters set last_seq = last_seq + 1
    where owner_id = v_uid and prefix = p_prefix and fin_year = p_fin_year
    returning last_seq into v_seq;
  return query select
    p_prefix || '/' || p_fin_year || '/' || lpad(v_seq::text, 4, '0'), v_seq, p_fin_year;
end; $$;

-- ============================================================================
--  RETAINER AUTO-FILL — seeds a month's entries from source defaults, but
--  never overwrites an existing (possibly overridden) entry.
-- ============================================================================
create or replace function public.ensure_retainer_entries(p_month date)
returns int
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_count int := 0; v_m date := date_trunc('month', p_month)::date;
begin
  insert into public.income_entries (owner_id, source_id, month, expected)
  select s.owner_id, s.id, v_m, s.default_amount
  from public.income_sources s
  where s.owner_id = v_uid
    and s.kind = 'retainer'
    and s.status = 'active'
    and (s.active_from is null or s.active_from <= v_m)
    and (s.active_to   is null or s.active_to   >= v_m)
  on conflict (source_id, month) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- ============================================================================
--  MONTHLY ROLL-UP VIEW — mirrors the Master Sheet
-- ============================================================================
create or replace view public.v_monthly
with (security_invoker = true) as
with inc as (
  select owner_id, month, sum(expected) as expected_in, sum(received) as received_in
  from public.income_entries group by owner_id, month
),
exp as (
  select owner_id, month, sum(amount) as expenses
  from public.expenses group by owner_id, month
)
select
  coalesce(inc.owner_id, exp.owner_id)                        as owner_id,
  coalesce(inc.month, exp.month)                              as month,
  coalesce(inc.expected_in, 0)                                as expected_in,
  coalesce(inc.received_in, 0)                                as received_in,
  coalesce(exp.expenses, 0)                                   as expenses,
  coalesce(inc.received_in,0) - coalesce(exp.expenses,0)      as in_hand
from inc
full outer join exp on inc.owner_id = exp.owner_id and inc.month = exp.month;

-- ============================================================================
--  ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles         enable row level security;
alter table public.clients          enable row level security;
alter table public.projects         enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_items    enable row level security;
alter table public.income_sources   enable row level security;
alter table public.income_entries   enable row level security;
alter table public.expenses         enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.bank_accounts     enable row level security;
alter table public.statement_imports enable row level security;
alter table public.bank_txns         enable row level security;
alter table public.tag_rules         enable row level security;

create policy own_profiles       on public.profiles       using (id = auth.uid()) with check (id = auth.uid());
create policy own_clients        on public.clients        using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_projects       on public.projects       using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_invoices       on public.invoices       using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_income_sources on public.income_sources using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_income_entries on public.income_entries using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_expenses       on public.expenses       using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_counters       on public.invoice_counters using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_invoice_items  on public.invoice_items
  using (exists (select 1 from public.invoices i where i.id = invoice_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from public.invoices i where i.id = invoice_id and i.owner_id = auth.uid()));
create policy own_bank_accounts on public.bank_accounts
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_statement_imports on public.statement_imports
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_bank_txns on public.bank_txns
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_tag_rules on public.tag_rules
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
