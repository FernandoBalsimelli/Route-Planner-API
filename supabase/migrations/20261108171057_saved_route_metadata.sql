ALTER TABLE public.saved_routes ADD COLUMN IF NOT EXISTS route_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

