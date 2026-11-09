DROP POLICY IF EXISTS vehicles_owner_all ON public.vehicles;
CREATE POLICY vehicles_owner_all ON public.vehicles
FOR ALL
USING (
  owner_id = (SELECT auth.uid())
  AND (fleet_id IS NULL OR EXISTS (
    SELECT 1 FROM public.fleets f
    WHERE f.id = fleet_id AND f.owner_id = (SELECT auth.uid())
  ))
)
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND (fleet_id IS NULL OR EXISTS (
    SELECT 1 FROM public.fleets f
    WHERE f.id = fleet_id AND f.owner_id = (SELECT auth.uid())
  ))
);

DROP POLICY IF EXISTS saved_routes_owner_all ON public.saved_routes;
CREATE POLICY saved_routes_owner_all ON public.saved_routes
FOR ALL
USING (
  owner_id = (SELECT auth.uid())
  AND (vehicle_id IS NULL OR EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_id AND v.owner_id = (SELECT auth.uid())
  ))
)
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND (vehicle_id IS NULL OR EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.id = vehicle_id AND v.owner_id = (SELECT auth.uid())
  ))
);

DROP POLICY IF EXISTS route_stops_owner_all ON public.route_stops;
CREATE POLICY route_stops_owner_all ON public.route_stops
FOR ALL
USING (
  owner_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.saved_routes r
    WHERE r.id = route_id AND r.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.saved_routes r
    WHERE r.id = route_id AND r.owner_id = (SELECT auth.uid())
  )
);

