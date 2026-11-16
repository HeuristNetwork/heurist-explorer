/**
 * @file DataSource.js
 * @brief Canonical Explorer DataSource helpers.
 *
 * A DataSource is a resolved, runtime transfer object. It is never persisted
 * independently: reference identifies its producer, request is executable by
 * presentation modules, and presentation carries optional module profiles.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

const REFERENCE_ALIASES = Object.freeze({
  query: 'query', filter: 'filter', recordtype: 'recordtype', rectype: 'recordtype',
  source: 'source', querysource: 'source', 'query-source': 'source',
  dataset: 'source', mapsource: 'source', 'map-source': 'source'
});
const PRESENTATION_TYPES = ['data', 'map', 'graph', 'timeline', 'filterForm'];
const REQUEST_DEFAULTS = Object.freeze({ w: 'all', rulesonly: 0 });

/**
 * Convert legacy and canonical inputs to the one runtime DataSource shape.
 *
 * @param {object|null} source Legacy or canonical datasource-like input.
 * @returns {object|null} Normalized DataSource, or `null` when `source` is `null`.
 * @throws {TypeError} When `source` is not an object, or lacks a valid reference type, id, or request.
 */
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

/**
 * Return the stable identity key of a datasource, or `null` when invalid.
 *
 * @param {object} source Legacy or canonical datasource-like input.
 * @returns {string|null} Identity key, or `null` when `source` cannot be normalized.
 */
export function dataSourceKey(source) {
  try { return normalizeDataSource(source)?.reference.key ?? null; } catch { return null; }
}

/**
 * Whether two datasource-like values resolve to the same identity.
 *
 * @param {object} a First datasource.
 * @param {object} b Second datasource.
 * @returns {boolean} True when both resolve to the same non-null identity key.
 */
export function isSameDataSource(a, b) {
  const left = dataSourceKey(a);
  const right = dataSourceKey(b);
  return Boolean(left && right && left === right);
}

/**
 * Return a datasource's display title, or a fallback when invalid or untitled.
 *
 * @param {object} source Legacy or canonical datasource-like input.
 * @param {string} [fallback=''] Title to use when none is set.
 * @returns {string} Resolved title.
 */
export function dataSourceTitle(source, fallback = '') {
  try { return normalizeDataSource(source)?.title || fallback; } catch { return fallback; }
}

/**
 * Normalize and deep-clone a datasource, isolating it from the caller's object.
 *
 * @param {object} source Legacy or canonical datasource-like input.
 * @returns {object|null} Cloned, normalized DataSource, or `null` when invalid.
 */
export function cloneDataSource(source) {
  const normalized = normalizeDataSource(source);
  return normalized == null ? null : clone(normalized);
}

/**
 * Classify a datasource's role in Explorer's history/favorites model.
 *
 * @param {object} source Legacy or canonical datasource-like input.
 * @returns {'current'|'saved'|'other'} `'current'` for query/recordtype, `'saved'` for filter/source, else `'other'`.
 */
export function dataSourceRole(source) {
  let type;
  try { type = normalizeDataSource(source)?.reference.type; } catch { return 'other'; }
  if (type === 'query' || type === 'recordtype') return 'current';
  if (type === 'filter' || type === 'source') return 'saved';
  return 'other';
}

/**
 * Return the complete executable records request.
 *
 * @param {object} source Legacy or canonical datasource-like input.
 * @returns {object|null} Cloned request object, or `null` when invalid.
 */
export function dataSourceRequest(source) {
  try { return cloneDataSource(source)?.request ?? null; } catch { return null; }
}

/**
 * Return one resolved presentation profile without exposing shared state.
 *
 * @param {object} source Legacy or canonical datasource-like input.
 * @param {string} moduleType One of `PRESENTATION_TYPES` (`data`, `map`, `graph`, `timeline`, `filterForm`).
 * @returns {object|null} Cloned presentation profile, or `null` when absent, invalid, or an unknown module type.
 */
export function dataSourcePresentation(source, moduleType) {
  if (!PRESENTATION_TYPES.includes(moduleType)) return null;
  try { return cloneDataSource(source)?.presentation?.[moduleType] ?? null; } catch { return null; }
}

/** Normalize a legacy or canonical reference type string to one of `REFERENCE_ALIASES`' values. */
function normalizeReferenceType(value) {
  const key = String(value ?? '').trim().toLowerCase().replaceAll('_', '-');
  return REFERENCE_ALIASES[key] ?? null;
}

/** Resolve the persistent reference id from canonical or legacy id fields, by reference type. */
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

/** Derive an executable request from legacy `query`/`q`-shaped source fields. */
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

/** Normalize a request value to a plain object, wrapping bare query values as `{ q: value }`. */
function normalizeRequest(value) {
  if (value == null) return {};
  const request = typeof value === 'object' && !Array.isArray(value) ? clone(value) : { q: clone(value) };
  return removeUndefined(request);
}

/** Normalize a presentation map, ensuring every known presentation type has an entry. */
function normalizePresentation(value) {
  const input = objectValue(value);
  const result = {};
  for (const type of PRESENTATION_TYPES) result[type] = input[type] == null ? null : clone(input[type]);
  for (const [key, profile] of Object.entries(input)) {
    if (!(key in result) && profile !== undefined) result[key] = clone(profile);
  }
  return result;
}

/** Normalize datasource metadata, backfilling legacy top-level `count`/`origin`/`sessionId` fields. */
function normalizeMeta(value, legacy) {
  const meta = removeUndefined(clone(objectValue(value)));
  if (meta.count === undefined && legacy.count !== undefined) meta.count = legacy.count;
  if (meta.origin === undefined && legacy.origin !== undefined) meta.origin = legacy.origin;
  if (meta.sessionId === undefined && legacy.sessionId !== undefined) meta.sessionId = legacy.sessionId;
  return meta;
}

/** Build the stable identity key for a reference type, id, and (for queries) canonical request. */
function referenceKey(type, id, request) {
  if (type !== 'query') return `${type}:${id}`;
  return `query:${JSON.stringify(canonicalValue(canonicalRequest(request)))}`;
}

/** Strip default-valued and null fields from a request so equal queries produce equal keys. */
function canonicalRequest(request) {
  const result = {};
  for (const [key, value] of Object.entries(request || {})) {
    if (value == null || REQUEST_DEFAULTS[key] === value) continue;
    result[key] = canonicalValue(value);
  }
  return result;
}

/** Recursively sort object keys and map arrays, so structurally equal values serialize identically. */
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

/** Whether a request has no executable content (no keys, or only a blank/absent `q`). */
function isEmptyRequest(request) {
  if (!request || !Object.keys(request).length) return true;
  if (Object.keys(request).length !== 1 || !Object.hasOwn(request, 'q')) return false;
  const q = request.q;
  return q == null || (typeof q === 'string' && !q.trim());
}

/** Return a shallow copy of an object with `undefined`-valued keys removed. */
function removeUndefined(value) {
  const result = {};
  for (const [key, item] of Object.entries(value || {})) if (item !== undefined) result[key] = item;
  return result;
}

/** Trim a value to text, returning `null` for empty results. */
function normalizedText(value) {
  const text = value == null ? '' : String(value).trim();
  return text || null;
}

/** Return the value when it is a plain object, otherwise `{}`. */
function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** Normalize a value to a positive integer id, or `null` when invalid. */
function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Deep-clone a JSON-safe value, tolerating `null`/`undefined`. */
function clone(value) {
  if (value == null) return value;
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
