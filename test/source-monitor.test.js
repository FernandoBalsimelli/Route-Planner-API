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
