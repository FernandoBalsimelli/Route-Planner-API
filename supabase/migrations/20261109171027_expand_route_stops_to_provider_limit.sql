-- Match the hosted Directions limit: 50 points = origin + 48 stops + destination.
-- Existing routes, RLS, invoker privileges and idempotency are unchanged.
create or replace function public.save_route_with_stops(p_request_id uuid, p_route jsonb, p_stops jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  owner_uuid uuid := auth.uid();
  saved_uuid uuid;
  previous_fingerprint text;
  fingerprint text;
  vehicle_uuid uuid;
  point jsonb;
  route_name text;
begin
  if owner_uuid is null then raise exception 'Inicia sesión para guardar recorridos.' using errcode='28000'; end if;
  if p_request_id is null or p_route is null or jsonb_typeof(p_route)<>'object' or p_stops is null or jsonb_typeof(p_stops)<>'array' then
    raise exception 'Solicitud de guardado inválida.' using errcode='22023';
  end if;
  if jsonb_array_length(p_stops)>48 or pg_column_size(p_route)>4194304 then
    raise exception 'El recorrido supera los límites de guardado.' using errcode='22023';
  end if;
  route_name := btrim(p_route->>'name');
  if jsonb_typeof(p_route->'name') is distinct from 'string' or coalesce(char_length(route_name),0) not between 1 and 120 then
    raise exception 'Escribe un nombre de hasta 120 caracteres.' using errcode='22023';
  end if;
  if jsonb_typeof(p_route->'route_metadata') is distinct from 'object' then
    raise exception 'Faltan los datos del recorrido calculado.' using errcode='22023';
  end if;
  for point in select value from jsonb_array_elements(jsonb_build_array(p_route->'origin',p_route->'destination') || p_stops)
  loop
    if jsonb_typeof(point) is distinct from 'object' or jsonb_typeof(point->'lat') is distinct from 'number' or jsonb_typeof(point->'lng') is distinct from 'number' or jsonb_typeof(point->'label') is distinct from 'string' then
      raise exception 'Todos los puntos deben tener dirección y coordenadas confirmadas.' using errcode='22023';
    end if;
    if (point->>'lat')::numeric not between -90 and 90 or (point->>'lng')::numeric not between -180 and 180 or char_length(btrim(point->>'label')) not between 1 and 180 then
      raise exception 'Una dirección o coordenada del recorrido no es válida.' using errcode='22023';
    end if;
  end loop;
  vehicle_uuid := nullif(p_route->>'vehicle_id','')::uuid;
  if vehicle_uuid is not null and not exists(select 1 from public.vehicles where id=vehicle_uuid and owner_id=owner_uuid) then
    raise exception 'El vehículo seleccionado no está disponible en tu cuenta.' using errcode='22023';
  end if;
  fingerprint := md5(p_route::text || p_stops::text);
  insert into public.saved_routes(owner_id,vehicle_id,name,provider,origin,destination,status,route_metadata,client_request_id,request_fingerprint)
  values(owner_uuid,vehicle_uuid,route_name,'openrouteservice',p_route->'origin',p_route->'destination','planned',p_route->'route_metadata',p_request_id,fingerprint)
  on conflict(owner_id,client_request_id) where client_request_id is not null do nothing
  returning id into saved_uuid;
  if saved_uuid is null then
    select id,request_fingerprint into saved_uuid,previous_fingerprint from public.saved_routes where owner_id=owner_uuid and client_request_id=p_request_id;
    if previous_fingerprint is distinct from fingerprint then
      raise exception 'Esta solicitud ya se usó para otro recorrido. Vuelve a guardar con los datos actualizados.' using errcode='22023';
    end if;
    return saved_uuid;
  end if;
  insert into public.route_stops(route_id,owner_id,sequence,location)
    select saved_uuid,owner_uuid,ordinality::integer,value from jsonb_array_elements(p_stops) with ordinality;
  return saved_uuid;
end;
$$;
revoke all on function public.save_route_with_stops(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.save_route_with_stops(uuid,jsonb,jsonb) to authenticated;
