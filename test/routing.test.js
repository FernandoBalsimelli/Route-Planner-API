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
const plan = (payload,remoteAddress='127.0.0.1') => app.inject({remoteAddress, method: 'POST', url: '/v1/routes/plan', headers: { authorization: 'Bearer test-session' }, payload: { origin, destination, stops: [stop], ...payload } });
function encodePath(points){let lat=0,lng=0;const encode=n=>{let value=n<0?~(n<<1):n<<1,result='';while(value>=32){result+=String.fromCharCode((value&31|32)+63);value>>=5;}return result+String.fromCharCode(value+63);};return points.map(([nextLat,nextLng])=>{const y=Math.round(nextLat*1e5),x=Math.round(nextLng*1e5),chunk=encode(y-lat)+encode(x-lng);lat=y;lng=x;return chunk;}).join('');}

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

test('route response preserves maneuver geometry indexes and reports unverified municipal coverage',async()=>{
 const geometry=encodePath(Array.from({length:8},(_,index)=>[25.67,-100.35+index*(.15/7)]));
 provider=async()=>Response.json({routes:[{summary:{distance:100,duration:20},geometry,segments:[{steps:[{type:1,instruction:'Gira a la derecha',name:'Vía pública de prueba',distance:100,duration:20,way_points:[3,7]},{type:10,instruction:'Llegada',way_points:[-1,2]}]}]}]});
 const response=await plan({stops:[]});assert.equal(response.statusCode,200);
 const route=response.json().route;assert.equal(route.sections[0].actions[0].geometryStart,3);assert.equal(route.sections[0].actions[0].geometryEnd,7);assert.equal(route.sections[0].actions[1].geometryStart,undefined);
 assert.equal(route.regulatoryCoverage.status,'not_verified');assert.equal(route.regulatoryCoverage.requiresOperatorReview,true);assert.equal(route.regulatoryCoverage.municipalityIdentification,'identified_approximate');assert.ok(route.regulatoryCoverage.municipalitiesIdentified.some(item=>item.id==='19039'&&item.coverage==='reference_only'));assert.ok(route.regulatoryCoverage.municipalitiesIdentified.some(item=>item.id==='19026'&&item.coverage==='not_loaded'));
});


test('a route with 48 intermediate deliveries reaches Directions with all 50 points in order', async () => {
  const stops = Array.from({length:48},(_,i)=>({label:`Delivery ${i+1}`,lat:25.67+i/10000,lng:-100.31}));
  provider = async (url, options) => {
    assert.match(url.pathname, /driving-hgv\/json$/);
    const body=JSON.parse(options.body);
    assert.equal(body.coordinates.length,50);
    assert.deepEqual(body.coordinates,[origin,...stops,destination].map(p=>[p.lng,p.lat]));
    assert.equal(body.options.profile_params.restrictions.height,4);
    return Response.json({routes:[{summary:{distance:1000,duration:300},geometry:'encoded-route',segments:[]}]});
  };
  const response = await plan({stops, mode:'truck', vehicle:{heightM:4}});
  assert.equal(response.statusCode,200);
  assert.equal(response.json().route.waypoints.length,50);
  assert.equal(response.json().route.waypoints[48].label,'Delivery 48');
});

test('the API rejects routes beyond the real provider limit before making any provider call',async()=>{
  provider=async()=>{throw Error('provider must not be called');};
  const response=await plan({stops:Array.from({length:49},()=>stop)});
  assert.equal(response.statusCode,400);
});
test('route waypoint geometry indexes are preserved only when the complete ordered provider mapping is valid',async()=>{
 const geometry=encodePath([[25.67,-100.31],[25.68,-100.30],[28.66,-106.09]]);
 for(const indexes of [[0,1,2],[0,2,1],[0,1,9],[0,2],[-1,1,2]]){
  provider=async()=>Response.json({routes:[{summary:{distance:100,duration:20},geometry,way_points:indexes,segments:[]}]});
  const response=await plan({},'192.0.2.10');assert.equal(response.statusCode,200);
  const waypoints=response.json().route.waypoints;
  if(JSON.stringify(indexes)==='[0,1,2]')assert.deepEqual(waypoints.map(point=>point.geometryIndex),indexes);
  else assert.ok(waypoints.every(point=>!Object.hasOwn(point,'geometryIndex')));
 }
});


test('road preferences reach Directions alongside all HGV restrictions without changing deliveries', async () => {
  provider = async (url, options) => {
    assert.ok(url.pathname.endsWith('/driving-hgv/json'));
    const body = JSON.parse(options.body);
    assert.deepEqual(body.coordinates, [origin, stop, destination].map(p => [p.lng, p.lat]));
    assert.deepEqual(body.options.avoid_features, ['tollways', 'highways']);
    assert.deepEqual(body.options.profile_params.restrictions, { height: 4, width: 2.5, length: 18, weight: 40, axleload: 9 });
    assert.equal(body.options.vehicle_type, 'hgv');
    return Response.json({ routes: [{ summary: { distance: 1234, duration: 500 }, segments: [] }] });
  };
  const preferences = { avoidTolls: true, avoidHighways: true };
  const response = await plan({ mode: 'truck', preferences, vehicle: { heightM: 4, widthM: 2.5, lengthM: 18, grossWeightT: 40, axleWeightT: 9 } }, '127.4.0.1');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().route.preferences, preferences);
  assert.equal(response.json().route.optimized, false);
});

test('two-point delivery applies each road preference and defaults preserve existing routing', async () => {
  for (const [preferences, expected] of [[{ avoidTolls: true }, ['tollways']], [{ avoidHighways: true }, ['highways']], [undefined, undefined]]) {
    provider = async (url, options) => {
      assert.ok(url.pathname.endsWith('/driving-car/json'));
      const body = JSON.parse(options.body);
      assert.equal(body.coordinates.length, 2);
      assert.deepEqual(body.options?.avoid_features, expected);
      if (!expected) assert.equal(body.options, undefined);
      return Response.json({ routes: [{ summary: { distance: 1234, duration: 500 }, segments: [] }] });
    };
    const response = await plan({ stops: [], preferences }, '127.4.0.2');
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().route.preferences.avoidTolls, preferences?.avoidTolls || false);
    assert.equal(response.json().route.preferences.avoidHighways, preferences?.avoidHighways || false);
  }
});

test('unsupported optimization preferences and malformed values fail before external routing', async () => {
  provider = async () => { throw new Error('Validation must precede routing'); };
  for (const preferences of [{ avoidTolls: 'true' }, { avoidHighways: 1 }, { tolls: true }, null]) {
    const response = await plan({ preferences }, '127.4.0.3');
    assert.equal(response.statusCode, 400);
  }
  const response = await plan({ stops: [stop, stop], optimize: true, preferences: { avoidTolls: true } }, '127.4.0.3');
  assert.equal(response.statusCode, 400);
  assert.match(response.json().issues[0].message, /optimización.*preferencias/);
});

test('no route with road exclusions never retries silently without them', async () => {
  let requests = 0;
  provider = async (url, options) => {
    requests++;
    assert.deepEqual(JSON.parse(options.body).options.avoid_features, ['highways']);
    return Response.json({ error: { code: 2009, message: 'Route could not be found' } }, { status: 404 });
  };
  const response = await plan({ preferences: { avoidHighways: true } }, '127.4.0.4');
  assert.equal(response.statusCode, 422);
  assert.equal(response.json().code, 'ORS_NO_ROUTE');
  assert.match(response.json().message, /no se quitarán automáticamente/);
  assert.equal(requests, 1);
});


test('truck operating context is validated and retained without inventing ORS restrictions',async()=>{
 const context={heightM:4,widthM:2.5,lengthM:18,grossWeightT:38,axleWeightT:9,axleCount:5,configuration:'T3-S2',payloadCapacityT:30.125};
 provider=async(url,options)=>{const body=JSON.parse(options.body);assert.deepEqual(body.options.profile_params.restrictions,{height:4,width:2.5,length:18,weight:38,axleload:9});assert.equal(body.options.axleCount,undefined);return Response.json({routes:[{summary:{distance:2000,duration:300},segments:[]}]});};
 const result=await plan({mode:'truck',vehicle:context},'127.5.0.1');assert.equal(result.statusCode,200);assert.deepEqual(result.json().route.vehicleContext,context);
 provider=async()=>{throw Error('Invalid operating data must not reach provider');};
 for(const vehicle of [{...context,axleCount:3},{...context,axleCount:undefined},{...context,configuration:'unknown'},{...context,payloadCapacityT:3.4999},{...context,axleCount:2.5}])assert.equal((await plan({mode:'truck',vehicle},'127.5.0.2')).statusCode,400);
});

test('alternatives preserve HGV dimensions and preferences and serialize each independent geometry',async()=>{
 const end={...origin,label:'Destino cercano',lat:25.69};
 const geometries=[encodePath([[25.67,-100.31],[25.68,-100.30],[25.69,-100.31]]),encodePath([[25.67,-100.31],[25.685,-100.32],[25.69,-100.31]]),encodePath([[25.67,-100.31],[25.68,-100.33],[25.69,-100.31]])];
 const truck={heightM:4,widthM:2.5,lengthM:18,grossWeightT:38,axleWeightT:9};
 provider=async(url,options)=>{assert.match(url.pathname,/driving-hgv/);const body=JSON.parse(options.body);assert.deepEqual(body.alternative_routes,{target_count:3,share_factor:0.6,weight_factor:1.4});assert.deepEqual(body.options.avoid_features,['tollways','highways']);assert.deepEqual(body.options.profile_params.restrictions,{height:4,width:2.5,length:18,weight:38,axleload:9});return Response.json({routes:geometries.map((geometry,i)=>({summary:{distance:3000+i*100,duration:600+i*60},geometry,way_points:[0,2],segments:[{distance:3000+i*100,duration:600+i*60,steps:[{instruction:`Opción ${i+1}`,way_points:[0,2]}]}]}))});};
 const response=await plan({destination:end,stops:[],mode:'truck',vehicle:truck,preferences:{avoidTolls:true,avoidHighways:true},alternatives:true},'127.6.0.1');assert.equal(response.statusCode,200);
 const payload=response.json(),routes=[payload.route,...payload.alternatives];assert.equal(routes.length,3);assert.deepEqual(payload.alternativeSummary,{requested:true,routeCount:3,maximumRoutes:3,omittedRoutes:0});
 for(const [i,route] of routes.entries()){assert.equal(route.polyline,geometries[i]);assert.equal(route.distanceMeters,3000+i*100);assert.equal(route.sections[0].actions[0].instruction,`Opción ${i+1}`);assert.equal(route.waypoints[1].geometryIndex,2);assert.equal(route.regulatoryCoverage.status,'not_verified');assert.deepEqual(route.vehicleContext,truck);assert.deepEqual(route.preferences,{avoidTolls:true,avoidHighways:true});}
});
test('alternatives reject intermediate deliveries and distant endpoints without consuming a provider route',async()=>{
 provider=async()=>{throw Error('Directions must not be called');};
 assert.equal((await plan({alternatives:true},'127.6.0.2')).statusCode,400);
 const response=await plan({alternatives:true,stops:[]},'127.6.0.2');assert.equal(response.statusCode,422);assert.equal(response.json().code,'ORS_ALTERNATIVES_DISTANCE_LIMIT');
});
test('alternatives discard incomplete and duplicate options, and explicitly report a single returned route',async()=>{
 const end={...origin,lat:25.68},geometry=encodePath([[25.67,-100.31],[25.68,-100.31]]),valid={geometry,way_points:[0,1],summary:{distance:1000,duration:120},segments:[]};
 provider=async()=>Response.json({routes:[valid,{...valid,summary:{distance:2000,duration:200}},{...valid,geometry:encodePath([[25.67,-100.31],[25.68,-100.32]]),summary:{duration:200}}]});
 const response=await plan({destination:end,stops:[],alternatives:true},'127.6.0.3');assert.equal(response.statusCode,200);assert.deepEqual(response.json().alternatives,[]);assert.equal(response.json().alternativeSummary.routeCount,1);assert.equal(response.json().alternativeSummary.omittedRoutes,2);
 provider=async()=>Response.json({routes:[{...valid,summary:{distance:-1,duration:100}}]});const bad=await plan({destination:end,stops:[],alternatives:true},'127.6.0.3');assert.equal(bad.statusCode,502);assert.equal(bad.json().code,'ORS_INVALID_ROUTE');
});
test('alternative provider limits remain specific and never retry with weaker restrictions',async()=>{
 let calls=0;provider=async()=>{calls++;return Response.json({error:{code:2004,message:'The approximated route distance must not be greater than 100000 meters for use with the alternative Routes algorithm.'}},{status:400});};
 const response=await plan({destination:{...origin,lat:25.68},stops:[],alternatives:true},'127.6.0.4');assert.equal(response.statusCode,422);assert.match(response.json().message,/100 km/);assert.match(response.json().message,/conservando los puntos y las restricciones/);assert.equal(calls,1);
});
