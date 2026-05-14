-- ============================================================
-- CUSTOMER PORTAL MIGRATION
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Add cutoff settings to providers
-- cutoff_hour: the hour (0-23 in provider's timezone) after which changes
--              apply to the *following* delivery, not the next one
alter table public.providers
  add column if not exists cutoff_hour integer not null default 21
    check (cutoff_hour >= 0 and cutoff_hour < 24),
  add column if not exists cutoff_tz text not null default 'Asia/Kolkata';

-- ============================================================
-- CUSTOMER ACCESS TOKENS
-- One active token per customer (unique index enforces this).
-- Tokens are long, random, and revocable.
-- Architecture decision: separate table (not on customer row) so:
--   - revocation is a simple is_active=false flip
--   - multiple tokens possible in future (e.g. family access)
--   - audit trail via last_used_at
--   - expiry column can be added later without touching customers table
-- ============================================================
create table if not exists public.customer_access_tokens (
  id           uuid primary key default uuid_generate_v4(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  provider_id  uuid not null references public.providers(id) on delete cascade,
  token        text not null unique,
  is_active    boolean not null default true,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
  -- future: expires_at timestamptz
);

alter table public.customer_access_tokens enable row level security;

-- Providers can manage tokens for their own customers
create policy "tokens: provider owns"
  on public.customer_access_tokens
  for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

-- Enforce one active token per customer
create unique index if not exists customer_access_tokens_one_active_per_customer
  on public.customer_access_tokens (customer_id)
  where is_active = true;

-- ============================================================
-- CANCELLATION REQUESTS
-- Customers request cancellation → provider confirms.
-- Subscription stays active until provider approves.
-- ============================================================
create table if not exists public.cancellation_requests (
  id               uuid primary key default uuid_generate_v4(),
  subscription_id  uuid not null references public.subscriptions(id) on delete cascade,
  customer_id      uuid not null references public.customers(id) on delete cascade,
  provider_id      uuid not null references public.providers(id) on delete cascade,
  reason           text,
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected')),
  created_at       timestamptz not null default now()
);

alter table public.cancellation_requests enable row level security;

-- Provider sees cancellation requests for their customers
create policy "cancellation_requests: provider owns"
  on public.cancellation_requests
  for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

-- ============================================================
-- RLS POLICIES FOR CUSTOMER PORTAL (token-based access)
-- The portal uses the service-role key server-side, so RLS is
-- bypassed for data reads. These policies are for completeness
-- and future use if we add customer auth.
-- ============================================================

-- Allow the customer portal server-side code (service role) to:
--   • read customers by token lookup
--   • insert subscription_pauses
--   • insert cancellation_requests
-- No additional RLS needed since service role bypasses RLS.
