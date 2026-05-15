-- Menu quick tags for fast daily menu planning.
-- Run this after the meal planning/subscription migration.

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

insert into public.menu_quick_tags (provider_id, meal_slot, plan_type, label, sort_order)
select p.id, v.meal_slot, v.plan_type, v.label, v.sort_order
from public.providers p
cross join (
  values
    ('breakfast', null, 'Poha', 0),
    ('breakfast', null, 'Upma', 1),
    ('breakfast', null, 'Idli', 2),
    ('breakfast', null, 'Paratha', 3),
    ('breakfast', null, 'Dosa', 4),
    ('breakfast', 'veg', 'Aloo Paratha', 0),
    ('breakfast', 'veg', 'Paneer Paratha', 1),
    ('breakfast', 'veg', 'Moong Chilla', 2),
    ('breakfast', 'veg', 'Sabudana Khichdi', 3),
    ('breakfast', 'veg', 'Veg Sandwich', 4),
    ('breakfast', 'nonveg', 'Egg Bhurji', 0),
    ('breakfast', 'nonveg', 'Masala Omelette', 1),
    ('breakfast', 'nonveg', 'Boiled Eggs', 2),
    ('breakfast', 'nonveg', 'Egg Paratha', 3),
    ('breakfast', 'nonveg', 'Chicken Sandwich', 4),
    ('lunch', null, 'Dal Rice', 0),
    ('lunch', null, 'Roti', 1),
    ('lunch', null, 'Salad', 2),
    ('lunch', null, 'Curd', 3),
    ('lunch', null, 'Khichdi', 4),
    ('lunch', 'veg', 'Rajma', 0),
    ('lunch', 'veg', 'Chole', 1),
    ('lunch', 'veg', 'Paneer Butter Masala', 2),
    ('lunch', 'veg', 'Aloo Gobi', 3),
    ('lunch', 'veg', 'Bhindi Masala', 4),
    ('lunch', 'nonveg', 'Chicken Curry', 0),
    ('lunch', 'nonveg', 'Egg Curry', 1),
    ('lunch', 'nonveg', 'Fish Curry', 2),
    ('lunch', 'nonveg', 'Mutton Curry', 3),
    ('lunch', 'nonveg', 'Chicken Biryani', 4),
    ('dinner', null, 'Dal Tadka', 0),
    ('dinner', null, 'Jeera Rice', 1),
    ('dinner', null, 'Phulka', 2),
    ('dinner', null, 'Raita', 3),
    ('dinner', null, 'Soup', 4),
    ('dinner', 'veg', 'Paneer Bhurji', 0),
    ('dinner', 'veg', 'Mix Veg', 1),
    ('dinner', 'veg', 'Palak Paneer', 2),
    ('dinner', 'veg', 'Veg Pulao', 3),
    ('dinner', 'veg', 'Kadhi Pakora', 4),
    ('dinner', 'nonveg', 'Chicken Masala', 0),
    ('dinner', 'nonveg', 'Egg Curry', 1),
    ('dinner', 'nonveg', 'Keema', 2),
    ('dinner', 'nonveg', 'Fish Fry', 3),
    ('dinner', 'nonveg', 'Chicken Pulao', 4)
) as v(meal_slot, plan_type, label, sort_order)
where not exists (
  select 1 from public.menu_quick_tags existing
  where existing.provider_id = p.id
)
on conflict do nothing;
