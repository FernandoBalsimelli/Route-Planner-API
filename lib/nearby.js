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
export function prioritizeLocations(query, results, focus, size = 8) {
  const explicitCity = results.filter(result => namesLocality(query, result));
  return nearbyResults(explicitCity.length ? explicitCity : results, explicitCity.length ? null : focus, size);
}

export function nearbyResults(results, focus, size = 8) {
  const unique = [];
  for (const result of results) {
    if (!unique.some(point => (point.label === result.label || (point.name && result.name && normalized(point.name) === normalized(result.name))) && distanceMeters(point, result) < 35)) unique.push(result);
  }
  return (focus ? unique.map(point => ({ ...point, distanceMeters: distanceMeters(point, focus) })).sort((a, b) => a.distanceMeters - b.distanceMeters) : unique).slice(0, size);
}
