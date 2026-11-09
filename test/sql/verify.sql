do $$ begin
  if current_database() <> 'route_planner_ci' then raise exception 'This fixture is only allowed in route_planner_ci'; end if;
end $$;
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare
  owner_uuid uuid:=auth.uid();
  request_uuid uuid:=gen_random_uuid();
  route_uuid uuid;
  retry_uuid uuid;
  vehicle_uuid uuid;
  favorite_uuid uuid;
  route_data jsonb;
  stop_data jsonb;
  failed boolean:=false;
  affected integer;
begin
  insert into public.vehicles(owner_id,name,vehicle_type,height_m,width_m,length_m,gross_weight_t,axle_weight_t)
    values(owner_uuid,'Synthetic truck','truck',3.2,2.4,8,12,6) returning id into vehicle_uuid;
  begin
    insert into public.vehicles(owner_id,name,vehicle_type) values('00000000-0000-4000-8000-000000000002','Forbidden truck','truck');
  exception when insufficient_privilege then failed:=true;
  end;
  if not failed then raise exception 'Cross-owner vehicle insertion was allowed'; end if;

  route_data:=jsonb_build_object('name','Synthetic delivery route','vehicle_id',vehicle_uuid,
    'origin',jsonb_build_object('label','Origin','lat',25.67,'lng',-100.31),
    'destination',jsonb_build_object('label','Destination','lat',25.70,'lng',-100.34),
    'route_metadata',jsonb_build_object('mode','truck'));
  stop_data:='[{"label":"Stop A","lat":25.67000123,"lng":-100.3000456},{"label":"Stop B","lat":25.69,"lng":-100.33}]'::jsonb;
  route_uuid:=public.save_route_with_stops(request_uuid,route_data,stop_data);
  retry_uuid:=public.save_route_with_stops(request_uuid,route_data,stop_data);
  if route_uuid<>retry_uuid or (select count(*) from public.saved_routes where client_request_id=request_uuid)<>1 then raise exception 'Retry duplicated a route'; end if;
  if (select array_agg(location->>'label' order by sequence) from public.route_stops where route_id=route_uuid) is distinct from array['Stop A','Stop B'] then raise exception 'Stop order or completeness failed'; end if;
  if (select (location->>'lat')::numeric from public.route_stops where route_id=route_uuid and sequence=1)<>25.67000123 then raise exception 'Coordinates were rounded'; end if;

  failed:=false;
  begin perform public.save_route_with_stops(request_uuid,jsonb_set(route_data,'{name}','"Different route"'),stop_data);
  exception when invalid_parameter_value then failed:=true; end;
  if not failed then raise exception 'Request key accepted different content'; end if;
  failed:=false;
  begin perform public.save_route_with_stops(gen_random_uuid(),jsonb_set(route_data,'{name}','"Invalid route"'),'[{"label":"Invalid","lat":999,"lng":0}]');
  exception when invalid_parameter_value then failed:=true; end;
  if not failed or exists(select 1 from public.saved_routes where name='Invalid route') then raise exception 'Failed save left partial data'; end if;

  update public.saved_routes set status='archived' where id=route_uuid;
  if (select count(*) from public.route_stops where route_id=route_uuid)<>2 then raise exception 'Archiving lost deliveries'; end if;
  update public.saved_routes set status='planned' where id=route_uuid;
  insert into public.favorite_locations(owner_id,name,address_label,lat,lng) values(owner_uuid,'Synthetic branch','Public test location',25.721274,-100.325989) returning id into favorite_uuid;
  update public.favorite_locations set archived=true where id=favorite_uuid;
  insert into public.favorite_locations(owner_id,name,address_label,lat,lng,archived) values(owner_uuid,'Synthetic branch','Public test location',25.721274,-100.325989,false)
    on conflict(owner_id,lat,lng) do update set archived=false;
  if not exists(select 1 from public.favorite_locations where id=favorite_uuid and not archived) then raise exception 'Favorite restore failed'; end if;
  if has_table_privilege('authenticated','public.favorite_locations','DELETE') or has_table_privilege('anon','public.favorite_locations','SELECT') then raise exception 'Unexpected favorite privileges'; end if;
  if has_function_privilege('anon','public.save_route_with_stops(uuid,jsonb,jsonb)','EXECUTE') then raise exception 'Anonymous save RPC allowed'; end if;
  if exists(select 1 from pg_proc where oid='public.save_route_with_stops(uuid,jsonb,jsonb)'::regprocedure and prosecdef) then raise exception 'Save RPC elevates privileges'; end if;

  -- Exercise the provider-sized route through the same transaction and RLS.
  select jsonb_agg(jsonb_build_object('label','Delivery '||n,'lat',25.67+n*0.0001,'lng',-100.31) order by n)
    into stop_data from generate_series(1,48) n;
  request_uuid:=gen_random_uuid();
  route_data:=jsonb_set(route_data,'{name}','"48 deliveries"');
  route_uuid:=public.save_route_with_stops(request_uuid,route_data,stop_data);
  retry_uuid:=public.save_route_with_stops(request_uuid,route_data,stop_data);
  if route_uuid<>retry_uuid or (select count(*) from public.route_stops where route_id=route_uuid)<>48 then raise exception 'Large route lost stops or retry duplicated it'; end if;
  if (select location->>'label' from public.route_stops where route_id=route_uuid and sequence=48)<>'Delivery 48' then raise exception 'Last delivery missing'; end if;
  failed:=false;
  begin perform public.save_route_with_stops(gen_random_uuid(),jsonb_set(route_data,'{name}','"49 deliveries rejected"'),stop_data||jsonb_build_array(stop_data->0));
  exception when invalid_parameter_value then failed:=true; end;
  if not failed or exists(select 1 from public.saved_routes where name='49 deliveries rejected') then raise exception 'Oversized route was partly saved'; end if;

  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  if exists(select 1 from public.saved_routes where id=route_uuid) or exists(select 1 from public.vehicles where id=vehicle_uuid) or exists(select 1 from public.favorite_locations where id=favorite_uuid) then raise exception 'Cross-account read allowed'; end if;
  update public.saved_routes set status='archived' where id=route_uuid;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Cross-account write allowed'; end if;
end $$;
rollback;
select 'Database checks passed: route, complete stops, retries, archive, favorites, permissions and account isolation' as result;
