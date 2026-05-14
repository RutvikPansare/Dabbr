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
  meal_slots        text[] not null default array['lunch']::text[]
                    check (array_length(meal_slots, 1) >= 1 and meal_slots <@ array['breakfast', 'lunch', 'dinner']::text[]),
  price_per_month   numeric(10,2) not null default 0,
  status            text not null default 'active' check (status in ('active', 'paused', 'inactive')),
  balance_days      numeric(6,2) not null default 0,
  created_at        timestamptz not null default now(),
  notes             text,
  tags              text[] not null default '{}'
);

alter table public.customers enable row level security;

create policy "customers: provider owns"
  on public.customers
  for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

-- ============================================================
-- MEAL PLANS
-- Reusable subscription structures. They do not define dishes.
-- ============================================================
create table public.meal_plans (
  id              uuid primary key default uuid_generate_v4(),
  provider_id     uuid not null references public.providers(id) on delete cascade,
  name            text not null,
  meal_slots      text[] not null default array['lunch']::text[]
                  check (array_length(meal_slots, 1) >= 1 and meal_slots <@ array['breakfast', 'lunch', 'dinner']::text[]),
  plan_type       text not null check (plan_type in ('veg', 'nonveg')),
  frequency       text not null check (frequency in ('daily', 'alternate')),
  monthly_price   numeric(10,2) not null default 0,
  active_days     integer not null default 30 check (active_days > 0),
  description     text,
  status          text not null default 'active' check (status in ('active', 'inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.meal_plans enable row level security;

create policy "meal_plans: provider owns"
  on public.meal_plans
  for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

create unique index meal_plans_provider_name_key
  on public.meal_plans (provider_id, lower(name));

-- ============================================================
-- SUBSCRIPTIONS
-- MVP rule: one active or paused subscription per customer.
-- ============================================================
create table public.subscriptions (
  id             uuid primary key default uuid_generate_v4(),
  provider_id    uuid not null references public.providers(id) on delete cascade,
  customer_id    uuid not null references public.customers(id) on delete cascade,
  meal_plan_id   uuid not null references public.meal_plans(id),
  status         text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  start_date     date not null default current_date,
  paused_at      timestamptz,
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "subscriptions: provider owns"
  on public.subscriptions
  for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

create unique index subscriptions_one_active_per_customer
  on public.subscriptions (customer_id)
  where status in ('active', 'paused');

create table public.subscription_pauses (
  id               uuid primary key default uuid_generate_v4(),
  subscription_id  uuid not null references public.subscriptions(id) on delete cascade,
  provider_id      uuid not null references public.providers(id) on delete cascade,
  start_date       date not null,
  end_date         date not null,
  reason           text,
  created_at       timestamptz not null default now(),
  constraint subscription_pauses_dates_check check (end_date >= start_date)
);

alter table public.subscription_pauses enable row level security;

create policy "subscription_pauses: provider owns"
  on public.subscription_pauses
  for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

-- ============================================================
-- DAILY MENUS
-- Provider-controlled dishes for a day and meal slot.
-- ============================================================
create table public.daily_menus (
  id            uuid primary key default uuid_generate_v4(),
  provider_id   uuid not null references public.providers(id) on delete cascade,
  menu_date     date not null,
  meal_slot     text not null check (meal_slot in ('breakfast', 'lunch', 'dinner')),
  dish_name     text not null,
  plan_type     text check (plan_type in ('veg', 'nonveg')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.daily_menus enable row level security;

create policy "daily_menus: provider owns"
  on public.daily_menus
  for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

create unique index daily_menus_provider_date_slot_type_key
  on public.daily_menus (provider_id, menu_date, meal_slot, coalesce(plan_type, 'any'));

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
-- Returns true if customer has an active subscription and is not paused.
-- ============================================================
create or replace function public.is_subscription_active_today(p_subscription_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select
    s.status = 'active'
    and mp.status = 'active'
    and not exists (
      select 1 from public.subscription_pauses sp
      where sp.subscription_id = s.id
        and current_date between sp.start_date and sp.end_date
    )
    and not exists (
      select 1 from public.pauses p
      where p.customer_id = s.customer_id
        and current_date between p.start_date and p.end_date
    )
  from public.subscriptions s
  join public.meal_plans mp on mp.id = s.meal_plan_id
  where s.id = p_subscription_id;
$$;

create or replace function public.is_active_today(p_customer_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.subscriptions s
    join public.meal_plans mp on mp.id = s.meal_plan_id
    where s.customer_id = p_customer_id
      and s.status = 'active'
      and mp.status = 'active'
      and not exists (
        select 1 from public.subscription_pauses sp
        where sp.subscription_id = s.id
          and current_date between sp.start_date and sp.end_date
      )
      and not exists (
        select 1 from public.pauses p
        where p.customer_id = p_customer_id
          and current_date between p.start_date and p.end_date
      )
  );
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
  update public.customers c
  set balance_days = greatest(0, c.balance_days - case
    when mp.frequency = 'daily'     then 1.0
    when mp.frequency = 'alternate' then 0.5
    else 0
  end)
  from public.subscriptions s
  join public.meal_plans mp on mp.id = s.meal_plan_id
  where s.customer_id = c.id
    and public.is_subscription_active_today(s.id) = true;
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
