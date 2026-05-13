-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROVIDERS
-- Linked 1:1 with Supabase auth.users via id
-- ============================================================
create table public.providers (
  id          uuid primary key references auth.users(id) on delete cascade,
  phone       text,
  name        text not null,
  upi_id      text,
  created_at  timestamptz not null default now()
);

alter table public.providers enable row level security;

create policy "providers: own row only"
  on public.providers
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- CUSTOMERS
-- ============================================================
create table public.customers (
  id                uuid primary key default uuid_generate_v4(),
  provider_id       uuid not null references public.providers(id) on delete cascade,
  name              text not null,
  whatsapp_number   text not null,
  address           text,
  area              text,
  plan_type         text not null check (plan_type in ('veg', 'nonveg')),
  frequency         text not null check (frequency in ('daily', 'alternate')),
  price_per_month   numeric(10,2) not null default 0,
  status            text not null default 'active' check (status in ('active', 'paused', 'inactive')),
  balance_days      numeric(6,2) not null default 0,
  created_at        timestamptz not null default now()
);

alter table public.customers enable row level security;

create policy "customers: provider owns"
  on public.customers
  for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

-- ============================================================
-- PAUSES
-- ============================================================
create table public.pauses (
  id            uuid primary key default uuid_generate_v4(),
  customer_id   uuid not null references public.customers(id) on delete cascade,
  start_date    date not null,
  end_date      date not null,
  reason        text,
  constraint pauses_dates_check check (end_date >= start_date)
);

alter table public.pauses enable row level security;

-- Provider can manage pauses for their own customers
create policy "pauses: via customer ownership"
  on public.pauses
  for all
  using (
    exists (
      select 1 from public.customers c
      where c.id = customer_id and c.provider_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.customers c
      where c.id = customer_id and c.provider_id = auth.uid()
    )
  );

-- ============================================================
-- PAYMENTS
-- ============================================================
create table public.payments (
  id            uuid primary key default uuid_generate_v4(),
  customer_id   uuid not null references public.customers(id) on delete cascade,
  provider_id   uuid not null references public.providers(id) on delete cascade,
  amount        numeric(10,2) not null,
  recorded_at   timestamptz not null default now(),
  notes         text
);

alter table public.payments enable row level security;

create policy "payments: provider owns"
  on public.payments
  for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

-- ============================================================
-- HELPER FUNCTION: is_active_today(customer_id)
-- Returns true if status=active AND today is not in any pause range
-- ============================================================
create or replace function public.is_active_today(p_customer_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select
    c.status = 'active'
    and not exists (
      select 1 from public.pauses p
      where p.customer_id = p_customer_id
        and current_date between p.start_date and p.end_date
    )
  from public.customers c
  where c.id = p_customer_id;
$$;

-- ============================================================
-- TRIGGER: auto-decrement balance_days on delivery
-- Called via a scheduled job or manually; the function is
-- safe to call once per day.
-- ============================================================
create or replace function public.decrement_balance_for_today()
returns void
language plpgsql
security definer
as $$
begin
  update public.customers
  set balance_days = balance_days - case
    when frequency = 'daily'     then 1.0
    when frequency = 'alternate' then 0.5
    else 0
  end
  where public.is_active_today(id) = true;
end;
$$;

-- ============================================================
-- AUTO-CREATE provider row on first sign-in
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.providers (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
