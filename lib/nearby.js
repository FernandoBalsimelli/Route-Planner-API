// A focus biases name searches; explicit locality/address qualifiers take priority.
export function searchFocus(query, lat, lng) {
  if (lat === undefined && lng === undefined) return null;
  if (typeof lat !== 'string' || typeof lng !== 'string' || !lat.trim() || !lng.trim()) throw new Error('INVALID_SEARCH_FOCUS');
  const point = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) throw new Error('INVALID_SEARCH_FOCUS');
  return /[,;]|\b(?:en|ciudad de|estado de|c[oó]digo postal|cp)\b|\d{5}/i.test(query) ? null : point;
}

export function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return Math.round(12742000 * Math.asin(Math.sqrt(Math.min(1, h))));
}
const normalized = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function namesLocality(query, result) {
  if (/\bestado de\b/i.test(query)) return false;
  const locality = normalized(result.locality).replace(/^ciudad (?:de )?/, '');
  return locality.length >= 4 && (' ' + normalized(query) + ' ').includes(' ' + locality + ' ');
}
export function retailSearchIntent(query) {
  const text=normalized(query);
  if(!/\bbodegas? aurrera\b|\baurrera express\b/.test(text)||/\d/.test(text))return null;
  return /\bexpress\b/.test(text)?'express':/\bmi bodega\b/.test(text)?'mi_bodega':'aurrera';
}
export function providerSearchText(query){
  return retailSearchIntent(query)?query.replace(/\bbodegas(?=\s+aurrer[aá])/i,'Bodega'):query;
}
function matchesRetailIntent(intent,point){
  if(!intent)return true;
  const name=normalized(point.name||point.label?.split(',')[0]);
  if(!/\baurrera\b/.test(name)||point.kind==='locality')return false;
  return intent==='express'?/\bexpress\b/.test(name):intent==='mi_bodega'?/\bmi bodega\b/.test(name):true;
}
export function searchBounds(focus,radiusKm=50){
  const latDelta=radiusKm/111.195,latMin=Math.max(-90,focus.lat-latDelta),latMax=Math.min(90,focus.lat+latDelta);
  const lonDelta=radiusKm/(111.195*Math.max(.001,Math.cos(focus.lat*Math.PI/180)));
  // Photon bbox cannot cross the antimeridian. A global longitude interval
  // keeps candidates valid at the poles/date line; ranking still uses meters.
  return [focus.lng-lonDelta < -180 || focus.lng+lonDelta > 180 ? -180 : focus.lng-lonDelta,latMin,focus.lng+lonDelta > 180 || focus.lng-lonDelta < -180 ? 180 : focus.lng+lonDelta,latMax].map(value=>Number(value.toFixed(6))).join(',');
}
export function prioritizeLocations(query, results, focus, size = 8) {
  const intent=retailSearchIntent(query);
  results=results.filter(point=>matchesRetailIntent(intent,point));
  const explicitCity = results.filter(result => namesLocality(query, result));
  return nearbyResults(explicitCity.length ? explicitCity : results, explicitCity.length ? null : focus, size);
}

export function nearbyResults(results, focus, size = 8) {
  const unique = [];
  for (const result of results) {
    const duplicate=unique.findIndex(point=>{
      if(point.street&&result.street&&normalized(point.street)!==normalized(result.street))return false;
      if(point.houseNumber&&result.houseNumber&&normalized(point.houseNumber)!==normalized(result.houseNumber))return false;
      return (point.label===result.label||(point.name&&result.name&&normalized(point.name)===normalized(result.name)))&&distanceMeters(point,result)<35;
    });
    if(duplicate<0)unique.push(result);
    else {
      const quality=point=>(point.street?2:0)+(point.houseNumber?2:0)+(point.kind==='venue'?1:0);
      if(quality(result)>quality(unique[duplicate]))unique[duplicate]=result;
    }
  }
  if(!focus)return unique.slice(0,size);
  const ranked=unique.map(point=>({...point,distanceMeters:distanceMeters(point,focus)})).sort((a,b)=>a.distanceMeters-b.distanceMeters);
  const local=ranked.filter(point=>point.distanceMeters<=50000);
  return (local.length?local:ranked).slice(0,size);
}
