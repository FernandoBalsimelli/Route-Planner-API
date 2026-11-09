-- Additive migration: keep verified delivery locations private to their owner.
create table public.favorite_locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address_label text not null check (char_length(btrim(address_label)) between 1 and 180),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  plus_code text check (plus_code is null or char_length(plus_code) <= 16),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, lat, lng)
);
create index favorite_locations_owner_active_created_idx on public.favorite_locations(owner_id, archived, created_at desc);
alter table public.favorite_locations enable row level security;
create policy favorite_locations_owner_all on public.favorite_locations for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
revoke all on public.favorite_locations from anon;
grant select, insert, update on public.favorite_locations to authenticated;
