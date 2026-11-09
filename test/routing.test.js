import assert from 'node:assert/strict';
import { after, test } from 'node:test';

process.env.ORS_API_KEY = 'test-provider-key';
process.env.SUPABASE_URL = 'https://auth.example.test';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-public-key';
const originalFetch = globalThis.fetch;
let provider;
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  if (url.hostname === 'auth.example.test') return Response.json({ id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated' });
  return provider(url, options);
};
const { app } = await import('../index.js');
after(async () => { globalThis.fetch = originalFetch; await app.close(); });

const origin = { label: 'Monterrey, Nuevo León, México', lat: 25.67, lng: -100.31 };
const destination = { label: 'Chihuahua, Chihuahua, México', lat: 28.66, lng: -106.09 };
const stop = { label: 'Parada de prueba', lat: 25.68, lng: -100.30 };
const plan = payload => app.inject({ method: 'POST', url: '/v1/routes/plan', headers: { authorization: 'Bearer test-session' }, payload: { origin, destination, stops: [stop], ...payload } });

test('city suggestions exclude regional centroids and identify the city and state', async () => {
  provider = async url => {
    const layers = url.searchParams.get('layers').split(',');
    assert.ok(layers.includes('locality'));
    assert.ok(!layers.includes('region'));
    return Response.json({ features: [
      { geometry: { coordinates: [-106.4, 28.9] }, properties: { layer: 'region', name: 'Chihuahua', label: 'Chihuahua, México' } },
      { geometry: { coordinates: [-106.09, 28.66] }, properties: { layer: 'locality', name: 'Chihuahua', region: 'Chihuahua', country: 'México' } },
    ] });
  };
  const response = await app.inject('/v1/locations/suggest?q=Chihuahua');
  assert.equal(response.statusCode, 200);
  const points = response.json().suggestions;
  assert.equal(points.length, 1);
  assert.equal(points[0].label, 'Chihuahua, Chihuahua, México');
  assert.equal(points[0].kind, 'locality');
  assert.equal(points[0].lat, 28.66);
});

test('Photon fallback uses a supported language and excludes states', async () => {
  provider = async url => {
    if (url.hostname === 'api.heigit.org') return Response.json({}, { status: 503 });
    assert.equal(url.hostname, 'photon.komoot.io');
    assert.equal(url.searchParams.has('lang'), false);
    return Response.json({ features: [
      { geometry: { coordinates: [-106.4, 28.9] }, properties: { type: 'state', name: 'Chihuahua' } },
      { geometry: { coordinates: [-106.09, 28.66] }, properties: { type: 'city', name: 'Chihuahua', state: 'Chihuahua', country: 'México' } },
    ] });
  };
  const response = await app.inject('/v1/locations/suggest?q=Chihuahua');
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().suggestions.length, 1);
  assert.equal(response.json().suggestions[0].kind, 'locality');
});

test('authenticated routing identifies an unreachable destination instead of a generic error', async () => {
  provider = async () => Response.json({ error: { code: 2010, message: 'Could not find routable point within a radius of 350.0 meters of specified coordinate 2: -106.4 28.9.' } }, { status: 404 });
  const response = await plan();
  const failure = response.json();
  assert.equal(response.statusCode, 422);
  assert.equal(failure.code, 'ORS_POINT_NOT_ROUTABLE');
  assert.equal(failure.waypointIndex, 2);
  assert.equal(failure.waypoint.type, 'destination');
  assert.match(failure.message, /El destino.*Chihuahua.*350 m/);
});

test('routing reports the provider distance limit and service outages separately', async () => {
  provider = async () => Response.json({ error: { code: 2004, message: 'Request parameters exceed the server configuration limits. The approximated route distance must not be greater than 6000000.0 meters.' } }, { status: 400 });
  let response = await plan();
  assert.equal(response.json().code, 'ORS_ROUTE_TOO_LONG');
  assert.match(response.json().message, /6,000 km/);
  provider = async () => new Response('Service unavailable', { status: 503 });
  response = await plan();
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, 'ORS_ROUTING_UNAVAILABLE');
});

test('truck routing preserves selected coordinates, order and vehicle restrictions', async () => {
  provider = async (url, options) => {
    assert.ok(url.pathname.endsWith('/driving-hgv/json'));
    const body = JSON.parse(options.body);
    assert.deepEqual(body.coordinates, [origin, stop, destination].map(p => [p.lng, p.lat]));
    assert.equal(body.options.profile_params.restrictions.height, 4);
    assert.equal(body.options.profile_params.restrictions.weight, 40);
    return Response.json({ routes: [{ summary: { distance: 800000, duration: 36000 }, geometry: 'encoded-route', segments: [] }] });
  };
  const response = await plan({ mode: 'truck', vehicle: { heightM: 4, grossWeightT: 40 } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().route.distanceMeters, 800000);
  assert.deepEqual(response.json().route.waypoints.map(p => p.label), [origin.label, stop.label, destination.label]);
});

test('reverse geocoding labels a location without moving the device coordinates', async () => {
  provider = async () => Response.json({ features: [{ geometry: { coordinates: [-106.10, 28.67] }, properties: { label: 'Dirección cercana' } }] });
  const response = await app.inject('/v1/locations/reverse?lat=28.662926123&lng=-106.099908456');
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().location.lat, 28.662926123);
  assert.equal(response.json().location.lng, -106.099908456);
  assert.equal(response.json().location.label, 'Dirección cercana');
});

test('reverse fallback and complete outage preserve exact coordinates', async () => {
  provider = async url => url.hostname === 'api.heigit.org' ? Response.json({}, { status: 503 })
    : Response.json({ features: [{ properties: { name: 'Lugar de prueba', city: 'Chihuahua' } }] });
  let response = await app.inject('/v1/locations/reverse?lat=28.66&lng=-106.09');
  assert.match(response.json().location.label, /Lugar de prueba/);
  provider = async () => Response.json({}, { status: 503 });
  response = await app.inject('/v1/locations/reverse?lat=28.66&lng=-106.09');
  assert.equal(response.json().warning, 'ADDRESS_LOOKUP_UNAVAILABLE');
  assert.equal(response.json().location.lat, 28.66);
});

test('reverse rejects missing, blank and out-of-range coordinates', async () => {
  provider = async () => { throw new Error('Invalid input must not reach providers'); };
  for (const query of ['lat=&lng=0', 'lat=1', 'lat=91&lng=1']) {
    assert.equal((await app.inject('/v1/locations/reverse?' + query)).statusCode, 400);
  }
});

test('unconfirmed house number does not silently route to the street centroid', async () => {
  let routingCalls = 0;
  provider = async url => {
    if (url.pathname.includes('/directions/')) routingCalls++;
    return Response.json({ features: [{ geometry: { coordinates: [-100.27, 25.6] }, properties: { layer: 'street', name: 'San Ángel', label: 'San Ángel, Monterrey', locality: 'Monterrey' } }] });
  };
  const response = await plan({ destination: 'S. Prueba 202, Colonia Ejemplo, 00000 Monterrey, N.L.' });
  assert.equal(response.statusCode, 422); assert.equal(response.json().code, 'ADDRESS_NUMBER_UNCONFIRMED'); assert.equal(routingCalls, 0);
});
