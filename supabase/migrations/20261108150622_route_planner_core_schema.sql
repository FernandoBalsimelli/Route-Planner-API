create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.fleets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  fleet_id uuid references public.fleets(id) on delete set null,
  name text not null,
  vehicle_type text not null check (vehicle_type in ('delivery','car','truck')),
  height_m numeric(6,2) check (height_m is null or height_m between 0 and 10),
  width_m numeric(6,2) check (width_m is null or width_m between 0 and 5),
  length_m numeric(6,2) check (length_m is null or length_m between 0 and 30),
  gross_weight_t numeric(7,2) check (gross_weight_t is null or gross_weight_t between 0 and 100),
  axle_weight_t numeric(7,2) check (axle_weight_t is null or axle_weight_t between 0 and 30),
  created_at timestamptz not null default now()
);
create table if not exists public.saved_routes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  name text not null,
  provider text not null default 'here',
  origin jsonb not null,
  destination jsonb not null,
  status text not null default 'draft' check (status in ('draft','planned','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.saved_routes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  location jsonb not null,
  created_at timestamptz not null default now(),
  unique(route_id, sequence)
);
create index if not exists fleets_owner_id_idx on public.fleets(owner_id);
create index if not exists vehicles_owner_id_idx on public.vehicles(owner_id);
create index if not exists saved_routes_owner_id_idx on public.saved_routes(owner_id);
create index if not exists route_stops_route_id_idx on public.route_stops(route_id);
alter table public.profiles enable row level security;
alter table public.fleets enable row level security;
alter table public.vehicles enable row level security;
alter table public.saved_routes enable row level security;
alter table public.route_stops enable row level security;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "fleets_owner_all" on public.fleets for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "vehicles_owner_all" on public.vehicles for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "saved_routes_owner_all" on public.saved_routes for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "route_stops_owner_all" on public.route_stops for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.fleets, public.vehicles, public.saved_routes, public.route_stops to authenticated;

