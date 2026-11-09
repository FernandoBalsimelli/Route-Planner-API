-- The UI archives favorites. Public API roles must not physically delete them.
revoke all on public.favorite_locations from anon, authenticated;
grant select, insert, update on public.favorite_locations to authenticated;
