import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { distanceMeters, nearbyResults, searchFocus } from '../lib/nearby.js';
process.env.ORS_API_KEY = 'test-key';
const { app } = await import('../index.js');
const realFetch = globalThis.fetch;
after(async () => { globalThis.fetch = realFetch; await app.close(); });
const feature = (label, lat, lng) => ({ properties: { label, layer: 'venue' }, geometry: { coordinates: [lng, lat] } });

test('nearby ranking keeps distinct branches and reports straight-line distance', () => {
  const point = { lat: 25.68, lng: -100.31 };
  const near = { label: 'Bodega Aurrera Express, Calle A', lat: 25.681, lng: -100.31 };
  const far = { label: 'Bodega Aurrera Express, Calle B', lat: 26, lng: -100.31 };
  const results = nearbyResults([far, near, near], point);
  assert.equal(results.length, 2); assert.equal(results[0].label, near.label);
  assert.ok(results[0].distanceMeters > 100 && results[0].distanceMeters < 120);
  assert.equal(distanceMeters(point, point), 0);
});
test('explicit city/postcode overrides proximity, and partial/invalid coordinates fail', () => {
  assert.equal(searchFocus('Bodega Aurrera, Delicias', '25', '-100'), null);
  assert.equal(searchFocus('Bodega Aurrera en Delicias', '25', '-100'), null);
  assert.deepEqual(searchFocus('Bodega Aurrera Express', '25', '-100'), { lat: 25, lng: -100 });
  assert.throws(() => searchFocus('Bodega', 'no', '-100'), /INVALID_SEARCH_FOCUS/);
  assert.throws(() => searchFocus('Bodega', '25', undefined), /INVALID_SEARCH_FOCUS/);
});
test('suggest endpoint sends focus upstream, sorts nearby branches and caches repeats', async () => {
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    assert.equal(url.searchParams.get('focus.point.lat'), '25.68');
    assert.equal(url.searchParams.get('focus.point.lon'), '-100.31');
    return Response.json({ features: [feature('Sucursal distante', 26, -100), feature('Sucursal cercana', 25.681, -100.31)] });
  };
  const url = '/v1/locations/suggest?q=Bodega%20cercana&lat=25.68&lng=-100.31';
  const first = await app.inject({ url }); const second = await app.inject({ url });
  assert.equal(first.statusCode, 200); assert.equal(first.json().nearby, true);
  assert.equal(first.json().suggestions[0].label, 'Sucursal cercana');
  assert.deepEqual(first.json(), second.json()); assert.equal(calls, 1);
});
test('focus is not applied to an explicitly named city, or to Plus Code resolution', async () => {
  globalThis.fetch = async url => {
    assert.equal(url.searchParams.has('focus.point.lat'), false);
    return Response.json({ features: [feature('Tienda, Delicias', 28.19, -105.47)] });
  };
  const explicit = await app.inject({ url: '/v1/locations/suggest?q=Tienda%2C%20Delicias&lat=25&lng=-100' });
  assert.equal(explicit.json().nearby, false);
  const code = await app.inject({ url: '/v1/locations/suggest?q=75XMRW22%2B22&lat=25&lng=-100' });
  assert.equal(code.json().suggestions[0].source, 'plus_code');
});
test('distant Pelias results consult the focused Photon index and warn when none are nearby', async () => {
  globalThis.fetch = async url => {
    if (url.hostname === 'photon.komoot.io') {
      assert.equal(url.searchParams.get('lat'), '28.6'); assert.equal(url.searchParams.get('lon'), '-106.1');
      return Response.json({ features: [] });
    }
    return Response.json({ features: [feature('Tienda distante', 19.4, -99.1)] });
  };
  const response = await app.inject({ url: '/v1/locations/suggest?q=Tienda%20distante&lat=28.6&lng=-106.1' });
  assert.equal(response.json().warning, 'NO_NEARBY_MATCHES');
  assert.ok(response.json().suggestions[0].distanceMeters > 100000);
  const invalid = await app.inject({ url: '/v1/locations/suggest?q=Tienda&lat=999&lng=-106' });
  assert.equal(invalid.statusCode, 400);
});
