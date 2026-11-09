import sources from '../data/mx/national-references.json' with {type:'json'};
import snapshot from '../data/mx/source-status.json' with {type:'json'};
export const officialSources=sources.sources;
export const STATUS_URL='https://raw.githubusercontent.com/FernandoBalsimelli/Route-Planner-API/main/data/mx/source-status.json';
let cached=null,expires=0,pending;
export function sourceStatus(report=snapshot,now=Date.now()){
 const checked=Date.parse(report.checkedAt),fresh=Number.isFinite(checked)&&checked<=now+300000&&now-checked<18*3600000;
 return {schemaVersion:1,checkedAt:Number.isFinite(checked)?report.checkedAt:null,stale:!fresh,intervalHours:6,legalRulesAutomaticallyUpdated:false,notice:'Se vigila disponibilidad y cambios de documentos; no certifica vigencia ni sustituye revisión legal. Los cambios detectados no se aplican automáticamente a rutas.',sources:officialSources.map(source=>{
  const entry=Array.isArray(report.sources)?report.sources.find(item=>item.id===source.id):null;
  return {...source,status:['unchanged','changed','unreviewed','unavailable'].includes(entry?.status)?entry.status:'not_checked',checkedAt:entry?.checkedAt||null,lastSuccessAt:entry?.lastSuccessAt||null,sha256:entry?.sha256||null,error:entry?.error||null};
 })};
}
export async function getSourceStatus(){
 if(cached&&Date.now()<expires)return sourceStatus(cached);
 if(!pending)pending=(async()=>{
  try{
   const response=await fetch(STATUS_URL,{signal:AbortSignal.timeout(2500),redirect:'error',headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('REPORT_UNAVAILABLE');
   const bytes=await response.bytes();if(bytes.length>128000)throw Error('REPORT_TOO_LARGE');
   const report=JSON.parse(new TextDecoder().decode(bytes));
   if(report.schemaVersion!==1||!Array.isArray(report.sources)||!Number.isFinite(Date.parse(report.checkedAt)))throw Error('INVALID_REPORT');
   cached=report;
  }catch{cached=cached||snapshot;}
  expires=Date.now()+15*60000;
 })().finally(()=>{pending=null;});
 await pending;return sourceStatus(cached);
}
