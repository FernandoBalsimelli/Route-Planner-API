// Technical evidence only. These states never certify legal validity.
export const evidenceStatus = new Set(['unchanged', 'changed', 'unreviewed', 'unavailable']);
export const safeError = error => /^(HTTP_\d{3}|UNAPPROVED_REDIRECT|INVALID_REDIRECT|DOCUMENT_TOO_LARGE|EMPTY_DOCUMENT|TOO_MANY_REDIRECTS|MAIN_SCRIPT_NOT_FOUND|SCRIPT_DISCOVERY_UNAVAILABLE)$/.test(error?.message || '') ? error.message : 'NETWORK_OR_TIMEOUT';
export function evidenceBefore(source, previous, url, kind) {
 const document = (Array.isArray(previous.documents) ? previous.documents : []).find(item => item.kind === kind && item.url === url);
 if (document) return document;
 const primary = kind === 'primary';
 const sha256 = primary ? previous.sha256 : previous.relatedHashes?.[url];
 const initialSha256 = primary ? previous.initialSha256 : previous.initialRelatedHashes?.[url];
 const baseline = primary ? source.reviewedSha256 || initialSha256 : initialSha256;
 return { url, kind, sha256: sha256 || null, initialSha256, changeDetected: Boolean(sha256 && baseline && sha256 !== baseline), lastSuccessAt: sha256 ? previous.lastSuccessAt : null };
}
export function successfulEvidence(url, kind, sha256, previous, reviewedSha256, now) {
 const initialSha256 = previous.initialSha256 || sha256;
 const changeDetected = sha256 !== (reviewedSha256 || initialSha256);
 return { url, kind, checkedAt: now, lastSuccessAt: now, status: changeDetected ? 'changed' : reviewedSha256 ? 'unchanged' : 'unreviewed', changeDetected, sha256, initialSha256, error: null };
}
export function failedEvidence(url, kind, previous, error, now) {
 return { ...previous, url, kind, checkedAt: now, lastSuccessAt: previous.lastSuccessAt || null, status: 'unavailable', changeDetected: Boolean(previous.changeDetected || previous.status === 'changed'), error: safeError(error) };
}
export function evidenceStale(value, now = Date.now()) {
 const time = Date.parse(value);
 return !Number.isFinite(time) || time > now + 300000 || now - time >= 18 * 3600000;
}
export function publicDocuments(source, entry, now) {
 const declared = [source.url, ...(source.relatedUrls || [])];
 return (Array.isArray(entry?.documents) ? entry.documents : []).slice(0, declared.length + (source.watchMainScript ? 1 : 0)).flatMap(document => {
  if (!document || !['primary','related','script'].includes(document.kind)) return [];
  let allowed = document.kind === 'primary' ? document.url === source.url : document.kind === 'related' ? declared.slice(1).includes(document.url) : false;
  if (document.kind === 'script' && source.watchMainScript) {
   try { const url = new URL(document.url), main = new URL(source.url); allowed = url.protocol === 'https:' && !url.username && !url.password && !url.port && url.hostname === main.hostname && /\/(?:main|app)[.\-][^/]+\.js$/.test(url.pathname); } catch {}
   if (document.url == null && ['MAIN_SCRIPT_NOT_FOUND','SCRIPT_DISCOVERY_UNAVAILABLE'].includes(document.error)) allowed = true;
  }
  if (!allowed || !evidenceStatus.has(document.status)) return [];
  return [{ url: document.url, kind: document.kind, status: document.status, changeDetected: document.changeDetected === true || document.status === 'changed', checkedAt: document.checkedAt || null, lastSuccessAt: document.lastSuccessAt || null, stale: evidenceStale(document.checkedAt, now), sha256: /^[a-f0-9]{64}$/.test(document.sha256) ? document.sha256 : null, error: document.error ? safeError(new Error(document.error)) : null }];
 });
}
