-- ============================================================
-- CUSTOMER ACCOUNTS MIGRATION
-- Optional account layer on top of magic-link access.
-- Run in Supabase SQL Editor.
-- ============================================================

-- Customer accounts (one per phone number)
create table if not exists public.customer_accounts (
  id            uuid primary key default uuid_generate_v4(),
  phone         text unique not null,  -- E.164: +919876543210
  display_name  text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists customer_accounts_phone_idx
  on public.customer_accounts (phone);

-- OTPs for phone verification
create table if not exists public.customer_otps (
  id          uuid primary key default uuid_generate_v4(),
  phone       text not null,
  otp_hash    text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists customer_otps_phone_idx
  on public.customer_otps (phone, used, expires_at);

-- Customer sessions (separate from Supabase provider sessions)
create table if not exists public.customer_sessions (
  id            uuid primary key default uuid_generate_v4(),
  account_id    uuid not null references public.customer_accounts (id) on delete cascade,
  session_token text unique not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists customer_sessions_token_idx
  on public.customer_sessions (session_token);

-- Link customers to accounts (nullable — magic-link customers stay unlinked)
alter table public.customers
  add column if not exists account_id uuid references public.customer_accounts (id);

create index if not exists customers_account_id_idx
  on public.customers (account_id)
  where account_id is not null;

-- RLS: service-role handles all ops server-side, so just enable RLS
-- (no customer-facing RLS policies needed — all reads go through service role)
alter table public.customer_accounts enable row level security;
alter table public.customer_otps enable row level security;
alter table public.customer_sessions enable row level security;

-- Cleanup job: purge expired OTPs and sessions (optional, run periodically)
-- select cron.schedule('cleanup-customer-auth', '0 3 * * *', $$
--   delete from public.customer_otps where expires_at < now() - interval '1 day';
--   delete from public.customer_sessions where expires_at < now();
-- $$);
