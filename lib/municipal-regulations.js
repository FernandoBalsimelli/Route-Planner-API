import catalog from '../data/mx/municipalities.json' with { type: 'json' };
import monterrey from '../data/mx/19039.json' with { type: 'json' };
import {boundaryProvenance,identifyMunicipalities} from './municipal-boundaries.js';
export const referencePackages = new Map([['19039',monterrey]]);
const normalize = value => String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
export function municipalCatalog({state='',q='',offset=0,limit=100}={}){
 if(state&&!catalog.states.some(item=>item.id===state))throw new Error('INVALID_STATE');
 if(q.length>100||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>600)throw new Error('INVALID_QUERY');
 const search=normalize(q);
 const rows=catalog.municipalities.filter(item=>(!state||item.state===state)&&(!search||normalize(item.name).includes(search)||item.id===search));
 return {country:'MX',states:catalog.states,totalMunicipalities:catalog.municipalities.length,total:rows.length,offset,limit,retrievedAt:catalog.retrievedAt,source:catalog.source,geographicCatalogOnly:true,municipalities:rows.slice(offset,offset+limit).map(item=>({...item,coverage:referencePackages.has(item.id)?'reference_only':'not_loaded',routingEnforced:false})),fullyVerifiedMunicipalities:0};
}
export function municipalReference(id){
 const municipality=catalog.municipalities.find(item=>item.id===id);
 if(!municipality)return null;
 return referencePackages.get(id)||{municipalityId:id,name:municipality.name,country:'MX',status:'not_loaded',routingEnforced:false,trunkSegments:[],timeRules:[],source:null,notices:['Todavía no se han incorporado reglas oficiales verificadas para este municipio. Esto no significa que esté permitido circular por todas sus vías.']};
}
export function routeRegulatoryCoverage(polyline){
 const identified=identifyMunicipalities(polyline),municipalities=identified.municipalities.map((item,index)=>({...item,sequence:index+1,coverage:referencePackages.has(item.id)?'reference_only':'not_loaded',routingEnforced:false}));
 const references=municipalities.filter(item=>item.coverage==='reference_only').length;
 const message=municipalities.length
  ? `El trazado toca aproximadamente ${municipalities.length} municipio${municipalities.length===1?'':'s'} según límites INEGI simplificados. ${references?`${references} tiene referencia oficial consultable, todavía sin aplicación automática.`:'Ninguno tiene reglas oficiales cargadas.'} Revisa permisos, horarios, señalización y acceso de descarga.`
  : 'No se pudieron identificar municipios mexicanos para este trazado. Esto no significa que no existan restricciones; revisa jurisdicción, permisos, horarios y señalización.';
 return {countryScope:'MX',status:'not_verified',municipalGeometryEnforced:false,municipalityIdentification:identified.status,identificationReason:identified.reason,boundaryApproximation:true,boundaryToleranceDegrees:boundaryProvenance().toleranceDegrees,municipalitiesIdentified:municipalities,municipalitiesWithReference:references,municipalitiesWithoutRules:municipalities.length-references,requiresOperatorReview:true,message,source:boundaryProvenance()};
}
