// Checks documents only. Never changes a regulation or approves its validity.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {evidenceBefore,successfulEvidence,failedEvidence} from '../lib/source-evidence.js';
import registry from '../data/mx/national-references.json' with {type:'json'};
const MAX_BYTES=20*1024*1024;
const MAX_CONFIGURED_BYTES=32*1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function download(url,hosts,fetcher=fetch,maxBytes=MAX_BYTES){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_CONFIGURED_BYTES)throw Error('INVALID_DOCUMENT_LIMIT');
 let target=new URL(url);
 const signal=AbortSignal.timeout(20000);
 for(let hop=0;hop<4;hop++){
  if(target.protocol!=='https:'||target.username||target.password||!hosts.has(target.hostname)||target.port)throw Error('UNAPPROVED_REDIRECT');
  const response=await fetcher(target,{redirect:'manual',signal,headers:{'User-Agent':'Route-Planner-Source-Monitor/1.0 (+https://github.com/FernandoBalsimelli/Route-Planner-API)','Accept':'application/pdf,text/html,application/javascript;q=0.8,*/*;q=0.5'}});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw Error('INVALID_REDIRECT');target=new URL(location,target);continue;}
  if(!response.ok)throw Error(`HTTP_${response.status}`);
  if(Number(response.headers.get('content-length'))>maxBytes)throw Error('DOCUMENT_TOO_LARGE');
  const chunks=[];let length=0;
  for await(const chunk of response.body){length+=chunk.length;if(length>maxBytes){throw Error('DOCUMENT_TOO_LARGE');}chunks.push(chunk);}
  if(!length)throw Error('EMPTY_DOCUMENT');
  return {bytes:Buffer.concat(chunks),url:target.href};
 }
 throw Error('TOO_MANY_REDIRECTS');
}
export async function checkSource(source,previous={},fetcher=fetch,now=new Date().toISOString()){
 const relatedUrls=source.relatedUrls||[];
 const hosts=new Set([source.url,...relatedUrls].flatMap(url=>{const host=new URL(url).hostname;return [host,host.startsWith('www.')?host.slice(4):'www.'+host];}));
 const documents=[];
 let primary,scriptKnown=!source.watchMainScript;
 async function check(url,kind){
  const before=evidenceBefore(source,previous,url,kind);
  try{
   const result=await download(url,hosts,fetcher,source.documentByteLimit);
   const document=successfulEvidence(url,kind,digest(result.bytes),before,kind==='primary'?source.reviewedSha256:null,now);
   documents.push(document);return result;
  }catch(error){documents.push(failedEvidence(url,kind,before,error,now));return null;}
 }
 primary=await check(source.url,'primary');
 for(const url of relatedUrls)await check(url,'related');
 if(source.watchMainScript){
  const matches=primary?[...primary.bytes.toString('utf8').matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]:[];
  const asset=matches.map(match=>new URL(match[1],primary.url)).find(url=>/\/(?:main|app)[.\-][^/]+\.js$/.test(url.pathname));
  if(asset){scriptKnown=true;await check(asset.href,'script');}
  else documents.push(failedEvidence(null,'script',{},new Error(primary?'MAIN_SCRIPT_NOT_FOUND':'SCRIPT_DISCOVERY_UNAVAILABLE'),now));
 }
 const main=documents[0],failed=documents.filter(item=>item.status==='unavailable');
 const changeKinds=[...new Set(documents.filter(item=>item.changeDetected).map(item=>item.kind))];
 // A changed set of links/bundles is distinct from changed contents at the same URL.
 const previousRelated=Object.keys(previous.initialRelatedHashes||{}).sort();
 const currentRelated=documents.filter(item=>item.kind!=='primary'&&item.url).map(item=>item.url).sort();
 const relatedSetChanged=scriptKnown && previousRelated.length>0 && JSON.stringify(previousRelated)!==JSON.stringify(currentRelated);
 const changeDetected=changeKinds.length>0||relatedSetChanged;
 const allSucceeded=failed.length===0;
 const relatedHashes=Object.fromEntries(documents.filter(item=>item.kind!=='primary'&&item.url&&item.sha256).map(item=>[item.url,item.sha256]));
 const initialRelatedHashes={...(previous.initialRelatedHashes||{}),...Object.fromEntries(documents.filter(item=>item.kind!=='primary'&&item.url&&item.initialSha256).map(item=>[item.url,item.initialSha256]))};
 return {id:source.id,checkedAt:now,lastSuccessAt:allSucceeded?now:previous.lastSuccessAt||null,primaryLastSuccessAt:main.lastSuccessAt,
  status:!allSucceeded?'unavailable':changeDetected?'changed':documents.every(item=>item.status==='unchanged')?'unchanged':'unreviewed',
  availability:allSucceeded?'available':documents.some(item=>item.status!=='unavailable')?'partial':'unavailable',
  changeDetected,changeKinds,relatedSetChanged,sha256:main.sha256||null,initialSha256:main.initialSha256||null,relatedHashes,initialRelatedHashes,documents,error:failed[0]?.error||null};
}
export async function checkAll(sources,previous,fetcher=fetch){
 const checkedAt=new Date().toISOString(),rows=[];
 // Two workers bound pressure on public government sites.
 const queue=[...sources];
 await Promise.all([0,1].map(async()=>{while(queue.length){const source=queue.shift();rows.push(await checkSource(source,previous.sources?.find(row=>row.id===source.id),fetcher,checkedAt));}}));
 return {schemaVersion:1,checkedAt,sources:rows.sort((a,b)=>a.id.localeCompare(b.id))};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const target=new URL('../data/mx/source-status.json',import.meta.url);
 const previous=JSON.parse(await readFile(target,'utf8'));
 const report=await checkAll(registry.sources,previous);
 await writeFile(target,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({checkedAt:report.checkedAt,sources:report.sources.map(({id,status,error})=>({id,status,error}))}));
}
