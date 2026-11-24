import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSourceStatusReader} from '../lib/source-monitor.js';
const stamp=Date.parse('2026-11-24T07:00:00Z');
const report=(delta=0)=>({schemaVersion:1,checkedAt:new Date(stamp+delta).toISOString(),sources:[]});
test('failed refresh is observable, sanitized and retried after one minute without changing evidence dates',async()=>{
 let now=stamp,calls=0;const warnings=[];
 const read=createSourceStatusReader({clock:()=>now,bundled:report(-7*3600000),onFailure:event=>warnings.push(event),fetcher:async()=>{calls++;if(calls===1)throw Error('private-token-and-network-detail');return Response.json(report());}});
 const [a,b]=await Promise.all([read(),read()]);assert.deepEqual(a,b);assert.equal(calls,1);assert.equal(a.checkedAt,report(-7*3600000).checkedAt);assert.equal(a.overdue,true);assert.equal(a.reportRefresh.error,'REPORT_NETWORK_OR_TIMEOUT');assert.equal(a.reportRefresh.lastSuccessAt,null);assert.equal(warnings.length,1);assert.ok(!JSON.stringify([a,warnings]).includes('private-token'));
 now+=59999;await read();assert.equal(calls,1);now++;const recovered=await read();assert.equal(calls,2);assert.equal(recovered.checkedAt,report().checkedAt);assert.equal(recovered.overdue,false);assert.equal(recovered.reportRefresh.status,'available');assert.equal(recovered.reportRefresh.receivedCheckedAt,report().checkedAt);assert.equal(recovered.legalRulesAutomaticallyUpdated,false);
 now+=899999;await read();assert.equal(calls,2);now++;await read();assert.equal(calls,3,'successful reads retain the existing fifteen-minute cache');
});
test('failed refresh preserves the last successful report and retrieval time without rewriting document check time',async()=>{
 let now=stamp,calls=0;const read=createSourceStatusReader({clock:()=>now,bundled:report(-3600000),fetcher:async()=>++calls===1?Response.json(report()):new Response('',{status:503})});
 const first=await read();now+=900000;const failed=await read();assert.equal(failed.checkedAt,first.checkedAt);assert.equal(failed.reportRefresh.lastSuccessAt,first.reportRefresh.lastSuccessAt);assert.equal(failed.reportRefresh.error,'REPORT_HTTP_503');assert.equal(failed.reportRefresh.attemptedAt,new Date(now).toISOString());assert.equal(failed.reportRefresh.nextRefreshAt,new Date(now+60000).toISOString());
});
test('invalid remote reports retain the checkpoint and expose only bounded technical codes',async()=>{
 const cases=[[()=>new Response('not JSON'),'REPORT_INVALID_JSON'],[()=>Response.json({schemaVersion:1,sources:[]}), 'REPORT_INVALID_SCHEMA'],[()=>Response.json(report(300001)),'REPORT_FUTURE_DATE'],[()=>new Response('x'.repeat(128001)),'REPORT_TOO_LARGE'],[()=>new Response('',{status:429}),'REPORT_HTTP_429']];
 for(const [response,code] of cases){const read=createSourceStatusReader({clock:()=>stamp,bundled:report(-3600000),fetcher:async()=>response()});const result=await read();assert.equal(result.reportRefresh.error,code);assert.equal(result.checkedAt,report(-3600000).checkedAt);assert.equal(result.reportRefresh.status,'unavailable');}
});
test('a valid older remote report is identified separately and cannot replace a newer bundled checkpoint',async()=>{
 const read=createSourceStatusReader({clock:()=>stamp,bundled:report(),fetcher:async()=>Response.json(report(-3600000))});const result=await read();assert.equal(result.checkedAt,report().checkedAt);assert.equal(result.reportRefresh.receivedCheckedAt,report(-3600000).checkedAt);assert.equal(result.reportRefresh.status,'available');assert.equal(result.legalRulesAutomaticallyUpdated,false);
});
