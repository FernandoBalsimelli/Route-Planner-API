import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';

const app = Fastify({ logger: true, bodyLimit: 64 * 1024, trustProxy: true });
await app.register(cors, { origin: (origin, cb) => cb(null, !origin || /^https:\/\/(route-planner|route-planner-web)[a-z0-9.-]*\.vercel\.app$/.test(origin) || (process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).includes(origin)), methods: ['GET', 'POST', 'OPTIONS'] });
await app.register(rateLimit, { max: 40, timeWindow: '1 minute' });

const locationSchema = z.string().trim().min(2).max(180);
const routeSchema = z.object({
  origin: locationSchema,
  destination: locationSchema,
  stops: z.array(locationSchema).max(8).optional().default([]),
  mode: z.enum(['delivery', 'truck']).default('delivery'),
  vehicle: z.object({
    heightM: z.number().positive().max(10).optional(),
    widthM: z.number().positive().max(5).optional(),
    lengthM: z.number().positive().max(30).optional(),
    grossWeightT: z.number().positive().max(100).optional(),
    axleWeightT: z.number().positive().max(30).optional(),
  }).optional(),
});

function coordinate(value) {
  const match = value.match(/^\\s*(-?\\d{1,2}(?:\\.\\d+)?)\\s*,\\s*(-?\\d{1,3}(?:\\.\\d+)?)\\s*$/);
  if (!match) return null;
  const lat = Number(match[1]), lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

async function geocode(value, apiKey) {
  const point = coordinate(value);
  if (point) return point;
  const url = new URL('https://geocode.search.hereapi.com/v1/geocode');
  url.searchParams.set('q', value);
  url.searchParams.set('limit', '1');
  url.searchParams.set('lang', 'es-MX');
  url.searchParams.set('apiKey', apiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('HERE_GEOCODING_FAILED');
  const payload = await response.json();
  const position = payload.items?.[0]?.position;
  if (!position) throw new Error(`LOCATION_NOT_FOUND:${value}`);
  return { lat: position.lat, lng: position.lng, label: payload.items[0].title };
}

function hereVehicleParams(search, vehicle = {}) {
  const set = (key, value) => { if (Number.isFinite(value) && value > 0) search.set(`vehicle[${key}]`, String(value)); };
  set('height', vehicle.heightM ? Math.round(vehicle.heightM * 100) : undefined);
  set('width', vehicle.widthM ? Math.round(vehicle.widthM * 100) : undefined);
  set('length', vehicle.lengthM ? Math.round(vehicle.lengthM * 100) : undefined);
  set('grossWeight', vehicle.grossWeightT ? Math.round(vehicle.grossWeightT * 1000) : undefined);
  set('weightPerAxle', vehicle.axleWeightT ? Math.round(vehicle.axleWeightT * 1000) : undefined);
}

app.get('/', async () => ({ name: 'Route Planner API', version: 'v1', status: process.env.HERE_API_KEY ? 'ready' : 'awaiting_here_key' }));\napp.get('/health', async () => ({ ok: true, service: 'route-planner-api', version: '0.1.0', hereConfigured: Boolean(process.env.HERE_API_KEY) }));
app.get('/v1', async () => ({ name: 'Route Planner API', version: 'v1', capabilities: ['route-validation', 'here-geocoding', 'here-routing'], status: process.env.HERE_API_KEY ? 'ready' : 'awaiting_here_key' }));
app.post('/v1/routes/validate', async (request, reply) => {
  const parsed = routeSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ ok: false, message: 'Datos de ruta inválidos.', issues: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) });
  return { ok: true, valid: true, mode: parsed.data.mode, stopCount: parsed.data.stops.length };
});

app.post('/v1/routes/plan', async (request, reply) => {
  const parsed = routeSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ ok: false, message: 'Revisa el origen, destino y los datos del vehículo.', issues: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) });
  const apiKey = process.env.HERE_API_KEY;
  if (!apiKey) return reply.code(503).send({ ok: false, code: 'HERE_API_KEY_MISSING', message: 'HERE todavía no está conectado. Falta configurar HERE_API_KEY en las variables secretas de Vercel.' });
  try {
    const input = parsed.data;
    const locations = await Promise.all([input.origin, ...input.stops, input.destination].map(value => geocode(value, apiKey)));
    const query = new URLSearchParams({ transportMode: input.mode === 'truck' ? 'truck' : 'car', origin: `${locations[0].lat},${locations[0].lng}`, destination: `${locations.at(-1).lat},${locations.at(-1).lng}`, return: 'summary,polyline,actions,instructions', lang: 'es-MX', routingMode: 'fast' });
    for (const stop of locations.slice(1, -1)) query.append('via', `${stop.lat},${stop.lng}`);
    if (input.mode === 'truck') hereVehicleParams(query, input.vehicle || {});
    query.set('apiKey', apiKey);
    const response = await fetch(`https://router.hereapi.com/v8/routes?${query.toString()}`, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      request.log.warn({ status: response.status }, 'HERE routing request failed');
      return reply.code(response.status === 429 ? 429 : 502).send({ ok: false, message: 'HERE no pudo calcular esta ruta. Revisa los puntos o intenta con otro recorrido.' });
    }
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) return reply.code(422).send({ ok: false, message: 'HERE no encontró una ruta para esos puntos y ese vehículo.' });
    const sections = (route.sections || []).map(section => ({ summary: section.summary, polyline: section.polyline, actions: (section.actions || []).map(action => ({ action: action.action, instruction: action.instruction, duration: action.duration, length: action.length })) }));
    const distanceMeters = sections.reduce((total, section) => total + (section.summary?.length || 0), 0);
    const durationSeconds = sections.reduce((total, section) => total + (section.summary?.duration || 0), 0);
    const notices = (route.sections || []).flatMap(section => section.notices || []).map(notice => ({ title: notice.title, code: notice.code, severity: notice.severity, details: notice.details }));
    return { ok: true, route: { distanceMeters, durationSeconds, sections, notices, waypoints: locations.map((point, index) => ({ ...point, type: index === 0 ? 'origin' : index === locations.length - 1 ? 'destination' : 'stop' })) }, provider: 'HERE' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    request.log.error({ err: message }, 'Route planning failed');
    if (message.startsWith('LOCATION_NOT_FOUND:')) return reply.code(422).send({ ok: false, message: `No se encontró esta ubicación: ${message.slice(19)}` });
    if (message === 'HERE_GEOCODING_FAILED') return reply.code(502).send({ ok: false, message: 'No se pudo localizar una de las direcciones con HERE.' });
    return reply.code(502).send({ ok: false, message: 'Ocurrió un error al consultar el servicio de rutas. Intenta de nuevo.' });
  }
});

app.setNotFoundHandler((request, reply) => reply.code(404).send({ ok: false, message: 'Endpoint no encontrado.' }));
app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  reply.code(error.statusCode && error.statusCode < 500 ? error.statusCode : 500).send({ ok: false, message: 'Error interno del servicio.' });
});

if (process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1') {
  const port = Number(process.env.PORT || 3001);
  await app.listen({ port, host: '0.0.0.0' });
}

export default app;
