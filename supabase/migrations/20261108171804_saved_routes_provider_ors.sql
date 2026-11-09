ALTER TABLE public.saved_routes ALTER COLUMN provider SET DEFAULT 'openrouteservice'; UPDATE public.saved_routes SET provider = 'openrouteservice' WHERE provider = 'here';

