import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { after, test } from 'node:test';
import handler, { app } from '../index.js';

// Exercise the actual exported handler over HTTP, including streamed JSON bodies.
// inject() alone would bypass the Vercel entrypoint that previously failed.
const server = createServer(handler);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await app.close();
});

test('import does not open a second server, and concurrent cold requests resolve', async () => {
  assert.equal(app.server.listening, false);
  const responses = await Promise.all(Array.from({ length: 5 }, () => fetch(base + '/health')));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal((await response.json()).service, 'route-planner-api');
  }
});

test('HTTP handler passes JSON request bodies through to route validation', async () => {
  const response = await fetch(base + '/v1/routes/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin: 'Chihuahua', destination: 'Ciudad Juárez', stops: ['Villa Ahumada'] }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, valid: true, mode: 'delivery', stopCount: 1, preferences: { avoidTolls: false, avoidHighways: false } });
});

test('invalid input and unauthenticated planning return JSON errors', async () => {
  const invalid = await fetch(base + '/v1/routes/validate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).ok, false);
  const unauthorized = await fetch(base + '/v1/routes/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).code, 'AUTH_REQUIRED');
});

test('global Plus Codes resolve without a geocoding network request', async () => {
  const response = await fetch(base + '/v1/locations/suggest?q=75XMRW22%2B22');
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.suggestions[0].source, 'plus_code');
  assert.equal(payload.suggestions[0].plusCode, '75XMRW22+22');
});
