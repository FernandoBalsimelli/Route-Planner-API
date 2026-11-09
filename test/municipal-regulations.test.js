import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {municipalCatalog,municipalReference,routeRegulatoryCoverage} from '../lib/municipal-regulations.js';
const {app}=await import('../index.js');after(()=>app.close());
test('official geographic catalog has 32 entities and unique municipality codes without claiming verified traffic rules',()=>{
 const result=municipalCatalog({state:'19'});assert.equal(result.states.length,32);assert.ok(result.totalMunicipalities>=2478);assert.equal(result.fullyVerifiedMunicipalities,0);
 assert.ok(result.municipalities.some(row=>row.id==='19039'&&row.name==='Monterrey'&&row.coverage==='reference_only'));
 assert.ok(result.municipalities.every(row=>!row.routingEnforced));
 const all=municipalCatalog({q:'Monterrey'});assert.ok(all.municipalities.some(row=>row.id==='19039'));
 assert.throws(()=>municipalCatalog({state:'99'}));assert.throws(()=>municipalCatalog({limit:10000}));
});
test('Monterrey keeps all source rows, directional segments, time zones and unresolved weekend interpretation',()=>{
 const result=municipalReference('19039');assert.equal(result.trunkSegments.length,38);assert.equal(result.timeRules.length,19);assert.equal(result.routingEnforced,false);
 assert.ok(result.trunkSegments.some(row=>row.road.includes('Morones')&&row.road.includes('prohibidos carriles exprés')));
 assert.ok(result.timeRules.filter(row=>row.days.includes(6)).every(row=>row.interpretation==='requires_review'));
 assert.ok(result.timeRules.every(row=>row.timezone==='America/Monterrey'&&row.geometry===null));
 assert.match(result.source.sha256,/^[a-f0-9]{64}$/);
});
test('unknown municipalities and route coverage fail closed instead of marking roads permitted',()=>{
 const result=municipalReference('01001');assert.equal(result.status,'not_loaded');assert.equal(result.routingEnforced,false);assert.ok(result.notices.length);
 assert.equal(municipalReference('99999'),null);assert.equal(routeRegulatoryCoverage().status,'not_verified');assert.deepEqual(routeRegulatoryCoverage().municipalitiesIdentified,[]);
});
test('public municipality endpoints validate identifiers and pagination and expose provenance',async()=>{
 const list=await app.inject('/v1/regulations/municipalities?state=19&limit=600');assert.equal(list.statusCode,200);assert.equal(list.json().geographicCatalogOnly,true);
 const detail=await app.inject('/v1/regulations/municipalities/19039');assert.equal(detail.json().source.url.startsWith('https://www.monterrey.gob.mx/'),true);
 assert.equal((await app.inject('/v1/regulations/municipalities?state=99')).statusCode,400);
 assert.equal((await app.inject('/v1/regulations/municipalities/99999')).statusCode,404);
});
