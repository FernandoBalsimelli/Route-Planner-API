import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {municipalCatalog,municipalReference,routeRegulatoryCoverage} from '../lib/municipal-regulations.js';
import {boundaryProvenance,identifyMunicipalities} from '../lib/municipal-boundaries.js';
const {app}=await import('../index.js');after(()=>app.close());
function encodePath(points){let lat=0,lng=0;const encode=n=>{let value=n<0?~(n<<1):n<<1,result='';while(value>=32){result+=String.fromCharCode((value&31|32)+63);value>>=5;}return result+String.fromCharCode(value+63);};return points.map(([nextLat,nextLng])=>{const y=Math.round(nextLat*1e5),x=Math.round(nextLng*1e5),chunk=encode(y-lat)+encode(x-lng);lat=y;lng=x;return chunk;}).join('');}
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
test('official December 2025 boundaries identify route jurisdictions without claiming legal enforcement',()=>{
 const provenance=boundaryProvenance();assert.equal(provenance.municipalityCount,2478);assert.match(provenance.sourceDescription.join(' '),/diciembre de 2025/);assert.equal(provenance.use,'jurisdiction_identification_only');
 const polyline=encodePath([[25.67,-100.35],[25.67,-100.20]]),identified=identifyMunicipalities(polyline);
 assert.equal(identified.status,'identified_approximate');assert.ok(identified.municipalities.some(item=>item.id==='19039'&&item.name==='Monterrey'));assert.ok(identified.municipalities.some(item=>item.id==='19026'&&item.name==='Guadalupe'));
 const coverage=routeRegulatoryCoverage(polyline);assert.equal(coverage.status,'not_verified');assert.equal(coverage.municipalGeometryEnforced,false);assert.equal(coverage.municipalitiesWithReference,1);assert.ok(coverage.municipalitiesWithoutRules>=1);assert.equal(coverage.municipalitiesIdentified.find(item=>item.id==='19039').coverage,'reference_only');assert.ok(coverage.municipalitiesIdentified.every(item=>!item.routingEnforced));assert.match(coverage.message,/aproximadamente/);
});
test('outside-Mexico and malformed geometries remain unresolved instead of reporting an empty legal route',()=>{
 for(const geometry of [encodePath([[40.7,-74.1],[40.8,-73.9]]),'not a polyline']){const result=routeRegulatoryCoverage(geometry);assert.equal(result.municipalityIdentification,'unresolved');assert.deepEqual(result.municipalitiesIdentified,[]);assert.equal(result.requiresOperatorReview,true);assert.match(result.message,/No se pudieron identificar/);}
});
test('public municipality endpoints validate identifiers and pagination and expose provenance',async()=>{
 const list=await app.inject('/v1/regulations/municipalities?state=19&limit=600');assert.equal(list.statusCode,200);assert.equal(list.json().geographicCatalogOnly,true);
 const detail=await app.inject('/v1/regulations/municipalities/19039');assert.equal(detail.json().source.url.startsWith('https://www.monterrey.gob.mx/'),true);
 assert.equal((await app.inject('/v1/regulations/municipalities?state=99')).statusCode,400);
 assert.equal((await app.inject('/v1/regulations/municipalities/99999')).statusCode,404);
});
test('entities and municipalities sort alphabetically before pagination without featuring Nuevo León',()=>{
 const result=municipalCatalog({state:'19',limit:600});assert.equal(result.states[0].name,'Aguascalientes');assert.equal(result.municipalities[0].name,'Abasolo');
 assert.deepEqual(municipalCatalog({state:'19',limit:2,offset:2}).municipalities,result.municipalities.slice(2,4));
 assert.equal(result.municipalitiesWithPartialReference,14);
});
test('new references preserve metropolitan scope, actual vehicle classes and unknown legal geometry',()=>{
 const jal=municipalReference('14039');assert.match(jal.scope,/Polígono/);assert.equal(jal.rules.find(rule=>rule.id==='jal-dobles').window.start,'06:00');assert.equal(jal.rules.find(rule=>rule.id==='jal-dobles').window.days,null);assert.deepEqual(jal.rules.find(rule=>rule.id==='jal-unitarios').vehicleConfigurations,['C2','C3']);
 for(const id of ['14039','08027','08037','09015']){const entry=municipalReference(id);assert.equal(entry.status,'reference_only');assert.equal(entry.routingEnforced,false);assert.ok(entry.rules.every(rule=>rule.geometry===null&&!rule.routingEnforced));}
 assert.equal(municipalReference('09015').trunkSegments.length,21);assert.match(municipalReference('08037').notices.join(' '),/histórica/);
});


test('Puebla separates amended loading windows, payload capacity, historical zones and repealed provisions', async () => {
 const entry=municipalReference('21114');assert.equal(entry.status,'reference_only');assert.equal(entry.routingEnforced,false);
 assert.equal(entry.source.id,'puebla-carga');assert.equal(entry.source.approvedAt,'2021-12-28');assert.equal(entry.source.publicationDateStatus,'requires_official_gazette_verification');
 const lower=entry.rules.find(rule=>rule.id==='pue-capacidad-menor'),higher=entry.rules.find(rule=>rule.id==='pue-capacidad-mayor');
 assert.deepEqual(lower.vehicleConditions,{payloadCapacityT:{lt:3.5}});assert.deepEqual(higher.vehicleConditions,{payloadCapacityT:{gt:3.5}});
 assert.equal(lower.window.start,'09:30');assert.equal(higher.window.end,'07:00');assert.equal(higher.endsNextDay,true);assert.equal(higher.requiresOffStreetOperations,true);
 assert.equal(lower.window.days,null);assert.equal(higher.window.timezone,'America/Mexico_City');
 const historic=entry.rules.find(rule=>rule.id==='pue-zona-monumentos');assert.equal(historic.limits.grossWeightT,13);assert.equal(historic.limits.lengthM,12.5);assert.equal(historic.limits.heightM,4.25);assert.deepEqual(historic.vehicleConfigurations,['C2']);
 assert.equal(entry.rules.find(rule=>rule.id==='pue-centro-largo').lengthWithoutSpecialAuthorizationM,11);
 assert.deepEqual(entry.supersededProvisions[0].provisions,['Octavo','Noveno','Decimotercero']);
 assert.ok(entry.rules.every(rule=>rule.geometry===null&&!rule.routingEnforced&&rule.interpretation==='requires_review'));
 assert.match(entry.notices.join(' '),/exactamente igual a 3.5/);assert.match(entry.notices.join(' '),/vigencia actual/i);
 const response=await app.inject('/v1/regulations/municipalities/21114');assert.equal(response.statusCode,200);assert.equal(response.json().source.id,'puebla-carga');
 assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);
});
