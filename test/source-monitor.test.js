import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkSource,download} from '../scripts/check-official-sources.mjs';
import {sourceStatus} from '../lib/source-monitor.js';
const source={id:'fixture',url:'https://official.gob.mx/rules.pdf',reviewedSha256:null};
test('source changes require review; first download is never legal approval and failure retains last evidence',async()=>{
 const first=await checkSource(source,{},async()=>new Response('version one'));
 assert.equal(first.status,'unreviewed');
 const same=await checkSource(source,first,async()=>new Response('version one'));assert.equal(same.status,'unreviewed');
 const changed=await checkSource(source,same,async()=>new Response('version two'));assert.equal(changed.status,'changed');
 const stillChanged=await checkSource(source,changed,async()=>new Response('version two'));assert.equal(stillChanged.status,'changed');
 const unavailable=await checkSource(source,changed,async()=>new Response('',{status:503}));assert.equal(unavailable.status,'unavailable');assert.equal(unavailable.sha256,changed.sha256);assert.equal(unavailable.lastSuccessAt,changed.lastSuccessAt);assert.equal(unavailable.error,'HTTP_503');
 const reviewed=await checkSource({...source,reviewedSha256:changed.sha256},changed,async()=>new Response('version two'));assert.equal(reviewed.status,'unchanged');
});
test('monitor blocks nonofficial redirects, oversized and empty responses without disclosing network errors',async()=>{
 let calls=0;
 await assert.rejects(()=>download(source.url,new Set(['official.gob.mx']),async()=>{calls++;return new Response('',{status:302,headers:{location:'https://private.example/secrets'}});}),/UNAPPROVED_REDIRECT/);assert.equal(calls,1);
 await assert.rejects(()=>download(source.url,new Set(['official.gob.mx']),async()=>new Response('x',{headers:{'content-length':'999999999'}})),/DOCUMENT_TOO_LARGE/);
 const empty=await checkSource(source,{},async()=>new Response(''));assert.equal(empty.error,'EMPTY_DOCUMENT');
 const failed=await checkSource(source,{},async()=>{throw Error('sensitive details from network');});assert.equal(failed.error,'NETWORK_OR_TIMEOUT');
});

test('declared large official annexes use a bounded limit without weakening default or streaming checks',async()=>{
 const hosts=new Set(['official.gob.mx']);
 const annex=async()=>new Response('fixture',{headers:{'content-length':String(23352913)}});
 await assert.rejects(()=>download(source.url,hosts,annex),/DOCUMENT_TOO_LARGE/);
 const monitored=await checkSource({...source,documentByteLimit:24*1024*1024},{},annex);assert.equal(monitored.availability,'available');
 let fetched=false;
 await assert.rejects(()=>download(source.url,hosts,async()=>{fetched=true;return new Response('x');},33*1024*1024),/INVALID_DOCUMENT_LIMIT/);assert.equal(fetched,false);
 await assert.rejects(()=>download(source.url,hosts,async()=>new Response('12345'),4),/DOCUMENT_TOO_LARGE/);
});
test('SPA monitoring checks the current same-host main bundle and detects content changes',async()=>{
 const spa={...source,url:'https://official.gob.mx/',watchMainScript:true};
 const fetcher=version=>async url=>new URL(url).pathname==='/'?new Response('<script src="main.abc.js"></script>'):new Response(version);
 const first=await checkSource(spa,{},fetcher('rules one'));assert.equal(first.status,'unreviewed');
 const changed=await checkSource(spa,first,fetcher('rules two'));assert.equal(changed.status,'changed');
 const missing=await checkSource(spa,first,async()=>new Response('<html>No script</html>'));assert.equal(missing.status,'unavailable');assert.equal(missing.error,'MAIN_SCRIPT_NOT_FOUND');
});
test('missing, old and future reports are stale and never claim automated legal updates',()=>{
 for(const checkedAt of [null,'2020-01-01T00:00:00Z','2099-01-01T00:00:00Z']){const report=sourceStatus({checkedAt,sources:[]});assert.equal(report.stale,true);assert.equal(report.legalRulesAutomaticallyUpdated,false);assert.ok(report.sources.every(row=>row.status==='not_checked'));}
 const report=sourceStatus({checkedAt:new Date().toISOString(),sources:[]});assert.equal(report.stale,false);assert.equal(report.intervalHours,6);
});


test('a linked outage retains the newly verified principal and identifies the exact failing URL',async()=>{
 const linked={...source,relatedUrls:['https://official.gob.mx/gazette']};
 const first=await checkSource(linked,{},async()=>new Response('original'),'2026-11-10T00:00:00Z');
 const result=await checkSource(linked,first,async url=>new URL(url).pathname==='/rules.pdf'?new Response('amended document'):new Response('',{status:503}),'2026-11-10T01:00:00Z');
 assert.equal(result.status,'unavailable');assert.equal(result.availability,'partial');assert.equal(result.changeDetected,true);assert.deepEqual(result.changeKinds,['primary']);
 assert.equal(result.documents[0].status,'changed');assert.notEqual(result.sha256,first.sha256);assert.equal(result.primaryLastSuccessAt,'2026-11-10T01:00:00Z');assert.equal(result.lastSuccessAt,first.lastSuccessAt);
 assert.equal(result.documents[1].url,linked.relatedUrls[0]);assert.equal(result.documents[1].error,'HTTP_503');assert.equal(result.documents[1].lastSuccessAt,first.checkedAt);
 const down=await checkSource(linked,result,async()=>new Response('',{status:503}));assert.equal(down.changeDetected,true);assert.equal(down.sha256,result.sha256);assert.equal(down.availability,'unavailable');
});

test('related page changes remain distinct from unchanged reviewed regulations and survive legacy checkpoints',async()=>{
 const related='https://official.gob.mx/gazette',linked={...source,relatedUrls:[related]};
 const first=await checkSource(linked,{},async()=>new Response('original'));
 const legacy={...first};delete legacy.documents;
 const current=await checkSource({...linked,reviewedSha256:first.sha256},legacy,async url=>new URL(url).pathname==='/rules.pdf'?new Response('original'):new Response('new gazette page'));
 assert.equal(current.documents[0].status,'unchanged');assert.deepEqual(current.changeKinds,['related']);assert.equal(current.changeDetected,true);assert.equal(current.relatedSetChanged,false);
 assert.equal(current.documents[1].status,'changed');
 const legacyDown={...current};delete legacyDown.documents;
 const failed=await checkSource(linked,legacyDown,async()=>new Response('',{status:503}));assert.equal(failed.changeDetected,true);
});

test('primary failure still checks declared related pages and does not invent a changed SPA bundle',async()=>{
 const spa={...source,watchMainScript:true,relatedUrls:['https://official.gob.mx/gazette']};
 const first=await checkSource(spa,{},async url=>new URL(url).pathname==='/rules.pdf'?new Response('<script src="main.one.js"></script>'):new Response('original'));
 const failed=await checkSource(spa,first,async url=>new URL(url).pathname==='/gazette'?new Response('new listing'):new Response('',{status:503}));
 assert.equal(failed.availability,'partial');assert.deepEqual(failed.changeKinds,['related']);assert.equal(failed.relatedSetChanged,false);assert.equal(failed.documents.at(-1).error,'SCRIPT_DISCOVERY_UNAVAILABLE');
});

test('first success after a related outage remains unreviewed and a changed bundle URL is explicit',async()=>{
 const spa={...source,watchMainScript:true};
 const first=await checkSource(spa,{},async url=>new URL(url).pathname==='/rules.pdf'?new Response('<script src="main.one.js"></script>'):new Response('',{status:503}));
 const recovered=await checkSource(spa,first,async url=>new URL(url).pathname==='/rules.pdf'?new Response('<script src="main.one.js"></script>'):new Response('bundle'));
 assert.equal(recovered.documents[1].status,'unreviewed');assert.equal(recovered.status,'unreviewed');
 const moved=await checkSource(spa,recovered,async url=>new URL(url).pathname==='/rules.pdf'?new Response('<script src="main.two.js"></script>'):new Response('bundle'));
 assert.equal(moved.relatedSetChanged,true);assert.equal(moved.changeDetected,true);
});

test('public reports independently mark stale evidence and reject injected document URLs and error details',()=>{
 const now=Date.parse('2026-11-10T12:00:00Z');
 const id='monterrey-transito';
 const official='https://www.monterrey.gob.mx/pdf/portaln/reglamentos/Reglamento%20de%20Transito%20y%20Vialidad%20del%20Municipio%20de%20Monterrey.pdf';
 const report=sourceStatus({checkedAt:new Date(now).toISOString(),sources:[{id,status:'unavailable',availability:'partial',changeDetected:true,checkedAt:'2020-01-01T00:00:00Z',documents:[{kind:'primary',url:official,status:'changed',checkedAt:'2020-01-01T00:00:00Z',error:'sensitive details'},{kind:'related',url:'javascript:alert(1)',status:'changed'}]}]},now);
 const row=report.sources.find(row=>row.id===id);assert.equal(report.stale,false);assert.equal(row.stale,true);assert.equal(row.changeDetected,true);assert.equal(row.documents.length,1);assert.equal(row.documents[0].stale,true);assert.equal(row.documents[0].error,'NETWORK_OR_TIMEOUT');assert.equal(row.documentBreakdownAvailable,true);
 assert.ok(report.sources.filter(row=>row.id!==id).every(row=>row.stale&&row.status==='not_checked'));
});


test('a delayed remote checkpoint cannot replace newer bundled evidence and concurrent readers share one fetch',async()=>{
 const {getSourceStatus}=await import('../lib/source-monitor.js');
 const {default:snapshot}=await import('../data/mx/source-status.json',{with:{type:'json'}});
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return Response.json({schemaVersion:1,checkedAt:'2020-01-01T00:00:00Z',sources:[]});};
  const [a,b]=await Promise.all([getSourceStatus(),getSourceStatus()]);assert.equal(a.checkedAt,snapshot.checkedAt);assert.deepEqual(a,b);assert.equal(calls,1);assert.ok(a.sources.some(row=>row.documentBreakdownAvailable));
 }finally{globalThis.fetch=original;}
});


test('Puebla watches the actual consolidated PDF and detects changes behind unchanged pages without legal approval',async()=>{
 const {officialSources}=await import('../lib/source-monitor.js');
 const puebla=officialSources.find(row=>row.id==='puebla-carga');
 const pdf='https://gaceta.pueblacapital.gob.mx/media/k2/attachments/COREMUN.pdf';
 assert.ok(puebla.relatedUrls.includes(pdf));
 const original=await checkSource(puebla,{},async url=>new Response(String(url)===pdf?'PDF version one':'same wrapper'));
 const initial=original.documents.find(row=>row.url===pdf);
 assert.equal(initial.status,'unreviewed');assert.equal(initial.changeDetected,false);
 const next=await checkSource(puebla,original,async url=>new Response(String(url)===pdf?'PDF version two':'same wrapper'));
 const exposed=sourceStatus({schemaVersion:1,checkedAt:next.checkedAt,sources:[next]}).sources.find(row=>row.id===puebla.id);
 assert.equal(exposed.documents.find(row=>row.url===pdf).status,'changed');
 assert.equal(exposed.documents.find(row=>row.url===pdf).changeDetected,true);
 assert.equal(exposed.legalReview,'validity_requires_review');
 assert.equal(sourceStatus().legalRulesAutomaticallyUpdated,false);
});


test('Juárez watches its 2026 operational notice separately without approving or enforcing it',async()=>{
 const {officialSources}=await import('../lib/source-monitor.js');
 const {municipalReference,municipalCatalog}=await import('../lib/municipal-regulations.js');
 const source=officialSources.find(row=>row.id==='juarez-carga');
 const notice=source.relatedUrls.find(url=>url.includes('/noticia/34586/'));assert.ok(notice);
 const before=await checkSource(source,{},async url=>new Response(String(url)===notice?'notice version one':'same source'));
 assert.equal(before.documents.find(row=>row.url===notice).status,'unreviewed');
 const after=await checkSource(source,before,async url=>new Response(String(url)===notice?'notice version two':'same source'));
 const publicReport=sourceStatus({checkedAt:after.checkedAt,sources:[after]});const row=publicReport.sources.find(row=>row.id==='juarez-carga').documents.find(row=>row.url===notice);
 assert.equal(row.changeDetected,true);assert.equal(publicReport.legalRulesAutomaticallyUpdated,false);
 const reference=municipalReference('08037');assert.ok(reference.notices.some(text=>text.includes('08-09-2026')));assert.equal(reference.routingEnforced,false);assert.deepEqual(reference.timeRules,[]);assert.equal(municipalCatalog().municipalitiesWithPartialReference,15);assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);
});

test('Juárez notice evidence survives an unavailable historical primary document',async()=>{
 const {officialSources}=await import('../lib/source-monitor.js');const source=officialSources.find(row=>row.id==='juarez-carga');const notice=source.relatedUrls.find(url=>url.includes('/noticia/34586/'));
 const report=await checkSource(source,{},async url=>String(url)===source.url?new Response('unavailable',{status:503}):new Response('official linked document'));
 assert.equal(report.availability,'partial');assert.equal(report.documents.find(row=>row.url===notice).status,'unreviewed');assert.ok(report.documents.find(row=>row.url===notice).sha256);assert.equal(report.documents[0].error,'HTTP_503');
});

test('Juárez follow-up notices remain separate monitored evidence without inferring a reopening date or truck detour',async()=>{
 const {officialSources}=await import('../lib/source-monitor.js');const {municipalReference,municipalCatalog}=await import('../lib/municipal-regulations.js');
 const source=officialSources.find(row=>row.id==='juarez-carga');const urls=source.relatedUrls.filter(url=>/\/noticia\/(34518|34811)\//.test(url));assert.equal(urls.length,2);
 const first=await checkSource(source,{},async url=>new Response(String(url)===urls[0]?'first notice':'other document'));
 const changed=await checkSource(source,first,async url=>String(url)===source.url?new Response('',{status:403}):new Response(String(url)===urls[0]?'updated notice':'other document'));
 const publicRow=sourceStatus({checkedAt:changed.checkedAt,sources:[changed]}).sources.find(row=>row.id===source.id);
 assert.equal(publicRow.documents.find(row=>row.url===urls[0]).changeDetected,true);assert.equal(publicRow.documents.find(row=>row.url===urls[1]).changeDetected,false);
 const reference=municipalReference('08037');assert.ok(reference.notices.some(text=>text.includes('siete meses')&&text.includes('enero')&&text.includes('No se deduce')));
 assert.ok(urls.every(url=>reference.relatedLinks.some(link=>link.url===url)));assert.equal(reference.routingEnforced,false);assert.deepEqual(reference.timeRules,[]);assert.equal(reference.rules.length,4);
 assert.equal(municipalCatalog().municipalitiesWithPartialReference,15);assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);
});

test('Puebla watches both published PDF attachments separately without replacing corridor evidence or approving legal coverage',async()=>{
 const {officialSources}=await import('../lib/source-monitor.js');const {default:evidence}=await import('../data/mx/21114-parking-attachments.json',{with:{type:'json'}});const {municipalReference,municipalCatalog}=await import('../lib/municipal-regulations.js');
 const source=officialSources.find(row=>row.id==='puebla-carga');assert.equal(evidence.municipalityId,'21114');assert.equal(evidence.documents.length,2);assert.equal(evidence.legalReview,'not_verified');assert.equal(evidence.routingEnforced,false);
 for(const doc of evidence.documents){assert.ok(source.relatedUrls.includes(doc.url));assert.match(doc.sha256,/^[a-f0-9]{64}$/);assert.equal(doc.status,200);assert.ok(doc.bytes>300000);assert.equal(doc.legalValidityVerified,false);}
 const [annex,rules]=evidence.documents;assert.equal(annex.pages,7);assert.equal(rules.pages,18);
 const first=await checkSource(source,{},async()=>new Response('same document'));assert.equal(first.documents.find(doc=>doc.url===annex.url).status,'unreviewed');
 const next=await checkSource(source,first,async url=>new Response(String(url)===rules.url?'changed PDF':'same document'));
 const exposed=sourceStatus({checkedAt:next.checkedAt,sources:[next]});const documents=exposed.sources.find(row=>row.id===source.id).documents;assert.equal(documents.find(doc=>doc.url===rules.url).changeDetected,true);assert.equal(documents.find(doc=>doc.url===annex.url).changeDetected,false);assert.equal(exposed.legalRulesAutomaticallyUpdated,false);
 const reference=municipalReference('21114');assert.equal(reference.routingEnforced,false);assert.equal(reference.parkingCorridorReference.rows.length,128);assert.equal(municipalCatalog().municipalitiesWithPartialReference,15);assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);
});

test('CDMX watches the located historical Gaceta without replacing guide rules or approving validity',async()=>{
 const {officialSources}=await import('../lib/source-monitor.js');const {municipalReference,municipalCatalog}=await import('../lib/municipal-regulations.js');
 const url='https://data.consejeria.cdmx.gob.mx/portal_old/uploads/gacetas/0830deebda0a6b9e7fb44d6d2cef2ab0.pdf',source=officialSources.find(x=>x.id==='cdmx-centro');assert.ok(source.relatedUrls.includes(url));assert.equal(source.reviewedSha256,null);assert.equal(source.legalReview,'validity_requires_review');
 const first=await checkSource(source,{},async()=>new Response('synthetic document, not actual gazette evidence'));const document=first.documents.find(x=>x.url===url);assert.equal(document.status,'unreviewed');
 const failed=await checkSource(source,first,async()=>new Response('',{status:503}));const exposed=sourceStatus({checkedAt:failed.checkedAt,sources:[failed]});const actual=exposed.sources.find(x=>x.id==='cdmx-centro').documents.find(x=>x.url===url);assert.equal(actual.status,'unavailable');assert.equal(actual.error,'HTTP_503');assert.equal(actual.sha256,document.sha256);assert.equal(exposed.legalRulesAutomaticallyUpdated,false);
 const ref=municipalReference('09015'),guide=ref.rules.filter(x=>!x.id.startsWith('cdmx-gaceta2021-'));assert.equal(ref.routingEnforced,false);assert.equal(guide.length,5);assert.ok(guide.every(x=>x.citation===`Guía 2024 · página ${x.id==='cdmx-maniobras'?3:2}`));assert.equal(ref.rules.find(x=>x.id==='cdmx-unitarios').window.start,'20:00');assert.ok(ref.relatedLinks.some(x=>x.url===url&&x.title.includes('histórico')));assert.ok(ref.notices.some(x=>x.includes('503')&&x.includes('sin sustituir horarios')));assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);assert.equal(municipalCatalog().municipalitiesWithPartialReference,15);
});

test('the CDMX historical URL receives independent technical evidence and an outage never becomes legal approval',async()=>{
 const {officialSources}=await import('../lib/source-monitor.js');const source=officialSources.find(x=>x.id==='cdmx-centro'),url=source.relatedUrls.find(u=>u.includes('0830deebda0a6b9e7fb44d6d2cef2ab0.pdf'));assert.ok(url);const seen=[];
 const first=await checkSource(source,{},async input=>{seen.push(String(input));return String(input)===source.url?new Response('',{status:503}):new Response('synthetic historical document');});assert.ok(seen.includes(url));const evidence=first.documents.find(x=>x.url===url);assert.equal(evidence.status,'unreviewed');
 const next=await checkSource(source,first,async input=>String(input)===url?new Response('',{status:503}):new Response('synthetic historical document'));
 const publicRow=sourceStatus({checkedAt:next.checkedAt,sources:[next]}).sources.find(x=>x.id===source.id);const failed=publicRow.documents.find(x=>x.url===url);assert.equal(failed.status,'unavailable');assert.equal(failed.sha256,evidence.sha256);assert.equal(failed.error,'HTTP_503');assert.equal(source.legalReview,'validity_requires_review');
 const {municipalReference,municipalCatalog}=await import('../lib/municipal-regulations.js');const ref=municipalReference('09015');assert.ok(ref.relatedLinks.some(x=>x.url===url));assert.equal(ref.rules.filter(x=>!x.id.startsWith('cdmx-gaceta2021-')).length,5);assert.ok(ref.rules.every(x=>x.routingEnforced===false));assert.deepEqual(ref.timeRules,[]);assert.equal(ref.routingEnforced,false);assert.equal(municipalCatalog().municipalitiesWithPartialReference,15);assert.equal(municipalCatalog().fullyVerifiedMunicipalities,0);
});

test('the official CDMX mirror is monitored independently while an original outage retains its evidence',async()=>{
 const {officialSources}=await import('../lib/source-monitor.js');const source=officialSources.find(x=>x.id==='cdmx-centro');
 const mirror='https://transparenciac5.cdmx.gob.mx/TC5/uploads/GOFCDMX_15-_12-21.pdf',original=source.relatedUrls.find(url=>url.includes('0830deebda0a6b9e7fb44d6d2cef2ab0'));
 assert.ok(source.relatedUrls.includes(mirror));const first=await checkSource(source,{},async()=>new Response('synthetic first evidence'));
 const seen=[];const next=await checkSource(source,first,async input=>{seen.push(String(input));return String(input)===original?new Response('',{status:503}):new Response(String(input)===mirror?'synthetic mirror revision':'synthetic first evidence');});
 const publicRow=sourceStatus({checkedAt:next.checkedAt,sources:[next]}).sources.find(x=>x.id===source.id);const originalDoc=publicRow.documents.find(d=>d.url===original),mirrorDoc=publicRow.documents.find(d=>d.url===mirror);
 assert.ok(seen.includes(mirror));assert.equal(originalDoc.status,'unavailable');assert.equal(originalDoc.sha256,first.documents.find(d=>d.url===original).sha256);assert.equal(mirrorDoc.status,'changed');assert.equal(mirrorDoc.changeDetected,true);assert.equal(source.reviewedSha256,null);assert.equal(source.legalReview,'validity_requires_review');assert.equal(sourceStatus({checkedAt:next.checkedAt,sources:[next]}).legalRulesAutomaticallyUpdated,false);
});

test('missed six-hour intervals are visible before the eighteen-hour stale threshold without inventing a cause',()=>{
 const now=Date.parse('2026-11-19T07:00:00Z'),id=sourceStatus().sources[0].id;
 for(const [hours,overdue,stale] of [[0,false,false],[5.999,false,false],[6,true,false],[10,true,false],[18,true,true]]){
  const checkedAt=new Date(now-hours*3600000).toISOString(),r=sourceStatus({checkedAt,sources:[{id,checkedAt,status:'unavailable',lastSuccessAt:'2020-01-01T00:00:00Z'}]},now);
  assert.equal(r.overdue,overdue);assert.equal(r.stale,stale);assert.equal(r.sources[0].overdue,overdue);assert.equal(r.sources[0].status,'unavailable');assert.equal(r.legalRulesAutomaticallyUpdated,false);
 }
 for(const checkedAt of [null,'invalid','2099-01-01T00:00:00Z']){const r=sourceStatus({checkedAt,sources:[]},now);assert.equal(r.overdue,true);assert.equal(r.stale,true);assert.equal(r.sources[0].overdue,true);}
});

test('a fresh aggregate cannot hide a missed selected-source attempt, while a recent failed attempt remains on time',()=>{
 const now=Date.parse('2026-11-19T07:00:00Z'),checkedAt=new Date(now).toISOString(),id=sourceStatus().sources[0].id;
 const old=sourceStatus({checkedAt,sources:[{id,checkedAt:'2026-11-18T21:00:00Z',status:'unchanged'}]},now);
 assert.equal(old.overdue,false);assert.equal(old.sources[0].overdue,true);assert.equal(old.sources[0].stale,false);
 const recent=sourceStatus({checkedAt,sources:[{id,checkedAt,status:'unavailable',error:'HTTP_503',lastSuccessAt:'2020-01-01T00:00:00Z'}]},now);
 assert.equal(recent.overdue,false);assert.equal(recent.sources[0].overdue,false);assert.equal(recent.sources[0].status,'unavailable');assert.equal(recent.sources[0].error,'HTTP_503');
});
