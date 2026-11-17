-- Explicit, revocable bearer access to an immutable whitelist of draft points.
-- Existing saved routes stay private. No link is created by this migration.
set local lock_timeout = '5s';
create schema if not exists route_private;
revoke all on schema route_private from public, anon, authenticated;

create function route_private.share_point(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
 if jsonb_typeof(p) is distinct from 'object'
 or jsonb_typeof(p->'label') is distinct from 'string'
 or char_length(btrim(p->>'label')) not between 1 and 180
 or jsonb_typeof(p->'lat') is distinct from 'number'
 or jsonb_typeof(p->'lng') is distinct from 'number' then
  raise exception 'Revisa las direcciones y coordenadas antes de compartir.' using errcode='22023';
 end if;
 if (p->>'lat')::numeric not between -90 and 90 or (p->>'lng')::numeric not between -180 and 180 then
  raise exception 'Una coordenada no es válida.' using errcode='22023';
 end if;
 return jsonb_build_object('label',btrim(p->>'label'),'lat',p->'lat','lng',p->'lng');
end $$;
revoke all on function route_private.share_point(jsonb) from public, anon, authenticated;

create function route_private.share_vehicle(v jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare k text; maximum numeric; clean jsonb := '{}'::jsonb;
begin
 if jsonb_typeof(v) is distinct from 'object' then
  raise exception 'Faltan las medidas del camión. Calcula y guarda de nuevo antes de compartir.' using errcode='22023';
 end if;
 foreach k in array array['heightM','widthM','lengthM','grossWeightT','axleWeightT','axleCount','payloadCapacityT'] loop
  if k in ('axleCount','payloadCapacityT') and not (v ? k) then continue; end if;
  maximum := case k when 'heightM' then 10 when 'widthM' then 5 when 'lengthM' then 30 when 'grossWeightT' then 100 when 'axleWeightT' then 30 when 'axleCount' then 12 else 100 end;
  if jsonb_typeof(v->k) is distinct from 'number' or (v->>k)::numeric <= 0 or (v->>k)::numeric > maximum then
   raise exception 'Revisa las medidas y el peso del camión antes de compartir.' using errcode='22023';
  end if;
  if k='axleCount' and ((v->>k)::numeric < 2 or (v->>k)::numeric <> trunc((v->>k)::numeric)) then
   raise exception 'El número de ejes no es válido.' using errcode='22023';
  end if;
  if k='payloadCapacityT' and (v->>k)::numeric <> round((v->>k)::numeric,3) then
   raise exception 'La capacidad de carga admite hasta tres decimales.' using errcode='22023';
  end if;
  clean := clean || jsonb_build_object(k,v->k);
 end loop;
 if v ? 'configuration' then
  if jsonb_typeof(v->'configuration') is distinct from 'string' or not (v ? 'axleCount') or (v->>'axleCount')::numeric <> case v->>'configuration'
when 'C2' then 2
when 'C3' then 3
when 'C2-R2' then 4
when 'C3-R2' then 5
when 'C3-R3' then 6
when 'C2-R3' then 5
when 'T2-S1' then 3
when 'T2-S2' then 4
when 'T3-S2' then 5
when 'T3-S3' then 6
when 'T2-S3' then 5
when 'T3-S1' then 4
when 'T2-S1-R2' then 5
when 'T2-S1-R3' then 6
when 'T2-S2-R2' then 6
when 'T3-S1-R2' then 6
when 'T3-S1-R3' then 7
when 'T3-S2-R2' then 7
when 'T3-S2-R4' then 9
when 'T3-S2-R3' then 8
when 'T3-S3-S2' then 8
when 'T2-S2-S2' then 6
when 'T3-S2-S2' then 7
   else -1 end then
   raise exception 'La configuración del camión no coincide con sus ejes.' using errcode='22023';
  end if;
  clean := clean || jsonb_build_object('configuration',v->'configuration');
 end if;
 return clean;
end $$;
revoke all on function route_private.share_vehicle(jsonb) from public, anon, authenticated;

create table public.route_share_links (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 route_id uuid not null references public.saved_routes(id) on delete cascade,
 token_hash bytea not null unique,
 snapshot jsonb not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 check (expires_at > created_at)
);
create index route_share_links_owner_idx on public.route_share_links(owner_id);
create index route_share_links_route_idx on public.route_share_links(route_id);
alter table public.route_share_links enable row level security;
revoke all on public.route_share_links from public, anon, authenticated;
grant select(id,owner_id,route_id,created_at,expires_at,revoked_at) on public.route_share_links to authenticated;
create policy share_links_owner_metadata on public.route_share_links for select to authenticated using ((select auth.uid())=owner_id);

-- SECURITY DEFINER is intentional: only these narrow RPCs can access the private
-- snapshot/hash. Each write checks auth.uid() plus ownership; read requires a
-- high-entropy bearer token and returns no account or original route identifiers.
create function public.create_route_share_link(p_route_id uuid, p_expires_hours integer default 24)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 owner_uuid uuid := auth.uid(); r public.saved_routes%rowtype; pts jsonb;
 draft jsonb; token text; share_id uuid; expiry timestamptz; m text; prefs jsonb;
begin
 if owner_uuid is null then raise exception 'Inicia sesión para compartir.' using errcode='28000'; end if;
 if p_expires_hours is null or p_expires_hours not between 1 and 168 then
  raise exception 'La caducidad debe estar entre 1 y 168 horas.' using errcode='22023';
 end if;
 select * into r from public.saved_routes where id=p_route_id and owner_id=owner_uuid and status <> 'archived' for update;
 if not found then raise exception 'La ruta no está disponible en tu cuenta.' using errcode='22023'; end if;
 if (select count(*) from public.route_share_links where route_id=r.id and revoked_at is null and expires_at>statement_timestamp())>=10 then
  raise exception 'Esta ruta ya tiene 10 enlaces activos. Revoca uno antes de crear otro.' using errcode='22023';
 end if;
 m:=r.route_metadata->>'mode';
 if m is null or m not in ('delivery','truck') or char_length(btrim(r.name)) not between 1 and 120 then
  raise exception 'Calcula y guarda de nuevo esta ruta antes de compartir.' using errcode='22023';
 end if;
 if (select count(*) from public.route_stops where route_id=r.id)>48 then
  raise exception 'El proveedor admite hasta 48 paradas intermedias. No se omitió ninguna entrega.' using errcode='22023';
 end if;
 if exists(select 1 from public.route_stops where route_id=r.id and owner_id<>owner_uuid) then
  raise exception 'Revisa las paradas antes de compartir.' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(route_private.share_point(location) order by sequence),'[]'::jsonb) into pts from public.route_stops where route_id=r.id;
 prefs:=r.route_metadata#>'{result,preferences}';
 draft:=jsonb_build_object('schemaVersion',1,'name',btrim(r.name),'mode',m,
  'origin',route_private.share_point(r.origin),'destination',route_private.share_point(r.destination),'stops',pts,
  'vehicle',case when m='truck' then route_private.share_vehicle(r.route_metadata->'vehicle') else 'null'::jsonb end,
  'preferences',jsonb_build_object('avoidTolls',coalesce(prefs->'avoidTolls'='true'::jsonb,false),'avoidHighways',coalesce(prefs->'avoidHighways'='true'::jsonb,false)));
 token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
 expiry:=statement_timestamp()+make_interval(hours=>p_expires_hours);
 insert into public.route_share_links(owner_id,route_id,token_hash,snapshot,expires_at)
 values(owner_uuid,r.id,sha256(convert_to(token,'UTF8')),draft,expiry) returning id into share_id;
 return jsonb_build_object('id',share_id,'token',token,'expiresAt',expiry);
end $$;
revoke all on function public.create_route_share_link(uuid,integer) from public, anon, authenticated;
grant execute on function public.create_route_share_link(uuid,integer) to authenticated;

create function public.revoke_route_share_link(p_share_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesión para revocar el enlace.' using errcode='28000'; end if;
 update public.route_share_links set revoked_at=coalesce(revoked_at,statement_timestamp()) where id=p_share_id and owner_id=auth.uid();
 return found;
end $$;
revoke all on function public.revoke_route_share_link(uuid) from public, anon, authenticated;
grant execute on function public.revoke_route_share_link(uuid) to authenticated;

create function public.read_route_share_link(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if p_token is null or char_length(p_token)<>64 or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
 return (select jsonb_build_object('draft',s.snapshot,'expiresAt',s.expires_at)
 from public.route_share_links s join public.saved_routes r on r.id=s.route_id and r.owner_id=s.owner_id
 where s.token_hash=sha256(convert_to(p_token,'UTF8')) and s.revoked_at is null and s.expires_at>statement_timestamp() and r.status<>'archived');
end $$;
revoke all on function public.read_route_share_link(text) from public, anon, authenticated;
grant execute on function public.read_route_share_link(text) to anon, authenticated;

create function route_private.revoke_archived_route_shares()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 update public.route_share_links set revoked_at=coalesce(revoked_at,statement_timestamp()) where route_id=new.id;
 return new;
end $$;
revoke all on function route_private.revoke_archived_route_shares() from public, anon, authenticated;
create trigger revoke_archived_route_shares after update of status on public.saved_routes
for each row when (new.status='archived' and old.status is distinct from new.status)
execute function route_private.revoke_archived_route_shares();
comment on table public.route_share_links is 'Opt-in expiring point snapshots. Bearer tokens are SHA-256 hashed; archiving permanently revokes existing links. Not a truck navigation or legal authorization.';
notify pgrst, 'reload schema';
