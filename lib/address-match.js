// A provider's street/area result must not masquerade as a located house number.
export function requestedHouseNumber(query) {
  const first = String(query).split(',')[0].trim();
  if (!/\p{L}/u.test(first) || /\b(?:cp|c\.?p\.?|c[oó]digo postal)\s*\d{5}$/i.test(first)) return null;
  const match = first.match(/(?:\s|#)(\d{1,5}(?:[-/]\d{1,5})?(?:\s?[a-z])?)$/i);
  // A named street such as "Calle 20" is not necessarily an exterior number.
  if (match && !/^(?:calle|avenida|av\.?|ruta|carretera|carr\.?)\s*$/i.test(first.slice(0, match.index).trim())) return match[1].replace(/\s+/g, '').toUpperCase();
  return null;
}
export function rankAddressMatches(query, results) {
  const requested = requestedHouseNumber(query);
  if (!requested) return results;
  const rank = { matched: 0, missing: 1, different: 2 };
  return results.map(point => {
    const actual = String(point.houseNumber ?? '').replace(/\s+/g, '').toUpperCase();
    return { ...point, requestedHouseNumber: requested, numberMatch: actual === requested ? 'matched' : actual ? 'different' : 'missing' };
  }).sort((a, b) => rank[a.numberMatch] - rank[b.numberMatch]);
}
