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

export function nearbyResults(results, focus, size = 8) {
  const unique = [];
  for (const result of results) {
    if (!unique.some(point => point.label === result.label && distanceMeters(point, result) < 30)) unique.push(result);
  }
  return (focus ? unique.map(point => ({ ...point, distanceMeters: distanceMeters(point, focus) })).sort((a, b) => a.distanceMeters - b.distanceMeters) : unique).slice(0, size);
}
