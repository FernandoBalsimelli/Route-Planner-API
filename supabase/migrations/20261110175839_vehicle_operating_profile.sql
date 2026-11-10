-- Nullable additions preserve every existing profile and ownership policy.
-- This catalog validates internal consistency, never road access or legal weight.
set local lock_timeout = '5s';
alter table public.vehicles
 add column axle_count smallint check (axle_count is null or axle_count between 2 and 12),
 add column vehicle_configuration text,
 add column payload_capacity_t numeric check (payload_capacity_t is null or (payload_capacity_t > 0 and payload_capacity_t <= 100 and payload_capacity_t = round(payload_capacity_t,3))),
 add constraint vehicles_configuration_axles_check check (vehicle_configuration is null or (axle_count is not null and axle_count = case vehicle_configuration
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
  else -1 end));
comment on column public.vehicles.payload_capacity_t is 'Rated payload capacity in tonnes; distinct from actual loaded gross weight. Not a legal road authorization.';
