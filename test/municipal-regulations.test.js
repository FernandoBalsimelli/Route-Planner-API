import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {municipalCatalog,municipalReference,routeRegulatoryCoverage} from '../lib/municipal-regulations.js';
import {boundaryProvenance,identifyMunicipalities} from '../lib/municipal-boundaries.js';
const {app}=await import('../index.js');after(()=>app.close());
function encodePath(points){let lat=0,lng=0;const encode=n=>{let value=n<0?~(n<<1):n<<1,result='';while(value>=32){result+=String.fromCharCode((value&31|32)+63);value>>=5;}return result+String.fromCharCode(value+63);};return points.map(([nextLat,nextLng])=>{const y=Math.round(nextLat*1e5),x=Math.round(nextLng*1e5),chunk=encode(y-lat)+encode(x-lng);lat=y;lng=x;return chunk;}).join('');}
test('CDMX separates selected 2021 circulation and loading evidence and corrects guide page links without automatic vehicle eligibility',async()=>{
 const response=await app.inject('/v1/regulations/municipalities/09015');assert.equal(response.statusCode,200);const entry=response.json(),rules=entry.rules.filter(r=>r.id.startsWith('cdmx-gaceta2021-'));
 assert.equal(rules.length,2);assert.deepEqual(rules.map(r=>[r.activity,r.page]),[['circulation',6],['loading',7]]);
 const doc=entry.source.relatedDocuments.find(d=>d.url===rules[0].sourceUrl);assert.equal(doc.observedSha256,'ec3c36bad93ae7ab05f8a272e121981085ea71e3636da105cbb8fa910ace976a');assert.equal(doc.bytes,4518924);assert.equal(doc.pageCount,180);assert.deepEqual(doc.pages,[6,7]);assert.equal(doc.legalValidityVerified,false);assert.equal(doc.reviewedSha256,undefined);
 for(const rule of rules){assert.equal(rule.sourceUrl,doc.url);assert.equal(rule.actEvidence.approvedAt,'2021-12-08');assert.equal(rule.publishedAt,'2021-12-15');assert.equal(rule.effectiveFrom,'2021-12-15');assert.equal(rule.actEvidence.consultedAt,'2026-11-24');assert.equal(rule.actEvidence.consolidatedThrough,undefined);assert.equal(rule.reviewStatus,'selected_provisions_only');assert.equal(rule.legalValidityVerified,false);assert.equal(rule.routingEnforced,false);assert.equal(rule.geometry,null);assert.equal(rule.window,undefined);assert.equal(rule.vehicleConditions,undefined);assert.equal(rule.limits,undefined);assert.equal(rule.timezone,'America/Mexico_City');}
 assert.match(rules[0].description,/menor a 14 m/);assert.match(rules[1].description,/máximo 14 m/);assert.match(entry.notices.join(' '),/igualdades.*inferencia/);assert.match(entry.notices.join(' '),/peso bruto, carga útil o carga por eje/);
 const guide=entry.rules.filter(r=>!r.id.startsWith('cdmx-gaceta2021-'));assert.equal(guide.length,5);for(const row of guide)assert.equal(row.page,row.id==='cdmx-maniobras'?3:2);assert.ok(entry.trunkSegments.every(r=>r.page===3));assert.equal(entry.trunkSegments.length,21);assert.deepEqual(entry.timeRules,[]);assert.equal(entry.routingEnforced,false);assert.equal(municipalCatalog().municipalitiesWithPartialReference,15);assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);
 assert.equal(municipalReference('09010').status,'not_loaded','the perimeter reference must not cover another demarcation');
});
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
 assert.equal(result.municipalitiesWithPartialReference,15);
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

test('Chihuahua capital keeps the state framework separate from planning examples and unknown local schedules', async () => {
 const entry=municipalReference('08019');assert.equal(entry.source.id,'chihuahua-capital-carga');assert.equal(entry.source.consolidatedThrough,'2026-08-08');
 assert.equal(entry.status,'reference_only');assert.equal(entry.routingEnforced,false);assert.match(entry.scope,/08019/);
 const legal=entry.rules.find(rule=>rule.id==='chih-art66'),proposal=entry.rules.find(rule=>rule.id==='chih-mo44');
 assert.equal(legal.kind,'legal_framework');assert.equal(legal.scheduleStatus,'authority_schedule_not_verified');assert.equal(legal.timezone,'America/Chihuahua');assert.equal(legal.page,25);
 assert.equal(proposal.kind,'planning_proposal');assert.equal(proposal.interpretation,'planning_only_not_operational_rule');assert.equal(proposal.page,390);assert.notEqual(proposal.sourceUrl,entry.source.url);
 assert.ok(entry.source.relatedUrls.includes(proposal.sourceUrl));assert.match(proposal.description,/ejemplos/);
 for(const rule of entry.rules){assert.equal(rule.window,undefined);assert.equal(rule.vehicleConditions,undefined);assert.equal(rule.limits,undefined);assert.equal(rule.geometry,null);assert.equal(rule.routingEnforced,false);}
 assert.deepEqual(entry.timeRules,[]);assert.deepEqual(entry.trunkSegments,[]);
 for(const id of ['08002','08004'])assert.equal(municipalReference(id).status,'not_loaded','a metropolitan program cannot add legal coverage to adjacent municipalities');
 const response=await app.inject('/v1/regulations/municipalities/08019');assert.equal(response.statusCode,200);assert.equal(response.json().rules[1].kind,'planning_proposal');
 const coverage=routeRegulatoryCoverage(encodePath([[28.63,-106.07],[28.65,-106.08]]));assert.equal(coverage.status,'not_verified');assert.ok(coverage.municipalitiesIdentified.some(row=>row.id==='08019'&&row.coverage==='reference_only'&&!row.routingEnforced));
 assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);
});

test('Chihuahua preserves the historical consolidation and separately identifies the November amendment without inventing schedules',async()=>{
 const entry=municipalReference('08019'),old=entry.rules.find(r=>r.id==='chih-art66'),amendment=entry.rules.find(r=>r.id==='chih-art66-20261121');
 assert.equal(entry.source.consolidatedThrough,'2026-08-08');assert.equal(old.interpretation,'historical_text_superseded_in_part');assert.equal(old.supersededFrom,'2026-11-22');assert.match(old.description,/histórico/);
 assert.equal(amendment.page,32);assert.equal(amendment.publishedAt,'2026-11-21');assert.equal(amendment.effectiveFrom,'2026-11-22');assert.equal(amendment.reviewStatus,'selected_provisions_only');assert.equal(amendment.interpretation,'requires_regulatory_implementation_review');
 assert.ok(entry.source.relatedUrls.includes(amendment.sourceUrl));const doc=entry.source.relatedDocuments.find(d=>d.url===amendment.sourceUrl);assert.deepEqual(doc.pages,[3,4,32,42]);assert.equal(doc.reviewedSha256,undefined);assert.match(doc.observedSha256,/^[a-f0-9]{64}$/);
 assert.equal(amendment.window,undefined);assert.equal(amendment.geometry,null);assert.equal(amendment.routingEnforced,false);assert.equal(amendment.limits,undefined);assert.equal(amendment.scheduleStatus,'authority_regulation_not_verified');assert.deepEqual(entry.timeRules,[]);assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);
 const response=await app.inject('/v1/regulations/municipalities/08019');assert.equal(response.statusCode,200);assert.ok(response.json().rules.some(r=>r.id===amendment.id));
});


test('Puebla keeps consolidated loading and parking references separate from permissions, vehicle limits and routing',async()=>{
 const entry=municipalReference('21114'),rows=entry.rules.filter(rule=>rule.id.startsWith('pue-coremun-'));
 assert.equal(rows.length,4);assert.equal(municipalCatalog().municipalitiesWithPartialReference,15);
 for(const rule of rows){
  assert.equal(rule.geometry,null);assert.equal(rule.routingEnforced,false);assert.equal(rule.interpretation,'requires_review');
  assert.equal(rule.evidence.jurisdiction,'Municipio de Puebla · INEGI 21114');assert.equal(rule.evidence.consolidatedThrough,'2025-12-10');
  assert.equal(rule.evidence.reviewStatus,'selected_provisions_only');assert.equal(rule.evidence.officialGazetteStatus,'not_fully_verified');
  assert.equal(rule.evidence.sha256,'b8015929109522726f95e0d9278564592757bcd2a690abe0a326e898ae1c891f');
  assert.ok(entry.source.relatedUrls.includes(rule.sourceUrl));assert.equal(rule.timezone,'America/Mexico_City');
  for(const field of ['window','limits','vehicleConditions','vehicleConfigurations','lengthWithoutSpecialAuthorizationM'])assert.equal(rule[field],undefined,'partial operational evidence must not create a route permission or inferred vehicle comparison');
 }
 const loading=rows.find(row=>row.activity==='loading');assert.equal(loading.page,159);assert.equal(loading.scheduleStatus,'authority_schedule_not_verified');
 const commercial=rows.find(row=>row.activity==='circulation');assert.equal(commercial.page,160);
 const dwell=rows.find(row=>row.maximumDwellMinutes);assert.equal(dwell.activity,'parking');assert.equal(dwell.maximumDwellMinutes,30);assert.equal(dwell.operationMinutes+dwell.toleranceMinutes,30);
 const restricted=rows.find(row=>row.thresholdReference);assert.equal(restricted.activity,'parking');assert.equal(restricted.page,176);assert.equal(restricted.thresholdReference.quantity,'not_specified_in_cited_article');assert.equal(restricted.thresholdReference.operator,'gt');
 const response=await app.inject('/v1/regulations/municipalities/21114');assert.equal(response.statusCode,200);assert.equal(response.json().rules.filter(row=>row.id.startsWith('pue-coremun-')&&row.evidence).length,4);assert.equal(response.json().routingEnforced,false);
 assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);
});


test('Puebla rotating-parking loading references preserve inclusive capacity, midnight, permits and unresolved jurisdiction geometry',()=>{
 const entry=municipalReference('21114'),rows=entry.rules.filter(row=>row.id.startsWith('pue-rotativo-2025-'));
 assert.equal(rows.length,3);
 for(const row of rows){assert.equal(row.activity,'loading');assert.equal(row.routingEnforced,false);assert.equal(row.geometry,null);assert.equal(row.actEvidence.approvedAt,'2025-08-14');assert.equal(row.actEvidence.consolidatedThrough,undefined);assert.equal(row.page,70);assert.equal(row.actEvidence.reviewStatus,'selected_provisions_only');assert.ok(entry.source.relatedUrls.includes(row.sourceUrl));assert.equal(row.requiresPermit,true);assert.equal(row.evidence,undefined,'older clients must not receive an evidence object without the consolidation date they require');}
 const inclusive=rows.find(row=>row.id.endsWith('-hasta')),larger=rows.find(row=>row.id.endsWith('-mayor')),permit=rows.find(row=>row.id.endsWith('-permiso'));
 assert.deepEqual(inclusive.vehicleConditions,{payloadCapacityT:{lte:3.5}});assert.equal(inclusive.window.start,'08:00');assert.equal(inclusive.window.end,'20:59');
 assert.deepEqual(larger.vehicleConditions,{payloadCapacityT:{gt:3.5}});assert.equal(larger.window.start,'21:00');assert.equal(larger.window.end,'07:00');assert.equal(larger.endsNextDay,true);
 for(const row of [inclusive,larger]){assert.equal(row.window.days,null);assert.equal(row.window.timezone,'America/Mexico_City');assert.equal(row.window.effect,'loading_reference_only');assert.equal(row.excludesRestrictedSubstances,true);}
 assert.equal(permit.operationMinutes,20);assert.equal(permit.toleranceMinutes,10);assert.equal(permit.window,undefined);
 assert.deepEqual(entry.rules.find(row=>row.id==='pue-capacidad-menor').vehicleConditions,{payloadCapacityT:{lt:3.5}},'a different source keeps its strict boundary');
 assert.equal(entry.rules.find(row=>row.id==='pue-coremun-rotativo-restriccion').thresholdReference.quantity,'not_specified_in_cited_article');
 assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);
});

test('Puebla parking annex preserves all source records, duplicate rows, split pages and limited operational scope',async()=>{
 const reference=municipalReference('21114'),annex=reference.parkingCorridorReference;
 assert.equal(annex.activity,'parking_operation');assert.equal(annex.status,'reference_only');assert.equal(annex.routingEnforced,false);assert.equal(annex.timezone,'America/Mexico_City');
 assert.equal(annex.rows.length,128);assert.deepEqual(annex.rows.map(row=>row.sourceRow),Array.from({length:128},(_,i)=>i+1));
 assert.equal(new Set(annex.rows.map(row=>row.polygon)).size,6);assert.equal(annex.rows.filter(row=>row.polygon.startsWith('Polígono 5 ')).length,8);assert.equal(annex.rows.filter(row=>row.polygon.startsWith('Polígono 6 ')).length,4);
 assert.deepEqual(annex.duplicateGroups,[[10,15],[126,128]]);assert.deepEqual(annex.rows[123].sourcePages,[87,88]);assert.match(annex.rows[123].polygon,/San Alejandro - Ortopedia/);
 assert.equal(annex.source.sha256,'0917dc30ac70594a6e954243800bc5219d7ea3f2bc8017f7ea532b8ec510555c');assert.deepEqual(annex.source.pages,[80,81,82,83,84,85,86,87,88]);assert.ok(reference.source.relatedUrls.includes(annex.source.url));
 assert.equal(annex.source.publicationAndCurrentValidity,'not_fully_verified');assert.equal(annex.source.entryIntoForce.publicationDate,null);assert.equal(annex.source.entryIntoForce.sourcePage,80);assert.match(annex.notices.join(' '),/No aplica.*no significa circulación libre/);
 for(const row of annex.rows){
  assert.equal(row.geometry,null);assert.equal(row.geometryStatus,'not_validated');assert.equal(row.directionStatus,'not_specified_in_annex');assert.equal(row.routingEnforced,false);assert.equal(row.rawCells,undefined);assert.equal(row.rawPolygonContinuation,undefined);
  assert.equal(row.schedules[0].start,'08:00');assert.equal(row.schedules[0].end,'22:00');assert.deepEqual(row.schedules[0].days,[1,2,3,4,5]);
  assert.equal(row.schedules[1].start,'11:00');assert.equal(row.schedules[1].end,'17:00');
 }
 assert.equal(annex.rows.filter(row=>row.schedules[2].status==='hours_cited').length,41);assert.equal(annex.rows.filter(row=>row.schedules[2].status==='not_applicable_in_source').length,87);
 for(const id of ['19039','08019','01001'])assert.equal(municipalReference(id).parkingCorridorReference,undefined);
 const response=await app.inject('/v1/regulations/municipalities/21114');assert.equal(response.statusCode,200);assert.equal(response.json().parkingCorridorReference.rows.length,128);assert.equal(response.json().timeRules.length,0,'parking schedules must not become routing or loading windows');
 assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);assert.equal(municipalCatalog().municipalitiesWithPartialReference,15);
});

test('Puebla publication history distinguishes official publication, superseded sanction dates and unverified present validity',async()=>{
 const annex=municipalReference('21114').parkingCorridorReference,review=annex.publicationReview;
 assert.equal(review.status,'partial_history');assert.equal(review.routingEnforced,false);assert.equal(review.municipalityId,'21114');assert.equal(review.reviewedAt,'2026-11-16');
 assert.equal(annex.source.entryIntoForce.publicationDate,null);assert.match(review.publication.scope,/no certifica publicación íntegra/);
 assert.deepEqual(review.publication.sourceIds,['gazette148','res162']);assert.equal(review.publication.date,'2025-08-14');
 const [original,amendment]=review.records;
 assert.equal(original.approvedAt,'2025-08-14');assert.equal(original.publishedAt,'2025-08-14');assert.equal(original.sanctions.fromDate,'2025-10-01');assert.equal(original.sanctions.status,'superseded');assert.equal(original.sanctions.supersededBy,amendment.resolution);
 assert.equal(amendment.approvedAt,'2025-09-18');assert.equal(amendment.publishedAt,'2025-09-18');assert.equal(amendment.sanctions.fromDate,'2025-11-01');assert.equal(amendment.sanctions.status,'amended_date_cited');assert.match(amendment.scope,/Sólo Polígono 5/);
 const source=municipalReference('21114').source;
 assert.equal(review.sources.length,4);
 for(const evidence of review.sources){assert.equal(evidence.http,200);assert.match(evidence.sha256,/^[a-f0-9]{64}$/);assert.equal(evidence.reviewStatus,'selected_sections_only');assert.ok(source.relatedUrls.includes(evidence.url));assert.equal(new URL(evidence.url).hostname,'gaceta.pueblacapital.gob.mx');}
 assert.ok(review.records.every(record=>record.sourceIds.every(id=>review.sources.some(source=>source.id===id))));
 assert.match(review.notices.join(' '),/2026.*no se han revisado exhaustivamente/);
 assert.equal(annex.rows.length,128);assert.deepEqual(annex.duplicateGroups,[[10,15],[126,128]]);assert.deepEqual(municipalReference('21114').timeRules,[]);
 assert.equal(municipalReference('19039').parkingCorridorReference,undefined);assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);
 const raw=(await import('../data/mx/21114-parking-corridors.json',{with:{type:'json'}})).default;assert.equal(raw.source.entryIntoForce.publicationDate,null,'the reproducible PDF extraction remains unchanged');
});

test('Puebla annex comparison preserves 128 source occurrences and links both versions without legal approval or changing the original snapshot',async()=>{
 const {default:baseline}=await import('../data/mx/21114-parking-corridors.json',{with:{type:'json'}});const {default:comparison}=await import('../data/mx/21114-parking-comparison.json',{with:{type:'json'}});
 assert.equal(comparison.status,'selected_fields_match_after_normalization');assert.equal(comparison.routingEnforced,false);assert.equal(comparison.legalValidityVerified,false);assert.equal(comparison.matchedRows,128);assert.equal(comparison.extractedTextDifferenceCount,29);assert.equal(comparison.extractedTextDifferences.length,29);
 assert.deepEqual(comparison.extractedTextDifferences.map(r=>r.sourceRow),[38,41,...Array.from({length:27},(_,i)=>i+42)]);
 assert.equal(comparison.documents[0].sha256,baseline.source.sha256);assert.deepEqual(comparison.documents[0].pages,baseline.source.pages);assert.equal(comparison.documents[1].sha256,'1244f0f66db366f8b0f4612c32b64a6a857bc5d9f41c5117843448e95088a8a8');
 assert.deepEqual(comparison.rows.map(r=>r.sourceRow),baseline.rows.map(r=>r.sourceRow));assert.deepEqual(comparison.duplicateGroups,baseline.duplicateGroups);
 const response=await app.inject('/v1/regulations/municipalities/21114');assert.equal(response.statusCode,200);const annex=response.json().parkingCorridorReference;
 assert.equal(annex.annexComparison.rows,undefined);assert.equal(annex.annexComparison.extractedTextDifferences,undefined,'extracted differences stay in versioned evidence, not every response');
 for(const row of annex.rows){const original=baseline.rows.find(r=>r.sourceRow===row.sourceRow),map=comparison.rows.find(r=>r.sourceRow===row.sourceRow);assert.deepEqual(row.sourcePages,original.sourcePages);assert.deepEqual(row.publishedSourcePages,map.publishedPages);assert.ok(row.publishedSourcePages.every(n=>n>=1&&n<=7));assert.equal(row.polygon,original.polygon);assert.equal(row.corridor,original.corridor);assert.deepEqual(row.schedules,original.schedules);assert.equal(row.geometry,null);assert.equal(row.routingEnforced,false);}
 const split=annex.rows.find(r=>r.sourceRow===124);assert.deepEqual(split.sourcePages,[87,88]);assert.deepEqual(split.publishedSourcePages,[7]);assert.deepEqual(comparison.polygonCounts.map(r=>r.count),[41,27,19,29,8,4]);assert.equal(baseline.source.entryIntoForce.publicationDate,null);assert.equal(municipalReference('19039').parkingCorridorReference,undefined);assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);
});

test('Puebla loading article review adds counterpart evidence only to its three existing references without changing thresholds, permits or routing',async()=>{
 const {default:original}=await import('../data/mx/national-references.json',{with:{type:'json'}});const {default:review}=await import('../data/mx/21114-loading-review.json',{with:{type:'json'}});
 const source=original.packages.find(p=>p.municipalityIds.includes('21114'));const puebla=municipalReference('21114');
 assert.equal(review.status,'selected_text_matches_after_whitespace');assert.equal(review.routingEnforced,false);assert.equal(review.legalValidityVerified,false);assert.deepEqual(review.articles.map(a=>a.number),[11,12,13]);assert.deepEqual(review.documents.map(d=>d.pages),[[70],[7]]);assert.ok(review.articles.every(a=>/^[a-f0-9]{64}$/.test(a.normalizedSha256)&&a.characters>250));
 for(const rule of puebla.rules){const {documentReview,...rest}=rule;assert.deepEqual(rest,source.rules.find(r=>r.id===rule.id));if(review.ruleArticles[rule.id]){assert.deepEqual(documentReview.articles.map(a=>a.number),review.ruleArticles[rule.id]);assert.equal(documentReview.municipalityId,'21114');assert.equal(documentReview.legalValidityVerified,false);assert.equal(documentReview.ruleArticles,undefined);}else assert.equal(documentReview,undefined);}
 const response=await app.inject('/v1/regulations/municipalities/21114');assert.equal(response.statusCode,200);const rules=response.json().rules;assert.equal(rules.filter(r=>r.documentReview).length,3);assert.deepEqual(rules.find(r=>r.id==='pue-rotativo-2025-hasta').vehicleConditions,{payloadCapacityT:{lte:3.5}});assert.deepEqual(rules.find(r=>r.id==='pue-capacidad-menor').vehicleConditions,{payloadCapacityT:{lt:3.5}});assert.equal(rules.find(r=>r.id==='pue-rotativo-2025-permiso').operationMinutes,20);assert.equal(response.json().timeRules.length,0);assert.equal(municipalReference('08019').rules.some(r=>r.documentReview),false);assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);
});
