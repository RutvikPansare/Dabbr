-- Razorpay billing integration for Dabbr app subscriptions.

alter table public.providers
  add column if not exists trial_started_at timestamptz default now(),
  add column if not exists is_subscribed boolean not null default false,
  add column if not exists subscription_plan text check (subscription_plan in ('starter', 'pro')),
  add column if not exists subscription_status text not null default 'trial' check (subscription_status in ('trial', 'active', 'past_due', 'cancelled')),
  add column if not exists subscription_current_period_end timestamptz,
  add column if not exists razorpay_customer_id text;

create table if not exists public.billing_transactions (
  id uuid primary key default uuid_generate_v4(),
  provider_id uuid references public.providers(id) on delete set null,
  plan text not null check (plan in ('starter', 'pro')),
  source text not null default 'app' check (source in ('landing', 'app', 'paywall')),
  amount integer not null,
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'cancelled')),
  reference_id text not null unique,
  razorpay_order_id text unique,
  razorpay_payment_link_id text unique,
  razorpay_payment_id text,
  razorpay_event_id text unique,
  payment_link_url text,
  customer_email text,
  customer_phone text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table public.billing_transactions
  add column if not exists razorpay_order_id text unique;

alter table public.billing_transactions enable row level security;

drop policy if exists "billing_transactions: provider reads own" on public.billing_transactions;
create policy "billing_transactions: provider reads own"
  on public.billing_transactions
  for select
  using (provider_id = auth.uid());

-- Writes are done by server routes with the Supabase service role.
