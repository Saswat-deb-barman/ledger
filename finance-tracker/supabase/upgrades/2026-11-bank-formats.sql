-- Upgrade for existing installs: adds the "Add any bank" feature.
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- (Fresh installs get this from schema.sql automatically.)

create table if not exists public.bank_formats (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  signature   text not null check (char_length(signature) <= 1000),
  config      jsonb not null check (octet_length(config::text) <= 2000),
  account_id  uuid references public.bank_accounts(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (owner_id, signature)
);

alter table public.bank_formats enable row level security;

drop policy if exists own_bank_formats on public.bank_formats;
create policy own_bank_formats on public.bank_formats
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Verify (expect: rls_on = true)
select relrowsecurity as rls_on from pg_class where oid = 'public.bank_formats'::regclass;
