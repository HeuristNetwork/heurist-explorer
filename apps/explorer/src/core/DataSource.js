/**
 * Canonical Explorer DataSource helpers.
 *
 * A DataSource is a resolved, runtime transfer object. It is never persisted
 * independently: reference identifies its producer, request is executable by
 * presentation modules, and presentation carries optional module profiles.
 */

const REFERENCE_ALIASES = Object.freeze({
  query: 'query', filter: 'filter', recordtype: 'recordtype', rectype: 'recordtype',
  source: 'source', querysource: 'source', 'query-source': 'source',
  dataset: 'source', mapsource: 'source', 'map-source': 'source'
});
const PRESENTATION_TYPES = ['data', 'map', 'graph', 'timeline', 'filterForm'];
const REQUEST_DEFAULTS = Object.freeze({ w: 'all', rulesonly: 0 });

/** Convert legacy and canonical inputs to the one runtime DataSource shape. */
export function normalizeDataSource(source) {
  if (source == null) return null;
  if (typeof source !== 'object' || Array.isArray(source)) throw new TypeError('DataSource must be an object');

  const referenceInput = objectValue(source.reference);
  const legacyType = referenceInput.type ?? referenceInput.kind ?? source.type ?? source.kind;
  const referenceType = normalizeReferenceType(legacyType);
  if (!referenceType) throw new TypeError(`Unsupported DataSource reference type: ${legacyType ?? ''}`);

  const id = persistentReferenceId(referenceType, referenceInput, source);
  if (referenceType !== 'query' && !id) throw new TypeError(`${referenceType} DataSource requires a positive reference id`);

  const request = normalizeRequest(source.request ?? legacyRequest(source));
  if (isEmptyRequest(request)) throw new TypeError('DataSource requires an executable request');

  const result = {
    reference: {
      type: referenceType,
      id: referenceType === 'query' ? null : id,
      key: referenceKey(referenceType, id, request)
    },
    title: normalizedText(source.title ?? referenceInput.title),
    request,
    presentation: normalizePresentation(source.presentation)
  };
  const meta = normalizeMeta(source.meta, source);
  if (Object.keys(meta).length) result.meta = meta;
  return result;
}

export function dataSourceKey(source) {
  try { return normalizeDataSource(source)?.reference.key ?? null; } catch { return null; }
}

export function isSameDataSource(a, b) {
  const left = dataSourceKey(a);
  const right = dataSourceKey(b);
  return Boolean(left && right && left === right);
}

export function dataSourceTitle(source, fallback = '') {
  try { return normalizeDataSource(source)?.title || fallback; } catch { return fallback; }
}

export function cloneDataSource(source) {
  const normalized = normalizeDataSource(source);
  return normalized == null ? null : clone(normalized);
}

export function dataSourceRole(source) {
  let type;
  try { type = normalizeDataSource(source)?.reference.type; } catch { return 'other'; }
  if (type === 'query' || type === 'recordtype') return 'current';
  if (type === 'filter' || type === 'source') return 'saved';
  return 'other';
}

/** Return the complete executable records request. */
export function dataSourceRequest(source) {
  try { return cloneDataSource(source)?.request ?? null; } catch { return null; }
}

/** Return one resolved presentation profile without exposing shared state. */
export function dataSourcePresentation(source, moduleType) {
  if (!PRESENTATION_TYPES.includes(moduleType)) return null;
  try { return cloneDataSource(source)?.presentation?.[moduleType] ?? null; } catch { return null; }
}

function normalizeReferenceType(value) {
  const key = String(value ?? '').trim().toLowerCase().replaceAll('_', '-');
  return REFERENCE_ALIASES[key] ?? null;
}

function persistentReferenceId(type, reference, source) {
  if (type === 'query') return null;
  const candidates = type === 'filter'
    ? [reference.id, source.id, source.filterId]
    : type === 'recordtype'
      ? [reference.id, source.id, source.recordTypeId, source.rectypeId]
      : [reference.id, source.id, source.sourceId, source.querySourceId, source.datasetId, source.mapSourceId, source.mapsourceId];
  for (const value of candidates) {
    const id = positiveId(value);
    if (id) return id;
  }
  return null;
}

function legacyRequest(source) {
  if (source.query && typeof source.query === 'object' && !Array.isArray(source.query)) return source.query;
  if (source.query !== undefined) return { q: source.query };
  if (source.q !== undefined) {
    const request = { q: source.q };
    for (const key of ['w', 'rules', 'rulesonly', 'sort', 'filter', 'ids']) {
      if (source[key] !== undefined) request[key] = source[key];
    }
    return request;
  }
  return {};
}

function normalizeRequest(value) {
  if (value == null) return {};
  const request = typeof value === 'object' && !Array.isArray(value) ? clone(value) : { q: clone(value) };
  return removeUndefined(request);
}

function normalizePresentation(value) {
  const input = objectValue(value);
  const result = {};
  for (const type of PRESENTATION_TYPES) result[type] = input[type] == null ? null : clone(input[type]);
  for (const [key, profile] of Object.entries(input)) {
    if (!(key in result) && profile !== undefined) result[key] = clone(profile);
  }
  return result;
}

function normalizeMeta(value, legacy) {
  const meta = removeUndefined(clone(objectValue(value)));
  if (meta.count === undefined && legacy.count !== undefined) meta.count = legacy.count;
  if (meta.origin === undefined && legacy.origin !== undefined) meta.origin = legacy.origin;
  if (meta.sessionId === undefined && legacy.sessionId !== undefined) meta.sessionId = legacy.sessionId;
  return meta;
}

function referenceKey(type, id, request) {
  if (type !== 'query') return `${type}:${id}`;
  return `query:${JSON.stringify(canonicalValue(canonicalRequest(request)))}`;
}

function canonicalRequest(request) {
  const result = {};
  for (const [key, value] of Object.entries(request || {})) {
    if (value == null || REQUEST_DEFAULTS[key] === value) continue;
    result[key] = canonicalValue(value);
  }
  return result;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = canonicalValue(value[key]);
    }
    return result;
  }
  return value;
}

function isEmptyRequest(request) {
  if (!request || !Object.keys(request).length) return true;
  if (Object.keys(request).length !== 1 || !Object.hasOwn(request, 'q')) return false;
  const q = request.q;
  return q == null || (typeof q === 'string' && !q.trim());
}

function removeUndefined(value) {
  const result = {};
  for (const [key, item] of Object.entries(value || {})) if (item !== undefined) result[key] = item;
  return result;
}

function normalizedText(value) {
  const text = value == null ? '' : String(value).trim();
  return text || null;
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function clone(value) {
  if (value == null) return value;
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
