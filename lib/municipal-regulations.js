import catalog from '../data/mx/municipalities.json' with { type: 'json' };
import monterrey from '../data/mx/19039.json' with { type: 'json' };
import national from '../data/mx/national-references.json' with { type: 'json' };
import {boundaryProvenance,identifyMunicipalities} from './municipal-boundaries.js';
export const referencePackages = new Map([['19039',monterrey]]);
for(const entry of national.packages) for(const id of entry.municipalityIds){
 const municipality=catalog.municipalities.find(item=>item.id===id);
 if(!municipality)throw new Error('UNKNOWN_REFERENCE_MUNICIPALITY');
 const source=national.sources.find(item=>item.id===entry.sourceId);
 referencePackages.set(id,{...entry,municipalityId:id,name:municipality.name,country:'MX',status:'reference_only',routingEnforced:false,source:{...source,checkedAt:source.reviewedAt},trunkSegments:entry.trunkSegments||[],timeRules:[]});
}
const byName = (a,b) => a.name.localeCompare(b.name,'es',{sensitivity:'base'}) || a.id.localeCompare(b.id);
const normalize = value => String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
export function municipalCatalog({state='',q='',offset=0,limit=100}={}){
 if(state&&!catalog.states.some(item=>item.id===state))throw new Error('INVALID_STATE');
 if(q.length>100||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>600)throw new Error('INVALID_QUERY');
 const search=normalize(q);
 const rows=catalog.municipalities.filter(item=>(!state||item.state===state)&&(!search||normalize(item.name).includes(search)||item.id===search)).sort(byName);
 return {country:'MX',states:[...catalog.states].sort(byName),totalMunicipalities:catalog.municipalities.length,municipalitiesWithPartialReference:referencePackages.size,total:rows.length,offset,limit,retrievedAt:catalog.retrievedAt,source:catalog.source,geographicCatalogOnly:true,municipalities:rows.slice(offset,offset+limit).map(item=>({...item,coverage:referencePackages.has(item.id)?'reference_only':'not_loaded',routingEnforced:false})),fullyVerifiedMunicipalities:0};
}
export function municipalReference(id){
 const municipality=catalog.municipalities.find(item=>item.id===id);
 if(!municipality)return null;
 const reference=referencePackages.get(id);
 return reference?{...reference,source:{...reference.source,id:reference.source.id||'monterrey-transito'}}:{municipalityId:id,name:municipality.name,country:'MX',status:'not_loaded',routingEnforced:false,trunkSegments:[],timeRules:[],rules:[],source:null,notices:['Todavía no se han incorporado reglas oficiales verificadas para este municipio. Esto no significa que esté permitido circular por todas sus vías.']};
}
export function routeRegulatoryCoverage(polyline){
 const identified=identifyMunicipalities(polyline),municipalities=identified.municipalities.map((item,index)=>({...item,sequence:index+1,coverage:referencePackages.has(item.id)?'reference_only':'not_loaded',routingEnforced:false}));
 const references=municipalities.filter(item=>item.coverage==='reference_only').length;
 const message=municipalities.length
  ? `El trazado toca aproximadamente ${municipalities.length} municipio${municipalities.length===1?'':'s'} según límites INEGI simplificados. ${references?`${references} tiene referencia oficial consultable, todavía sin aplicación automática.`:'Ninguno tiene reglas oficiales cargadas.'} Revisa permisos, horarios, señalización y acceso de descarga.`
  : 'No se pudieron identificar municipios mexicanos para este trazado. Esto no significa que no existan restricciones; revisa jurisdicción, permisos, horarios y señalización.';
 return {countryScope:'MX',status:'not_verified',municipalGeometryEnforced:false,municipalityIdentification:identified.status,identificationReason:identified.reason,boundaryApproximation:true,boundaryToleranceDegrees:boundaryProvenance().toleranceDegrees,municipalitiesIdentified:municipalities,municipalitiesWithReference:references,municipalitiesWithoutRules:municipalities.length-references,requiresOperatorReview:true,message,source:boundaryProvenance()};
}
