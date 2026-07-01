create table if not exists public.admin_asset_orders (
  folder_path text not null,
  public_id text not null,
  sort_order integer not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (folder_path, public_id)
);

create index if not exists admin_asset_orders_folder_path_idx
  on public.admin_asset_orders (folder_path);

create index if not exists admin_asset_orders_sort_order_idx
  on public.admin_asset_orders (sort_order);

alter table public.admin_asset_orders enable row level security;

drop policy if exists "admin_asset_orders_select_service_role" on public.admin_asset_orders;
drop policy if exists "admin_asset_orders_insert_service_role" on public.admin_asset_orders;
drop policy if exists "admin_asset_orders_update_service_role" on public.admin_asset_orders;
drop policy if exists "admin_asset_orders_delete_service_role" on public.admin_asset_orders;

create policy "admin_asset_orders_select_service_role"
on public.admin_asset_orders
for select
to service_role
using (true);

create policy "admin_asset_orders_insert_service_role"
on public.admin_asset_orders
for insert
to service_role
with check (true);

create policy "admin_asset_orders_update_service_role"
on public.admin_asset_orders
for update
to service_role
using (true)
with check (true);

create policy "admin_asset_orders_delete_service_role"
on public.admin_asset_orders
for delete
to service_role
using (true);
