import { decodePolyline } from './municipal-boundaries.js';

// Structural provider-response checks, not legal or road-access validation.
export function inspectDirectionsRoute(route, expectedPoints) {
  if (!route || typeof route !== 'object' || Array.isArray(route)
    || !Number.isFinite(route.summary?.distance) || route.summary.distance < 0
    || !Number.isFinite(route.summary?.duration) || route.summary.duration < 0) return { reason: 'INVALID_SUMMARY' };
  const geometry = decodePolyline(route.geometry);
  if (!geometry) return { reason: 'INVALID_GEOMETRY' };
  const indexes = route.way_points;
  if (!Array.isArray(indexes) || indexes.length !== expectedPoints || indexes[0] !== 0 || indexes.at(-1) !== geometry.length - 1
    || !indexes.every((n, i) => Number.isSafeInteger(n) && n >= 0 && n < geometry.length && (!i || n >= indexes[i - 1]))) return { reason: 'INVALID_WAYPOINT_MAPPING' };
  const invalidMeasure = value => value !== undefined && (!Number.isFinite(value) || value < 0);
  const invalidStep = step => !step || typeof step !== 'object' || Array.isArray(step)
    || [step.instruction, step.name].some(value => value != null && typeof value !== 'string')
    || invalidMeasure(step.distance) || invalidMeasure(step.duration);
  if (route.segments !== undefined && (!Array.isArray(route.segments) || route.segments.some(segment => !segment || typeof segment !== 'object' || Array.isArray(segment)
    || invalidMeasure(segment.distance) || invalidMeasure(segment.duration)
    || (segment.steps !== undefined && (!Array.isArray(segment.steps) || segment.steps.some(invalidStep)))))) return { reason: 'INVALID_INSTRUCTIONS' };
  return { reason: null, indexes, geometryPointCount: geometry.length };
}
