import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { decode, encode, isFull, isShort, isValid, recoverNearest } from '@erikmichelson/open-location-code-ts';

const app = Fastify({ logger: true, bodyLimit: 64 * 1024, trustProxy: true });
const supabaseAuth = process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
await app.register(cors, { origin: (origin, cb) => cb(null, !origin || /^https:\/\/(route-planner|route-planner-web)[a-z0-9.-]*\.vercel\.app$/.test(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || (process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).includes(origin)), methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] });
await app.register(rateLimit, { max: 40, timeWindow: '1 minute' });

const ORS_BASE_URL = 'https://api.heigit.org';
const locationTextSchema = z.string().trim().min(2).max(180);
const locationPointSchema = z.object({ label: z.string().trim().min(1).max(180), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), plusCode: z.string().optional() });
const locationSchema = z.union([locationTextSchema, locationPointSchema]);
const routeSchema = z.object({
  origin: locationSchema, destination: locationSchema,
  stops: z.array(locationSchema).max(8).optional().default([]),
  mode: z.enum(['delivery', 'truck']).default('delivery'),
  optimize: z.boolean().default(false),
  vehicle: z.object({
    heightM: z.number().positive().max(10).optional(),
    widthM: z.number().positive().max(5).optional(),
    lengthM: z.number().positive().max(30).optional(),
    grossWeightT: z.number().positive().max(100).optional(),
    axleWeightT: z.number().positive().max(30).optional(),
  }).optional(),
});

function coordinate(value) {
  const match = value.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = Number(match[1]), lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
function peliasPoint(feature, fallback = '') {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lat = Number(coordinates[1]), lng = Number(coordinates[0]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: feature.properties?.label || feature.properties?.name || fallback || (lat + ', ' + lng), plusCode: encode(lat, lng) };
}
async function peliasSearch(value, apiKey, autocomplete = false, size = 6) {
  const url = new URL(ORS_BASE_URL + '/pelias/v1/' + (autocomplete ? 'autocomplete' : 'search'));
  url.searchParams.set('text', value);
  url.searchParams.set('size', String(size));
  url.searchParams.set('lang', 'es');
  const response = await fetch(url, { headers: { Authorization: apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) { const error = new Error('ORS_GEOCODING_FAILED'); error.status = response.status; throw error; }
  return response.json();
}
async function resolvePlusCode(value, apiKey) {
  const match = value.match(/([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,7})/i);
  if (!match) return null;
  const code = match[1].toUpperCase();
  if (!isValid(code)) return null;
  let fullCode = code;
  if (!isFull(code)) {
    const locality = value.replace(match[1], '').replace(/^[,\s]+|[,\s]+$/g, '');
    if (!locality || !isShort(code)) throw new Error('PLUS_CODE_NEEDS_LOCALITY');
    const localityResult = await peliasSearch(locality, apiKey, false, 1);
    const reference = peliasPoint(localityResult.features?.[0], locality);
    if (!reference) throw new Error('LOCATION_NOT_FOUND:' + locality);
    fullCode = recoverNearest(code, reference.lat, reference.lng);
  }
  const area = decode(fullCode);
  return { lat: area.latitudeCenter, lng: area.longitudeCenter, label: 'Plus Code ' + fullCode, plusCode: fullCode };
}
async function geocode(value, apiKey) {
  if (value && typeof value === 'object' && Number.isFinite(value.lat) && Number.isFinite(value.lng)) return { lat: value.lat, lng: value.lng, label: value.label, plusCode: value.plusCode || encode(value.lat, value.lng) };
  const text = String(value || '').trim();
  const point = coordinate(text);
  if (point) return { ...point, label: text, plusCode: encode(point.lat, point.lng) };
  const plusCode = await resolvePlusCode(text, apiKey);
  if (plusCode) return plusCode;
  const payload = await peliasSearch(text, apiKey, false, 1);
  const result = peliasPoint(payload.features?.[0], text);
  if (!result) throw new Error('LOCATION_NOT_FOUND:' + text);
  return result;
}
function buildRestrictions(vehicle = {}) {
  const restrictions = {};
  if (vehicle.heightM) restrictions.height = vehicle.heightM;
  if (vehicle.widthM) restrictions.width = vehicle.widthM;
  if (vehicle.lengthM) restrictions.length = vehicle.lengthM;
  if (vehicle.grossWeightT) restrictions.weight = vehicle.grossWeightT;
  if (vehicle.axleWeightT) restrictions.axleload = vehicle.axleWeightT;
  return restrictions;
}

app.get('/', async () => ({ name: 'Route Planner API', version: 'v1', status: process.env.ORS_API_KEY ? 'ready' : 'awaiting_ors_key' }));
app.get('/health', async () => ({ ok: true, service: 'route-planner-api', version: '0.2.0', routingProvider: 'openrouteservice', orsConfigured: Boolean(process.env.ORS_API_KEY) }));
app.get('/v1', async () => ({ name: 'Route Planner API', version: 'v1', capabilities: ['route-validation', 'openrouteservice-geocoding', 'openrouteservice-routing', 'route-optimization', 'truck-restrictions'], status: process.env.ORS_API_KEY ? 'ready' : 'awaiting_ors_key' }));

app.get('/v1/locations/suggest', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
  const query = String(request.query?.q || '').trim();
  if (query.length < 2 || query.length > 180) return reply.code(400).send({ ok: false, message: 'Escribe al menos 2 caracteres para buscar.' });
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) return reply.code(503).send({ ok: false, code: 'ORS_API_KEY_MISSING', message: 'El buscador de direcciones no está disponible: falta la clave de HeiGIT.' });
  try {
    const point = coordinate(query);
    if (point) {
      let label = query;
      try {
        const reverseUrl = new URL(ORS_BASE_URL + '/pelias/v1/reverse');
        reverseUrl.searchParams.set('point.lat', String(point.lat)); reverseUrl.searchParams.set('point.lon', String(point.lng)); reverseUrl.searchParams.set('size', '1'); reverseUrl.searchParams.set('lang', 'es');
        const reverseResponse = await fetch(reverseUrl, { headers: { Authorization: apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
        if (reverseResponse.ok) {
          const reversePayload = await reverseResponse.json();
          label = reversePayload.features?.[0]?.properties?.label || query;
        }
      } catch {}
      return { ok: true, suggestions: [{ ...point, label, plusCode: encode(point.lat, point.lng), source: 'coordinates' }] };
    }
    const plusCode = await resolvePlusCode(query, apiKey);
    if (plusCode) return { ok: true, suggestions: [{ ...plusCode, source: 'plus_code' }] };
    const payload = await peliasSearch(query, apiKey, true, 6);
    const suggestions = (payload.features || []).map(feature => peliasPoint(feature, query)).filter(Boolean).map(point => ({ ...point, source: 'address' }));
    return { ok: true, suggestions };
  } catch (error) {
    request.log.warn({ err: error?.message, providerStatus: error?.status }, 'Location suggestions failed');
    if (error?.message === 'PLUS_CODE_NEEDS_LOCALITY') return reply.code(422).send({ ok: false, code: 'PLUS_CODE_NEEDS_LOCALITY', message: 'Este es un Plus Code corto. Añade la ciudad o localidad después del código, o utiliza el código global completo.' });
    if (error?.status === 401) return reply.code(502).send({ ok: false, code: 'ORS_AUTH_FAILED', message: 'HeiGIT no reconoció la clave de geocodificación.' });
    if (error?.status === 403) return reply.code(502).send({ ok: false, code: 'ORS_ACCESS_OR_DAILY_LIMIT', message: 'HeiGIT denegó la búsqueda por permisos o cuota diaria.' });
    if (error?.status === 429) return reply.code(429).send({ ok: false, code: 'ORS_RATE_LIMIT', message: 'Se alcanzó el límite temporal de búsquedas. Intenta de nuevo en un momento.' });
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return reply.code(504).send({ ok: false, code: 'LOCATION_SEARCH_TIMEOUT', message: 'La búsqueda tardó demasiado. Intenta de nuevo.' });
    return reply.code(502).send({ ok: false, code: 'LOCATION_SEARCH_FAILED', message: 'No se pudieron cargar las sugerencias de dirección.' });
  }
});
app.get('/v1/locations/reverse', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
  const lat = Number(request.query?.lat), lng = Number(request.query?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return reply.code(400).send({ ok: false, message: 'Coordenadas inválidas.' });
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) return reply.code(503).send({ ok: false, code: 'ORS_API_KEY_MISSING', message: 'La búsqueda de dirección no está disponible.' });
  try {
    const url = new URL(ORS_BASE_URL + '/pelias/v1/reverse');
    url.searchParams.set('point.lat', String(lat)); url.searchParams.set('point.lon', String(lng)); url.searchParams.set('size', '1'); url.searchParams.set('lang', 'es');
    const response = await fetch(url, { headers: { Authorization: apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Object.assign(new Error('ORS_GEOCODING_FAILED'), { status: response.status });
    const payload = await response.json();
    const feature = peliasPoint(payload.features?.[0], lat + ', ' + lng);
    return { ok: true, location: { lat, lng, label: feature?.label || (lat + ', ' + lng), plusCode: encode(lat, lng) } };
  } catch (error) {
    request.log.warn({ err: error?.message, providerStatus: error?.status }, 'Reverse geocoding failed');
    return { ok: true, location: { lat, lng, label: lat + ', ' + lng, plusCode: encode(lat, lng) }, warning: 'ADDRESS_LOOKUP_UNAVAILABLE' };
  }
});


app.post('/v1/routes/validate', async (request, reply) => {
  const parsed = routeSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ ok: false, message: 'Datos de ruta inválidos.', issues: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) });
  return { ok: true, valid: true, mode: parsed.data.mode, stopCount: parsed.data.stops.length };
});

app.post('/v1/routes/plan', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
  const authorization = request.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken || !supabaseAuth) return reply.code(401).send({ ok: false, code: 'AUTH_REQUIRED', message: 'Inicia sesión para calcular y consumir rutas.' });
  const { data: authData, error: authError } = await supabaseAuth.auth.getUser(accessToken);
  if (authError || !authData.user) return reply.code(401).send({ ok: false, code: 'INVALID_SESSION', message: 'Tu sesión no es válida. Inicia sesión de nuevo.' });
  const parsed = routeSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ ok: false, message: 'Revisa el origen, destino y los datos del vehículo.', issues: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) });
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) return reply.code(503).send({ ok: false, code: 'ORS_API_KEY_MISSING', message: 'OpenRouteService todavía no está conectado. Falta configurar ORS_API_KEY como variable secreta en Vercel.' });

  try {
    const input = parsed.data;
    const locations = await Promise.all([input.origin, ...input.stops, input.destination].map(value => geocode(value, apiKey)));
    const profile = input.mode === 'truck' ? 'driving-hgv' : 'driving-car';
    let routeLocations = locations;
    let optimized = false;

    // VROOM does not expose the HGV dimension and weight restrictions used by Directions.
    // Keep optimization opt-in and limited to delivery vehicles until that can be validated.
    if (input.optimize && input.stops.length > 1 && input.mode === 'delivery') {
      const jobs = locations.slice(1, -1).map((point, index) => ({ id: index + 1, location: [point.lng, point.lat] }));
      const optimizationResponse = await fetch(ORS_BASE_URL + '/vroom/v0', {
        method: 'POST',
        headers: { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          jobs,
          vehicles: [{
            id: 1,
            profile: 'driving-car',
            start: [locations[0].lng, locations[0].lat],
            end: [locations[locations.length - 1].lng, locations[locations.length - 1].lat],
          }],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!optimizationResponse.ok) {
        let providerMessage = '';
        try { providerMessage = (await optimizationResponse.json()).error?.message || ''; } catch {}
        request.log.warn({ status: optimizationResponse.status, providerMessage }, 'HeiGIT optimization request failed');
        if (optimizationResponse.status === 401) return reply.code(502).send({ ok: false, code: 'ORS_AUTH_FAILED', message: 'HeiGIT no reconoció la clave para optimizar paradas. Comprueba la configuración de la credencial.' });
        if (optimizationResponse.status === 403) return reply.code(502).send({ ok: false, code: 'ORS_ACCESS_OR_DAILY_LIMIT', message: 'HeiGIT denegó la optimización por permisos o por alcanzar la cuota diaria. Revisa el panel de tu clave.' });
        if (optimizationResponse.status === 402) return reply.code(503).send({ ok: false, code: 'ORS_OPTIMIZATION_PLAN_RESTRICTION', message: 'El nivel actual de tu clave no permite optimizar el orden de las paradas.' });
        if (optimizationResponse.status === 429) return reply.code(429).send({ ok: false, code: 'ORS_OPTIMIZATION_RATE_LIMIT', message: 'Se alcanzó el límite temporal de optimización de HeiGIT. Intenta más tarde.' });
        return reply.code(422).send({ ok: false, code: 'ORS_OPTIMIZATION_FAILED', message: 'No se pudo optimizar el orden de las paradas. Desactiva la optimización o inténtalo más tarde.' });
      }
      const optimization = await optimizationResponse.json();
      const optimizedRoute = optimization.routes?.[0];
      const orderedIds = (optimizedRoute?.steps || []).filter(step => step.type === 'job').map(step => step.id);
      if (!optimizedRoute || orderedIds.length !== jobs.length || optimization.unassigned?.length) {
        return reply.code(422).send({ ok: false, code: 'ORS_OPTIMIZATION_INCOMPLETE', message: 'HeiGIT no pudo ordenar todas las paradas. Prueba sin optimización o revisa las ubicaciones.' });
      }
      routeLocations = [locations[0], ...orderedIds.map(id => locations[id]), locations[locations.length - 1]];
      optimized = true;
    }

    const body = {
      coordinates: routeLocations.map(point => [point.lng, point.lat]), instructions: true, language: 'es', units: 'm',
      ...(input.mode === 'truck' ? { options: { vehicle_type: 'hgv', profile_params: { restrictions: buildRestrictions(input.vehicle || {}) } } } : {}),
    };
    const response = await fetch(ORS_BASE_URL + '/openrouteservice/v2/directions/' + profile + '/json', {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      let providerMessage = '';
      try { providerMessage = (await response.json()).error?.message || ''; } catch {}
      request.log.warn({ status: response.status, providerMessage }, 'OpenRouteService directions request failed');
      if (response.status === 401) return reply.code(502).send({ ok: false, code: 'ORS_AUTH_FAILED', message: 'HeiGIT no reconoció la clave. Comprueba que la credencial esté configurada correctamente.' });
      if (response.status === 403) return reply.code(502).send({ ok: false, code: 'ORS_ACCESS_OR_DAILY_LIMIT', message: 'HeiGIT denegó la solicitud por permisos o por alcanzar la cuota diaria. Revisa el panel de tu clave.' });
      if (response.status === 402) return reply.code(503).send({ ok: false, code: 'ORS_PLAN_RESTRICTION', message: 'El nivel actual de la clave no permite esta solicitud. Comprueba los permisos y límites de tu plan de HeiGIT.' });
      if (response.status === 429) return reply.code(429).send({ ok: false, code: 'ORS_RATE_LIMIT', message: 'Se alcanzó temporalmente el límite de solicitudes de HeiGIT. Intenta más tarde.' });
      return reply.code(422).send({ ok: false, code: 'ORS_ROUTING_FAILED', message: 'OpenRouteService no pudo calcular esta ruta. Revisa los puntos, las restricciones del vehículo o inténtalo con otro recorrido.' });
    }
    const data = await response.json(), route = data.routes?.[0];
    if (!route) return reply.code(422).send({ ok: false, message: 'OpenRouteService no encontró una ruta para esos puntos y ese vehículo.' });
    const sections = (route.segments || []).map(segment => ({
      summary: { length: segment.distance, duration: segment.duration },
      actions: (segment.steps || []).map(step => ({ action: String(step.type ?? ''), instruction: step.instruction, duration: step.duration, length: step.distance })),
    }));
    const summary = route.summary || {};
    return { ok: true, route: {
      distanceMeters: summary.distance || 0, durationSeconds: summary.duration || 0, polyline: route.geometry, sections, notices: [], optimized,
      waypoints: routeLocations.map((point, index) => ({ ...point, type: index === 0 ? 'origin' : index === routeLocations.length - 1 ? 'destination' : 'stop' })),
    }, provider: 'openrouteservice' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    request.log.error({ err: message, providerStatus: error?.status }, 'Route planning failed');
    if (message.startsWith('LOCATION_NOT_FOUND:')) return reply.code(422).send({ ok: false, code: 'LOCATION_NOT_FOUND', message: 'No se encontró esta ubicación: ' + message.slice(19) });
    if (message === 'PLUS_CODE_NEEDS_LOCALITY') return reply.code(422).send({ ok: false, code: 'PLUS_CODE_NEEDS_LOCALITY', message: 'Este Plus Code corto necesita una ciudad o localidad. Añádela después del código o utiliza el código global completo.' });
    if (error?.status === 401) return reply.code(502).send({ ok: false, code: 'ORS_AUTH_FAILED', message: 'HeiGIT no reconoció la clave para geocodificar. Comprueba que la credencial esté configurada correctamente.' });
    if (error?.status === 403) return reply.code(502).send({ ok: false, code: 'ORS_ACCESS_OR_DAILY_LIMIT', message: 'HeiGIT denegó la geocodificación por permisos o por alcanzar la cuota diaria. Revisa el panel de tu clave.' });
    if (error?.status === 402) return reply.code(503).send({ ok: false, code: 'ORS_PLAN_RESTRICTION', message: 'El nivel actual de la clave no permite esta solicitud. Comprueba los permisos y límites de tu plan de HeiGIT.' });
    if (error?.status === 429) return reply.code(429).send({ ok: false, code: 'ORS_RATE_LIMIT', message: 'Se alcanzó temporalmente el límite de solicitudes de HeiGIT. Intenta más tarde.' });
    if (message === 'ORS_GEOCODING_FAILED') return reply.code(502).send({ ok: false, code: 'ORS_GEOCODING_FAILED', message: 'No se pudo localizar una de las direcciones con OpenRouteService.' });
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return reply.code(504).send({ ok: false, code: 'ORS_TIMEOUT', message: 'HeiGIT tardó demasiado en responder. Intenta de nuevo en unos momentos.' });
    return reply.code(502).send({ ok: false, code: 'ROUTE_PROVIDER_ERROR', message: 'Ocurrió un error al consultar el servicio de rutas. Intenta de nuevo.' });
  }
});
app.setNotFoundHandler((request, reply) => reply.code(404).send({ ok: false, message: 'Endpoint no encontrado.' }));
app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  reply.code(error.statusCode && error.statusCode < 500 ? error.statusCode : 500).send({ ok: false, message: 'Error interno del servicio.' });
});
const port = Number(process.env.PORT || 3000);
await app.listen({ port, host: '0.0.0.0' });
export default app;
