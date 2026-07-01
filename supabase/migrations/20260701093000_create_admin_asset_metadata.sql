create table if not exists public.admin_asset_metadata (
  folder_path text not null,
  public_id text not null,
  alt text,
  alt_en text,
  tags text[] not null default '{}'::text[],
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (folder_path, public_id)
);

create index if not exists admin_asset_metadata_folder_path_idx
  on public.admin_asset_metadata (folder_path);

create index if not exists admin_asset_metadata_updated_at_idx
  on public.admin_asset_metadata (updated_at desc);

alter table public.admin_asset_metadata enable row level security;

drop policy if exists "admin_asset_metadata_select_service_role" on public.admin_asset_metadata;
drop policy if exists "admin_asset_metadata_insert_service_role" on public.admin_asset_metadata;
drop policy if exists "admin_asset_metadata_update_service_role" on public.admin_asset_metadata;
drop policy if exists "admin_asset_metadata_delete_service_role" on public.admin_asset_metadata;

create policy "admin_asset_metadata_select_service_role"
on public.admin_asset_metadata
for select
to service_role
using (true);

create policy "admin_asset_metadata_insert_service_role"
on public.admin_asset_metadata
for insert
to service_role
with check (true);

create policy "admin_asset_metadata_update_service_role"
on public.admin_asset_metadata
for update
to service_role
using (true)
with check (true);

create policy "admin_asset_metadata_delete_service_role"
on public.admin_asset_metadata
for delete
to service_role
using (true);
