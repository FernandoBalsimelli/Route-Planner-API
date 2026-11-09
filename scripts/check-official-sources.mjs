// Checks documents only. Never changes a regulation or approves its validity.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import registry from '../data/mx/national-references.json' with {type:'json'};
const MAX_BYTES=20*1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function download(url,hosts,fetcher=fetch){
 let target=new URL(url);
 const signal=AbortSignal.timeout(20000);
 for(let hop=0;hop<4;hop++){
  if(target.protocol!=='https:'||target.username||target.password||!hosts.has(target.hostname)||target.port)throw Error('UNAPPROVED_REDIRECT');
  const response=await fetcher(target,{redirect:'manual',signal,headers:{'User-Agent':'Route-Planner-Source-Monitor/1.0 (+https://github.com/FernandoBalsimelli/Route-Planner-API)','Accept':'application/pdf,text/html,application/javascript;q=0.8,*/*;q=0.5'}});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw Error('INVALID_REDIRECT');target=new URL(location,target);continue;}
  if(!response.ok)throw Error(`HTTP_${response.status}`);
  if(Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('DOCUMENT_TOO_LARGE');
  const chunks=[];let length=0;
  for await(const chunk of response.body){length+=chunk.length;if(length>MAX_BYTES){throw Error('DOCUMENT_TOO_LARGE');}chunks.push(chunk);}
  if(!length)throw Error('EMPTY_DOCUMENT');
  return {bytes:Buffer.concat(chunks),url:target.href};
 }
 throw Error('TOO_MANY_REDIRECTS');
}
export async function checkSource(source,previous={},fetcher=fetch,now=new Date().toISOString()){
 const urls=[source.url,...(source.relatedUrls||[])];
 const hosts=new Set(urls.flatMap(url=>{const host=new URL(url).hostname;return [host,host.startsWith('www.')?host.slice(4):'www.'+host];}));
 try{
  const document=await download(source.url,hosts,fetcher),sha256=digest(document.bytes),relatedHashes={};
  if(source.watchMainScript){
   const matches=[...document.bytes.toString('utf8').matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)];
   const asset=matches.map(match=>new URL(match[1],document.url)).find(url=>/\/(?:main|app)[.\-][^/]+\.js$/.test(url.pathname));
   if(!asset)throw Error('MAIN_SCRIPT_NOT_FOUND');
   urls.push(asset.href);
  }
  for(const url of urls.slice(1,4)){const asset=await download(url,hosts,fetcher);relatedHashes[url]=digest(asset.bytes);}
  const initialSha256=previous.initialSha256||sha256,initialRelatedHashes=previous.initialRelatedHashes||relatedHashes;
  const changed=sha256!==(source.reviewedSha256||initialSha256)||JSON.stringify(relatedHashes)!==JSON.stringify(initialRelatedHashes);
  return {id:source.id,checkedAt:now,lastSuccessAt:now,status:changed?'changed':source.reviewedSha256?'unchanged':'unreviewed',sha256,initialSha256,relatedHashes,initialRelatedHashes,error:null};
 }catch(error){
  const message=error instanceof Error?error.message:'';
  const safeError=/^(HTTP_\d{3}|UNAPPROVED_REDIRECT|INVALID_REDIRECT|DOCUMENT_TOO_LARGE|EMPTY_DOCUMENT|TOO_MANY_REDIRECTS|MAIN_SCRIPT_NOT_FOUND)$/.test(message)?message:'NETWORK_OR_TIMEOUT';
  return {...previous,id:source.id,checkedAt:now,lastSuccessAt:previous.lastSuccessAt||null,status:'unavailable',error:safeError};
 }
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
