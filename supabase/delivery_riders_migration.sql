-- Delivery riders
create table if not exists public.delivery_riders (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  name text not null,
  whatsapp_number text not null,
  created_at timestamptz not null default now()
);

alter table public.delivery_riders enable row level security;

create policy "Providers manage their own riders"
  on public.delivery_riders for all
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());
