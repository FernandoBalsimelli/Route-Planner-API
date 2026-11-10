import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { distanceMeters, nearbyResults, searchFocus, prioritizeLocations, searchBounds } from '../lib/nearby.js';
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
test('an explicitly named city outranks a closer branch elsewhere in the state', () => {
  const results = [{ name:'Bodega Aurrera',label: 'Bodega Aurrera, Jiménez, Chihuahua', locality: 'Jiménez', lat: 27, lng: -104 }, { name:'Bodega Aurrera',label: 'Bodega Aurrera, Chihuahua', locality: 'Chihuahua', lat: 28.6, lng: -106 }];
  const ranked = prioritizeLocations('Bodega Aurrera Chihuahua', results, { lat: 25.6, lng: -100 });
  assert.equal(ranked.length, 1); assert.equal(ranked[0].locality, 'Chihuahua'); assert.equal(ranked[0].distanceMeters, undefined);
  assert.equal(prioritizeLocations('Bodega Aurrera, estado de Chihuahua', results, null).length, 2);
});
test('suggest endpoint sends focus upstream, sorts nearby branches and caches repeats', async () => {
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    if(url.hostname==='photon.komoot.io'){assert.equal(url.searchParams.has('bbox'),true);return Response.json({features:[]});}
    assert.equal(url.searchParams.get('focus.point.lat'), '25.68');
    assert.equal(url.searchParams.get('focus.point.lon'), '-100.31');
    return Response.json({ features: [feature('Sucursal distante', 26, -100), feature('Sucursal cercana', 25.681, -100.31)] });
  };
  const url = '/v1/locations/suggest?q=Bodega%20cercana&lat=25.68&lng=-100.31';
  const first = await app.inject({ url }); const second = await app.inject({ url });
  assert.equal(first.statusCode, 200); assert.equal(first.json().nearby, true);
  assert.equal(first.json().suggestions[0].label, 'Sucursal cercana');
  assert.deepEqual(first.json(), second.json()); assert.equal(calls, 2);
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
const photonFeature=(name,lat,lng,street='Calle Prueba',houseNumber='')=>({geometry:{coordinates:[lng,lat]},properties:{name,street,housenumber:houseNumber,city:'Monterrey',country:'México',type:'house',osm_key:'shop',osm_value:'convenience'}});
test('nearby OSM lookup runs even with a nearby primary match and retains same-brand same-postcode branches',async()=>{
 let photonCalls=0;
 globalThis.fetch=async url=>{
  if(url.hostname==='photon.komoot.io'){
   photonCalls++;assert.equal(url.searchParams.get('dedupe'),'0');assert.equal(url.searchParams.get('osm_tag'),'shop');assert.equal(url.searchParams.has('bbox'),true);
   return Response.json({features:[photonFeature('Bodega Aurrera Express',25.6801,-100.31,'Calle Cedro','101'),photonFeature('Bodega Aurrera Express',25.6802,-100.31,'Calle Cedro','103')]});
  }
  return Response.json({features:[{...feature('Bodega Aurrera Express, Monterrey',25.68,-100.32),properties:{name:'Bodega Aurrera Express',label:'Bodega Aurrera Express, Monterrey',locality:'Monterrey',layer:'venue'}}]});
 };
 const response=await app.inject('/v1/locations/suggest?q=Bodega%20Aurrera%20Express&lat=25.68&lng=-100.31');
 assert.equal(response.statusCode,200);const places=response.json().suggestions;assert.equal(places.length,3);assert.equal(photonCalls,1);assert.deepEqual(places.slice(0,2).map(point=>point.houseNumber),['101','103']);assert.ok(places.every(point=>point.distanceMeters<2000));assert.match(places[0].label,/Calle Cedro/);
});
test('an explicit Express request never substitutes a regular Aurrera or a named land-use centroid',()=>{
 const points=[{name:'Bodega Aurrera',label:'Sucursal normal',kind:'venue',lat:25,lng:-100},{name:'Bodega Aurrera Express',label:'Área comercial',kind:'locality',lat:25,lng:-100},{name:'Bodega Aurrera Express',label:'Sucursal Express',kind:'venue',lat:25.001,lng:-100}];
 assert.deepEqual(prioritizeLocations('Bodegas Aurrerá Express',points,{lat:25,lng:-100}).map(point=>point.label),['Sucursal Express']);
 assert.equal(prioritizeLocations('Mi Bodega Aurrera',points,null).length,0);
 assert.equal(prioritizeLocations('Calle Aurrera 101',points,null).length,3);
});
test('overlapping provider matches keep the richer address without merging separate adjacent storefronts',()=>{
 const points=[{name:'Sucursal',label:'Sucursal, ciudad',lat:25,lng:-100},{name:'Sucursal',label:'Sucursal, Cedro 101',street:'Cedro',houseNumber:'101',kind:'venue',lat:25.00001,lng:-100},{name:'Sucursal',label:'Sucursal, Cedro 103',street:'Cedro',houseNumber:'103',kind:'venue',lat:25.00002,lng:-100},{name:'Sucursal',label:'Sucursal, Roble 101',street:'Roble',houseNumber:'101',kind:'venue',lat:25.00003,lng:-100}];
 const result=nearbyResults(points,{lat:25,lng:-100});assert.equal(result.length,3);assert.equal(result[0].houseNumber,'101');assert.equal(result[0].street,'Cedro');
});
test('bounded lookup failure preserves primary suggestions; concurrent identical requests share provider work',async()=>{
 let calls=0;
 globalThis.fetch=async url=>{
  calls++;await new Promise(resolve=>setTimeout(resolve,10));
  if(url.hostname==='photon.komoot.io')return new Response('',{status:503});
  return Response.json({features:[feature('Tienda disponible',25.6801,-100.31)]});
 };
 const url='/v1/locations/suggest?q=Tienda%20concurrente&lat=25.68&lng=-100.31';
 const responses=await Promise.all([app.inject(url),app.inject(url),app.inject(url)]);assert.equal(calls,2);assert.ok(responses.every(response=>response.statusCode===200));assert.equal(responses[0].json().suggestions[0].label,'Tienda disponible');
});
test('search bounds enclose 50 km in Mexico and remain valid across the date line and poles',()=>{
 const bounds=searchBounds({lat:25.68,lng:-100.31}).split(',').map(Number);for(const edge of [{lat:25.68,lng:bounds[0]},{lat:25.68,lng:bounds[2]},{lat:bounds[1],lng:-100.31},{lat:bounds[3],lng:-100.31}])assert.ok(Math.abs(distanceMeters({lat:25.68,lng:-100.31},edge)-50000)<100);
 for(const focus of [{lat:89.99,lng:179.99},{lat:-89.99,lng:-179.99},{lat:0,lng:179.99}]){const [west,south,east,north]=searchBounds(focus).split(',').map(Number);assert.ok(west>=-180&&east<=180&&west<east);assert.ok(south>=-90&&north<=90&&south<north);}
});
test('malformed provider coordinates cannot become a confirmed point at zero or outside the earth',async()=>{
 globalThis.fetch=async url=>url.hostname==='photon.komoot.io'?Response.json({features:[photonFeature('Válida',25.68,-100.31),photonFeature('Nula',null,null),photonFeature('Fuera',95,180)]}):Response.json({features:[feature('Nula',null,null),feature('Fuera',95,180)]});
 const response=await app.inject('/v1/locations/suggest?q=Coordenadas%20malformadas');assert.equal(response.statusCode,200);assert.equal(response.json().suggestions.length,1);assert.equal(response.json().suggestions[0].label.startsWith('Válida'),true);
});
test('fallback outage is identified, not repeatedly queried or cached as an empty success',async()=>{
 let photonCalls=0;
 globalThis.fetch=async url=>{
  if(url.hostname==='photon.komoot.io'){photonCalls++;return new Response('',{status:429});}
  return new Response('',{status:503});
 };
 const url='/v1/locations/suggest?q=Servicio%20alterno%20agotado&lat=25.68&lng=-100.31';
 const first=await app.inject(url);assert.equal(first.statusCode,429);assert.equal(first.json().code,'PHOTON_RATE_LIMIT');assert.equal(photonCalls,1);
 globalThis.fetch=async url=>url.hostname==='photon.komoot.io'?Response.json({features:[photonFeature('Tienda recuperada',25.68,-100.31)]}):new Response('',{status:503});
 const retried=await app.inject(url);assert.equal(retried.statusCode,200);assert.match(retried.json().suggestions[0].label,/Tienda recuperada/);
});
test('local matches do not fill remaining slots with distant cities, while a named city still wins',()=>{
 const points=[{label:'Tienda, Monterrey',locality:'Monterrey',lat:25.68,lng:-100.31},{label:'Tienda, Chihuahua',locality:'Chihuahua',lat:28.66,lng:-106.09}];
 assert.deepEqual(prioritizeLocations('Tienda',points,{lat:25.68,lng:-100.31}).map(point=>point.locality),['Monterrey']);assert.deepEqual(prioritizeLocations('Tienda Chihuahua',points,{lat:25.68,lng:-100.31}).map(point=>point.locality),['Chihuahua']);
});
test('plural brand searches use the canonical singular upstream without changing the selected branch label',async()=>{
 globalThis.fetch=async url=>{
  const query=url.searchParams.get(url.hostname==='photon.komoot.io'?'q':'text');assert.equal(query,'Bodega Aurrerá Express');
  return url.hostname==='photon.komoot.io'?Response.json({features:[photonFeature('Bodega Aurrera Express',25.6801,-100.31)]}):Response.json({features:[]});
 };
 const response=await app.inject('/v1/locations/suggest?q=Bodegas%20Aurrer%C3%A1%20Express&lat=25.6801&lng=-100.31');assert.equal(response.statusCode,200);assert.match(response.json().suggestions[0].label,/Bodega Aurrera Express/);
});
