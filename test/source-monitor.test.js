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
