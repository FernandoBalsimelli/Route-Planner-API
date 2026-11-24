import {evidenceStale,publicDocuments,safeError} from './source-evidence.js';
import sources from '../data/mx/national-references.json' with {type:'json'};
import snapshot from '../data/mx/source-status.json' with {type:'json'};
export const officialSources=sources.sources;
export const STATUS_URL='https://raw.githubusercontent.com/FernandoBalsimelli/Route-Planner-API/main/data/mx/source-status.json';
export function sourceStatus(report=snapshot,now=Date.now()){
 const checked=Date.parse(report.checkedAt),fresh=Number.isFinite(checked)&&checked<=now+300000&&now-checked<18*3600000;
 const overdue=value=>{const timestamp=Date.parse(value);return !Number.isFinite(timestamp)||timestamp>now+300000||now-timestamp>=6*3600000;};
 return {schemaVersion:1,checkedAt:Number.isFinite(checked)?report.checkedAt:null,stale:!fresh,overdue:overdue(report.checkedAt),intervalHours:6,legalRulesAutomaticallyUpdated:false,notice:'Se vigila disponibilidad y cambios de documentos; no certifica vigencia ni sustituye revisión legal. Los cambios detectados no se aplican automáticamente a rutas.',sources:officialSources.map(source=>{
  const entry=Array.isArray(report.sources)?report.sources.find(item=>item.id===source.id):null;
  const documents=publicDocuments(source,entry,now);
  return {...source,documents,documentBreakdownAvailable:documents.some(item=>item.kind==='primary'),stale:evidenceStale(entry?.checkedAt,now),overdue:overdue(entry?.checkedAt),availability:['available','partial','unavailable'].includes(entry?.availability)?entry.availability:null,changeDetected:entry?.changeDetected===true||entry?.status==='changed'||documents.some(item=>item.changeDetected),changeKinds:Array.isArray(entry?.changeKinds)?entry.changeKinds.filter(kind=>['primary','related','script'].includes(kind)):[],relatedSetChanged:entry?.relatedSetChanged===true,primaryLastSuccessAt:entry?.primaryLastSuccessAt||null,status:['unchanged','changed','unreviewed','unavailable'].includes(entry?.status)?entry.status:'not_checked',checkedAt:entry?.checkedAt||null,lastSuccessAt:entry?.lastSuccessAt||null,sha256:entry?.sha256||null,error:entry?.error?safeError(new Error(entry.error)):null};
 })};
}
export function createSourceStatusReader({fetcher=(...args)=>fetch(...args),clock=()=>Date.now(),bundled=snapshot,onFailure=()=>{}}={}){
 let cached=null,expires=0,pending,refresh=null;
 const failure=code=>Object.assign(new Error(code),{reportCode:code});
 return async function read(){
 if(cached&&clock()<expires)return {...sourceStatus(cached,clock()),reportRefresh:refresh};
 if(!pending)pending=(async()=>{
  const attemptedAt=new Date(clock()).toISOString();
  try{
   const response=await fetcher(STATUS_URL,{signal:AbortSignal.timeout(2500),redirect:'error',headers:{Accept:'application/json'}});
   if(!response.ok)throw failure('REPORT_HTTP_'+response.status);
   const bytes=await response.bytes();if(bytes.length>128000)throw failure('REPORT_TOO_LARGE');
   let report;try{report=JSON.parse(new TextDecoder().decode(bytes));}catch{throw failure('REPORT_INVALID_JSON');}
   if(!report||typeof report!=='object'||report.schemaVersion!==1||!Array.isArray(report.sources)||!Number.isFinite(Date.parse(report.checkedAt)))throw failure('REPORT_INVALID_SCHEMA');
   if(Date.parse(report.checkedAt)>clock()+300000)throw failure('REPORT_FUTURE_DATE');
   // A delayed CDN response must not replace the newer bundled evidence.
   const candidates=[cached,bundled,report].filter(value=>value&&Number.isFinite(Date.parse(value.checkedAt))&&Date.parse(value.checkedAt)<=clock()+300000);
   cached=candidates.sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt))[0]||bundled;
   expires=clock()+15*60000;
   refresh={status:'available',attemptedAt,lastSuccessAt:new Date(clock()).toISOString(),receivedCheckedAt:report.checkedAt,error:null,nextRefreshAt:new Date(expires).toISOString()};
  }catch(error){
   cached=cached||bundled;expires=clock()+60000;
   const code=/^REPORT_(?:HTTP_[1-5]\d\d|TOO_LARGE|INVALID_JSON|INVALID_SCHEMA|FUTURE_DATE)$/.test(error?.reportCode)?error.reportCode:'REPORT_NETWORK_OR_TIMEOUT';
   refresh={status:'unavailable',attemptedAt,lastSuccessAt:refresh?.lastSuccessAt||null,receivedCheckedAt:refresh?.receivedCheckedAt||null,error:code,nextRefreshAt:new Date(expires).toISOString()};
   onFailure({event:'official_source_report_refresh_failed',code,attemptedAt});
  }
 })().finally(()=>{pending=null;});
 await pending;return {...sourceStatus(cached,clock()),reportRefresh:refresh};
 };
}
export const getSourceStatus=createSourceStatusReader({onFailure:event=>console.warn(JSON.stringify(event))});
