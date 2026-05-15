-- Provider holidays migration
-- Run in Supabase SQL Editor

-- 1. Add weekly off-days column to providers
--    Stored as int[] where 0=Sunday, 1=Monday, ..., 6=Saturday
alter table public.providers
  add column if not exists off_days int[] not null default '{}';

-- 2. Create provider_holidays table for one-off dates (Diwali, Independence Day, etc.)
create table if not exists public.provider_holidays (
  id          uuid        primary key default gen_random_uuid(),
  provider_id uuid        not null references public.providers(id) on delete cascade,
  date        date        not null,
  label       text,                          -- e.g. "Diwali", "Independence Day"
  created_at  timestamptz not null default now(),
  unique (provider_id, date)
);

-- 3. RLS — providers can only manage their own holidays
alter table public.provider_holidays enable row level security;

create policy "Providers manage their own holidays"
  on public.provider_holidays for all
  using  (provider_id = auth.uid())
  with check (provider_id = auth.uid());
