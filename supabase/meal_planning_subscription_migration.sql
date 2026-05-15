-- Dabbr meal planning + subscriptions migration
-- Run this in Supabase SQL editor after backing up production data.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1) Customer meal slot refactor
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists meal_slots text[] not null default array['lunch']::text[];

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customers'
      and column_name = 'meal_timing'
  ) then
    update public.customers
    set meal_slots = case
      when meal_timing = 'dinner' then array['dinner']::text[]
      when meal_timing = 'both' then array['lunch', 'dinner']::text[]
      else array['lunch']::text[]
    end
    where meal_slots is null
       or meal_slots = '{}'::text[]
       or meal_slots = array['lunch']::text[];
  end if;
end $$;

alter table public.customers
  drop constraint if exists customers_meal_slots_check;

alter table public.customers
  add constraint customers_meal_slots_check
  check (
    array_length(meal_slots, 1) >= 1
    and meal_slots <@ array['breakfast', 'lunch', 'dinner']::text[]
  );

-- ---------------------------------------------------------------------------
-- 2) Reusable meal plans
-- ---------------------------------------------------------------------------
create table if not exists public.meal_plans (
  id              uuid primary key default uuid_generate_v4(),
  provider_id     uuid not null references public.providers(id) on delete cascade,
  name            text not null,
  meal_slots      text[] not null default array['lunch']::text[],
  plan_type       text not null check (plan_type in ('veg', 'nonveg')),
  frequency       text not null check (frequency in ('daily', 'alternate')),
  monthly_price   numeric(10,2) not null default 0,
  active_days     integer not null default 30 check (active_days > 0),
  description     text,
  status          text not null default 'active' check (status in ('active', 'inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint meal_plans_slots_check check (
    array_length(meal_slots, 1) >= 1
    and meal_slots <@ array['breakfast', 'lunch', 'dinner']::text[]
  )
);

alter table public.meal_plans enable row level security;

drop policy if exists "meal_plans: provider owns" on public.meal_plans;
create policy "meal_plans: provider owns"
  on public.meal_plans
  for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

create unique index if not exists meal_plans_provider_name_key
  on public.meal_plans (provider_id, lower(name));

-- Seed one reusable plan per provider + migrated structure.
insert into public.meal_plans (
  provider_id,
  name,
  meal_slots,
  plan_type,
  frequency,
  monthly_price,
  active_days,
  description,
  status
)
select distinct
  c.provider_id,
  concat(
    case c.plan_type when 'nonveg' then 'Non-Veg' else 'Veg' end,
    ' ',
    case
      when c.meal_slots @> array['breakfast']::text[]
       and c.meal_slots @> array['lunch']::text[]
       and c.meal_slots @> array['dinner']::text[] then 'Full Day'
      when c.meal_slots @> array['breakfast']::text[]
       and c.meal_slots @> array['dinner']::text[] then 'Breakfast + Dinner'
      when c.meal_slots @> array['lunch']::text[]
       and c.meal_slots @> array['dinner']::text[] then 'Lunch + Dinner'
      when c.meal_slots @> array['breakfast']::text[] then 'Breakfast'
      when c.meal_slots @> array['dinner']::text[] then 'Dinner'
      else 'Lunch'
    end,
    case c.frequency when 'alternate' then ' Alternate' else '' end
  ) as name,
  c.meal_slots,
  c.plan_type,
  c.frequency,
  max(c.price_per_month) as monthly_price,
  30 as active_days,
  'Migrated from existing customer subscriptions' as description,
  'active' as status
from public.customers c
group by c.provider_id, c.meal_slots, c.plan_type, c.frequency
having not exists (
  select 1 from public.meal_plans existing
  where existing.provider_id = c.provider_id
    and lower(existing.name) = lower(concat(
      case c.plan_type when 'nonveg' then 'Non-Veg' else 'Veg' end,
      ' ',
      case
        when c.meal_slots @> array['breakfast']::text[]
         and c.meal_slots @> array['lunch']::text[]
         and c.meal_slots @> array['dinner']::text[] then 'Full Day'
        when c.meal_slots @> array['breakfast']::text[]
         and c.meal_slots @> array['dinner']::text[] then 'Breakfast + Dinner'
        when c.meal_slots @> array['lunch']::text[]
         and c.meal_slots @> array['dinner']::text[] then 'Lunch + Dinner'
        when c.meal_slots @> array['breakfast']::text[] then 'Breakfast'
        when c.meal_slots @> array['dinner']::text[] then 'Dinner'
        else 'Lunch'
      end,
      case c.frequency when 'alternate' then ' Alternate' else '' end
    ))
);

-- ---------------------------------------------------------------------------
-- 3) Subscriptions
-- MVP: one active subscription per customer.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
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

drop policy if exists "subscriptions: provider owns" on public.subscriptions;
create policy "subscriptions: provider owns"
  on public.subscriptions
  for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

create unique index if not exists subscriptions_one_active_per_customer
  on public.subscriptions (customer_id)
  where status in ('active', 'paused');

insert into public.subscriptions (
  provider_id,
  customer_id,
  meal_plan_id,
  status,
  start_date
)
select
  c.provider_id,
  c.id,
  mp.id,
  case when c.status = 'paused' then 'paused' else 'active' end,
  c.created_at::date
from public.customers c
join public.meal_plans mp
  on mp.provider_id = c.provider_id
 and mp.plan_type = c.plan_type
 and mp.frequency = c.frequency
 and mp.meal_slots = c.meal_slots
where c.status in ('active', 'paused')
  and not exists (
    select 1 from public.subscriptions s
    where s.customer_id = c.id and s.status in ('active', 'paused')
  );

-- Subscription-level pauses. Current UI can still use customer-level pauses;
-- this table future-proofs the new subscription model without partial-slot pauses.
create table if not exists public.subscription_pauses (
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

drop policy if exists "subscription_pauses: provider owns" on public.subscription_pauses;
create policy "subscription_pauses: provider owns"
  on public.subscription_pauses
  for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4) Daily menu planner
-- ---------------------------------------------------------------------------
create table if not exists public.daily_menus (
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

create unique index if not exists daily_menus_provider_date_slot_type_key
  on public.daily_menus (provider_id, menu_date, meal_slot, coalesce(plan_type, 'any'));

alter table public.daily_menus enable row level security;

drop policy if exists "daily_menus: provider owns" on public.daily_menus;
create policy "daily_menus: provider owns"
  on public.daily_menus
  for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

create table if not exists public.menu_quick_tags (
  id            uuid primary key default uuid_generate_v4(),
  provider_id   uuid not null references public.providers(id) on delete cascade,
  meal_slot     text not null check (meal_slot in ('breakfast', 'lunch', 'dinner')),
  plan_type     text check (plan_type in ('veg', 'nonveg')),
  label         text not null check (length(trim(label)) > 0),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists menu_quick_tags_provider_slot_type_idx
  on public.menu_quick_tags (provider_id, meal_slot, coalesce(plan_type, 'any'), sort_order);

create unique index if not exists menu_quick_tags_provider_slot_type_label_key
  on public.menu_quick_tags (provider_id, meal_slot, coalesce(plan_type, 'any'), lower(trim(label)));

alter table public.menu_quick_tags enable row level security;

drop policy if exists "menu_quick_tags: provider owns" on public.menu_quick_tags;
create policy "menu_quick_tags: provider owns"
  on public.menu_quick_tags
  for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5) Helper functions updated for subscription model
-- ---------------------------------------------------------------------------
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

-- Keep balance day decrement intentionally broad and operational.
-- It decrements customer balance for customers with active subscriptions.
create or replace function public.decrement_balance_for_today()
returns void
language plpgsql
security definer
as $$
begin
  update public.customers c
  set balance_days = greatest(0, c.balance_days - case
    when mp.frequency = 'daily' then 1.0
    when mp.frequency = 'alternate' then 0.5
    else 0
  end)
  from public.subscriptions s
  join public.meal_plans mp on mp.id = s.meal_plan_id
  where s.customer_id = c.id
    and public.is_subscription_active_today(s.id) = true;
end;
$$;
