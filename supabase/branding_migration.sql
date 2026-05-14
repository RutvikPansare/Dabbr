-- Extend providers table with branding fields
alter table public.providers
  add column if not exists slug text,
  add column if not exists logo_url text,
  add column if not exists accent_color text not null default '#F4622A',
  add column if not exists tagline text,
  add column if not exists support_whatsapp text,
  add column if not exists business_description text;

alter table public.providers
  add constraint providers_slug_format check (
    slug is null or (
      length(slug) >= 3 and length(slug) <= 30
      and slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
    )
  );

create unique index if not exists providers_slug_idx
  on public.providers (slug) where slug is not null;

-- Storage bucket for provider logos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('provider-logos', 'provider-logos', true, 2097152, array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do nothing;

-- Storage RLS policies
create policy "logos_public_read" on storage.objects
  for select using (bucket_id = 'provider-logos');

create policy "logos_provider_upload" on storage.objects
  for insert with check (
    bucket_id = 'provider-logos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "logos_provider_update" on storage.objects
  for update using (
    bucket_id = 'provider-logos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "logos_provider_delete" on storage.objects
  for delete using (
    bucket_id = 'provider-logos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );
