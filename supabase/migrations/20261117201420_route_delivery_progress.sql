-- Opt-in manual progress. Append-only revisions preserve recovery history.
set local lock_timeout='5s';
create function public.delivery_sequences_valid(a integer[]) returns boolean
language sql immutable set search_path='' as $$
 select a is not null and coalesce(array_ndims(a),1)=1 and cardinality(a)<=49
 and not exists(select 1 from unnest(a) n where n is null or n<1 or n>49)
 and cardinality(a)=(select count(distinct n) from unnest(a) n)
$$;
revoke all on function public.delivery_sequences_valid(integer[]) from public,anon;
grant execute on function public.delivery_sequences_valid(integer[]) to authenticated;
create table public.route_delivery_events (
 route_id uuid not null references public.saved_routes(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 revision integer not null check(revision>0),
 route_snapshot text not null check(route_snapshot ~ '^[0-9a-f]{64}$'),
 completed_sequences integer[] not null default '{}' check(public.delivery_sequences_valid(completed_sequences)),
 created_at timestamptz not null default now(),
 primary key(route_id,revision)
);
create index route_delivery_events_owner_idx on public.route_delivery_events(owner_id);
alter table public.route_delivery_events enable row level security;
revoke all on public.route_delivery_events from public,anon,authenticated;
grant select,insert on public.route_delivery_events to authenticated;
create policy delivery_events_read_own on public.route_delivery_events for select to authenticated
 using((select auth.uid())=owner_id and exists(select 1 from public.saved_routes r where r.id=route_id and r.owner_id=(select auth.uid())));
create policy delivery_events_insert_own on public.route_delivery_events for insert to authenticated
 with check((select auth.uid())=owner_id and exists(select 1 from public.saved_routes r where r.id=route_id and r.owner_id=(select auth.uid()) and r.status<>'archived'));

create function public.route_delivery_progress(p_route_id uuid,p_completed integer[] default null,p_expected_revision integer default null,p_expected_snapshot text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 uid uuid:=auth.uid(); source_origin jsonb; source_destination jsonb; middle jsonb; identities jsonb; all_points jsonb; clean_points jsonb:='[]'::jsonb;
 p jsonb; snapshot text; latest public.route_delivery_events%rowtype; rev integer:=0; completed integer[]:='{}'; n integer; history jsonb;
begin
 if uid is null then raise exception 'Inicia sesión para consultar el avance.' using errcode='28000'; end if;
 -- The same parent lock serializes UI saves and soft-archive operations.
 select origin,destination into source_origin,source_destination from public.saved_routes
 where id=p_route_id and owner_id=uid and status<>'archived' for update;
 if not found then raise exception 'Esta ruta no está disponible en tu cuenta.' using errcode='22023'; end if;
 select coalesce(jsonb_agg(location order by sequence),'[]'::jsonb), coalesce(jsonb_agg(jsonb_build_object('id',id,'sequence',sequence) order by sequence),'[]'::jsonb) into middle,identities from public.route_stops where route_id=p_route_id and owner_id=uid;
 if jsonb_array_length(middle)>48 then raise exception 'Revisa el número de puntos del recorrido.' using errcode='22023'; end if;
 all_points:=jsonb_build_array(source_origin)||middle||jsonb_build_array(source_destination);
 for p in select value from jsonb_array_elements(all_points) loop
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'label') is distinct from 'string'
   or char_length(btrim(p->>'label')) not between 1 and 180 or jsonb_typeof(p->'lat') is distinct from 'number' or jsonb_typeof(p->'lng') is distinct from 'number' then
   raise exception 'Confirma todos los puntos y guarda la ruta antes de registrar avance.' using errcode='22023';
  end if;
  if (p->>'lat')::numeric not between -90 and 90 or (p->>'lng')::numeric not between -180 and 180 then
   raise exception 'Una coordenada de la ruta no es válida.' using errcode='22023';
  end if;
  clean_points:=clean_points||jsonb_build_array(jsonb_build_object('label',p->>'label','lat',p->'lat','lng',p->'lng'));
 end loop;
 n:=jsonb_array_length(clean_points)-1;
 snapshot:=encode(sha256(convert_to(clean_points::text||identities::text,'UTF8')),'hex');
 select * into latest from public.route_delivery_events where route_id=p_route_id and owner_id=uid order by revision desc limit 1;
 if found then rev:=latest.revision; end if;
 if p_completed is not null then
  if p_expected_revision is null or p_expected_revision<0 or p_expected_snapshot is distinct from snapshot then
   raise exception 'Los puntos cambiaron. Actualiza el avance y revisa la selección antes de guardar.' using errcode='40001';
  end if;
  if p_expected_revision<>rev then raise exception 'El avance cambió en otra sesión. Actualiza y revisa antes de guardar.' using errcode='40001'; end if;
  if not public.delivery_sequences_valid(p_completed) or exists(select 1 from unnest(p_completed) s where s>n) then
   raise exception 'La selección de entregas no es válida para esta ruta.' using errcode='22023';
  end if;
  select coalesce(array_agg(s order by s),'{}'::integer[]) into completed from unnest(p_completed) s;
  if rev=0 or latest.route_snapshot<>snapshot or latest.completed_sequences<>completed then
   insert into public.route_delivery_events(route_id,owner_id,revision,route_snapshot,completed_sequences)
   values(p_route_id,uid,rev+1,snapshot,completed) returning * into latest;
   rev:=latest.revision;
  end if;
 end if;
 completed:=case when latest.route_snapshot=snapshot then latest.completed_sequences else '{}'::integer[] end;
 select coalesce(jsonb_agg(jsonb_build_object('revision',h.revision,'completedSequences',h.completed_sequences,'samePoints',h.route_snapshot=snapshot,'createdAt',h.created_at) order by h.revision desc),'[]'::jsonb)
 into history from (select * from public.route_delivery_events where route_id=p_route_id and owner_id=uid order by revision desc limit 10) h;
 return jsonb_build_object('routeId',p_route_id,'snapshot',snapshot,'revision',rev,'stale',rev>0 and latest.route_snapshot<>snapshot,
  'completedSequences',completed,'points',clean_points,'history',history,'updatedAt',latest.created_at);
end $$;
revoke all on function public.route_delivery_progress(uuid,integer[],integer,text) from public,anon;
grant execute on function public.route_delivery_progress(uuid,integer[],integer,text) to authenticated;
comment on table public.route_delivery_events is 'Owner-scoped manual point completion, append-only through client privileges. Not proof of delivery, GPS arrival, legal authorization or an instruction to skip navigation points.';
notify pgrst,'reload schema';
