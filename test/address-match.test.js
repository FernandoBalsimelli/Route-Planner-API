import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { requestedHouseNumber, rankAddressMatches } from '../lib/address-match.js';
process.env.ORS_API_KEY = 'test-key';
const { app } = await import('../index.js');
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; await app.close(); });
const feature = (kind, houseNumber, lat = 25.6) => ({ geometry: { coordinates: [-100.27, lat] }, properties: { layer: kind, name: 'San Ángel', label: 'San Ángel, Monterrey', street: 'San Ángel', housenumber: houseNumber, locality: 'Monterrey' } });

test('Mexican exterior number detection does not mistake postcode or numbered street for a house', () => {
  assert.equal(requestedHouseNumber('S. Prueba 202, Colonia Ejemplo, 00000 Monterrey, N.L.'), '202');
  assert.equal(requestedHouseNumber('Calle Norte 202 A, Monterrey'), '202A');
  for (const query of ['Monterrey, 64878', 'Calle 20', 'Avenida 202', '75QXJP3F+HX', 'C.P. 64878', 'Avenida 20 de Noviembre']) assert.equal(requestedHouseNumber(query), null);
});
test('only the provider house number counts; a label or generated Plus Code is not address verification', () => {
  const ranked = rankAddressMatches('Calle Cedro 202', [{ label: 'Calle Cedro 202', plusCode: '75QXJP3F+HX' }, { houseNumber: '204' }, { houseNumber: '202' }]);
  assert.deepEqual(ranked.map(point => point.numberMatch), ['matched', 'missing', 'different']);
});
test('numbered addresses use full search and consult fallback if only a street is found', async () => {
  const requests = [];
  globalThis.fetch = async input => {
    const url = new URL(input); requests.push(url);
    if (url.hostname === 'api.heigit.org') {
      assert.ok(url.pathname.endsWith('/search'));
      return Response.json({ features: [feature('street')] });
    }
    return Response.json({ features: [{ geometry: { coordinates: [-100.27001, 25.60001] }, properties: { type: 'house', name: 'San Ángel', housenumber: '202', street: 'San Ángel', city: 'Monterrey', postcode: '64878' } }] });
  };
  const response = await app.inject('/v1/locations/suggest?q='+encodeURIComponent('S. Prueba 202, Colonia Ejemplo, 00000 Monterrey, N.L.'));
  const points = response.json().suggestions;
  assert.equal(response.statusCode, 200); assert.equal(requests.length, 2);
  assert.equal(points[0].numberMatch, 'matched'); assert.equal(points[0].houseNumber, '202'); assert.equal(points[0].lat, 25.60001);
  assert.equal(points[0].postalCode, '64878');
});
test('a missing number remains approximate even when the provider supplies a Plus Code', async () => {
  globalThis.fetch = async () => Response.json({ features: [feature('street')] });
  const response = await app.inject('/v1/locations/suggest?q='+encodeURIComponent('San Ángel 303, Monterrey'));
  assert.equal(response.json().suggestions[0].numberMatch, 'missing');
  assert.equal(response.json().suggestions[0].requestedHouseNumber, '303');
  assert.ok(response.json().suggestions[0].plusCode);
});
