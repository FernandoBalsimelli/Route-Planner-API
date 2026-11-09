-- Test-only harness. Refuse every database other than the disposable CI fixture.
do $$ begin
  if current_database() <> 'route_planner_ci' then raise exception 'This fixture is only allowed in route_planner_ci'; end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
