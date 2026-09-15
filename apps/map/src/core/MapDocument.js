/**
 * @file MapDocument.js
 * @brief Validates and normalizes public MapDocument responses while preserving the
 *        engine-neutral API representation.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { normalizeBounds } from '../utils/normalizeBounds.js';

/** Format identifier stamped on every normalized MapDocument. */
export const MAP_DOCUMENT_FORMAT = 'heurist-map-document';

/** Current MapDocument schema version. */
export const MAP_DOCUMENT_VERSION = 1;

/** Default bookmark used when no valid bookmark can be normalized. */
const DEFAULT_BOOKMARK = Object.freeze({
  raw: '',
  type: 'view',
  center: Object.freeze({ latitude: 0, longitude: 0 }),
  zoom: 2
});

/**
 * Normalize the public/API MapDocument version 1 representation.
 *
 * API MapDocuments contain only engine-neutral domain values. Runtime and
 * map-engine options are produced separately by createMapEnvironment().
 *
 * @param {object} [value] Raw MapDocument payload (public API or legacy DB fields).
 * @returns {object} Canonical MapDocument.
 */
export function normalizeMapDocument(value = {}) {
  const source = isObject(value) ? value : {};

  return {
    format: source.format || MAP_DOCUMENT_FORMAT,
    version: normalizeVersion(source.version),
    id: positiveIntegerOrNull(source.id ?? source.rec_ID),
    title: String(source.title ?? source.rec_Title ?? source.name ?? 'Default map document'),
    mapBookmark: normalizeMapBookmark(
      source.mapBookmark ?? source.bookmark ?? source.DT_MAP_BOOKMARK
    ),
    bounds: normalizeBounds(source.bounds ?? source.geoObject ?? source.DT_GEO_OBJECT),
    symbology: source.symbology ?? source.DT_SYMBOLOGY ?? null,
    // Native map-engine zoom levels take precedence over kilometre-based values.
    minZoom: finiteNumberOrNull(
      source.minZoom ?? source.DT_MINIMUM_ZOOM_LEVEL
    ),
    maxZoom: finiteNumberOrNull(
      source.maxZoom ?? source.DT_MAXIMUM_ZOOM_LEVEL
    ),
    minimumZoomKm: finiteNumberOrNull(
      source.minimumZoomKm ?? source.minimumZoom ?? source.DT_MINIMUM_ZOOM
    ),
    maximumZoomKm: finiteNumberOrNull(
      source.maximumZoomKm ?? source.maximumZoom ?? source.DT_MAXIMUM_ZOOM
    ),
    zoomToPointInKM: finiteNumberOrNull(
      source.zoomToPointInKM ?? source.zoomToPointKm ?? source.DT_ZOOM_KM_POINT
    ),
    // No MapDocument basemap means: use the configured initial/default basemap.
    // An explicit `None` term remains distinguishable and disables the basemap.
    worldBaseMap: normalizeTermDescriptor(
      source.worldBaseMap ?? source.baseMap ?? source.baseLayer ?? source.DT_WORLD_BASEMAP,
      null
    ),
    crs: normalizeTermDescriptor(
      source.crs ?? source.DT_CRS,
      { code: 'EPSG:3857', label: 'Web Mercator' }
    ),
    layers: normalizeLayerReferences(source.layers ?? source.initialLayers)
  };
}

/**
 * Normalize a raw map bookmark (legacy encoded string or object) into the
 * canonical `{ raw, type, ... }` bookmark shape.
 *
 * @param {object|string} value Raw bookmark value.
 * @returns {object} Canonical bookmark; falls back to {@link DEFAULT_BOOKMARK} when unrecognized.
 */
export function normalizeMapBookmark(value) {
  if (typeof value === 'string') {
    return parseLegacyBookmark(value);
  }

  if (isObject(value)) {
    const raw = typeof value.raw === 'string' ? value.raw : '';
    const type = String(value.type || '').toLowerCase();
    const bounds = normalizeBounds(value.bounds);

    if (type === 'extent' && bounds) {
      return { raw, type: 'extent', bounds };
    }

    const point = normalizeCenter(value.point);
    if (type === 'point' && point) {
      return compact({
        raw,
        type: 'point',
        point,
        minimumZoom: finiteNumberOrNull(value.minimumZoom),
        maximumZoom: finiteNumberOrNull(value.maximumZoom),
        zoom: finiteNumberOrNull(value.zoom)
      });
    }

    // Local/default documents may use a view bookmark. The public API schema
    // permits additional bookmark properties, so this remains transport-safe.
    const center = normalizeCenter(value.center);
    if (type === 'view' && center) {
      return {
        raw,
        type: 'view',
        center,
        zoom: finiteNumberOrNull(value.zoom) ?? DEFAULT_BOOKMARK.zoom
      };
    }
  }

  return {
    raw: '',
    type: DEFAULT_BOOKMARK.type,
    center: { ...DEFAULT_BOOKMARK.center },
    zoom: DEFAULT_BOOKMARK.zoom
  };
}

/**
 * Decode a legacy comma-delimited bookmark string (`extent,...` or `point,...`).
 *
 * @param {string} value Legacy encoded bookmark string.
 * @returns {object} Canonical bookmark; falls back to {@link DEFAULT_BOOKMARK} when unparseable.
 */
function parseLegacyBookmark(value) {
  const parts = value.split(',').map((part) => part.trim());

  if (parts[0]?.toLowerCase() === 'extent' && parts.length >= 5) {
    const south = Number(parts[1]);
    const west = Number(parts[2]);
    const north = Number(parts[3]);
    const east = Number(parts[4]);

    if ([west, south, east, north].every(Number.isFinite)) {
      return {
        raw: value,
        type: 'extent',
        bounds: { west, south, east, north }
      };
    }
  }

  if (parts[0]?.toLowerCase() === 'point' && parts.length >= 3) {
    const latitude = Number(parts[1]);
    const longitude = Number(parts[2]);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return compact({
        raw: value,
        type: 'point',
        point: { latitude, longitude },
        minimumZoom: finiteNumberOrNull(parts[3]),
        maximumZoom: finiteNumberOrNull(parts[4]),
        zoom: finiteNumberOrNull(parts[5])
      });
    }
  }

  return {
    raw: value,
    type: DEFAULT_BOOKMARK.type,
    center: { ...DEFAULT_BOOKMARK.center },
    zoom: DEFAULT_BOOKMARK.zoom
  };
}

/**
 * Normalize a raw term reference (id, code string, or object) into `{ id, code, label }`.
 *
 * @param {*} value Raw term reference.
 * @param {object|null} [defaults] Fallback `{ code, label }` used when `value` is absent/unrecognized.
 * @returns {object|null} Normalized term descriptor, or `null` when explicitly absent.
 */
function normalizeTermDescriptor(value, defaults = null) {
  if (value === false || value === null) {
    return null;
  }

  if (typeof value === 'number') {
    return { id: positiveIntegerOrNull(value), code: null, label: null };
  }

  if (typeof value === 'string') {
    const code = value === 'XY' ? 'Simple' : value;
    return { id: null, code, label: code };
  }

  if (!isObject(value)) {
    return defaults ? { id: null, ...defaults } : null;
  }

  const rawCode = value.code ?? value.termCode ?? value.name ?? defaults?.code ?? null;
  const code = rawCode === 'XY' ? 'Simple' : rawCode;

  return {
    id: positiveIntegerOrNull(value.id ?? value.termId ?? value.trm_ID),
    code: code == null ? null : String(code),
    label: String(value.label ?? value.title ?? value.name ?? code ?? defaults?.label ?? '') || null
  };
}

/**
 * Normalize a raw list of layer references, sorted by their resolved order.
 *
 * @param {Array} value Raw layer reference list.
 * @returns {Array<object>} Normalized `{ id, recordId, title, order, visible }` entries.
 */
function normalizeLayerReferences(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((layer, index) => normalizeLayerReference(layer, index))
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

/**
 * Normalize a single raw layer reference (bare record id, or object).
 *
 * @param {*} value Raw layer reference.
 * @param {number} index Position in the source list, used as the default order.
 * @returns {object|null} Normalized layer reference, or `null` when it has no resolvable record id.
 */
function normalizeLayerReference(value, index) {
  if (typeof value === 'number' || typeof value === 'string') {
    const recordId = positiveIntegerOrNull(value);
    return recordId
      ? { id: recordId, recordId, title: '', order: index + 1, visible: true }
      : null;
  }

  if (!isObject(value)) {
    return null;
  }

  const recordId = positiveIntegerOrNull(value.recordId ?? value.id ?? value.rec_ID);
  if (!recordId) {
    return null;
  }

  return {
    id: positiveIntegerOrNull(value.id) || recordId,
    recordId,
    title: String(value.title ?? value.name ?? ''),
    order: positiveIntegerOrNull(value.order) || index + 1,
    visible: value.visible !== false
  };
}

/**
 * Coerce a raw version value to a supported MapDocument schema version.
 *
 * @param {*} value Raw version value.
 * @returns {number} A supported version number, defaulting to {@link MAP_DOCUMENT_VERSION}.
 */
function normalizeVersion(value) {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : MAP_DOCUMENT_VERSION;
}

/**
 * Normalize a raw coordinate (object with `latitude`/`lat`/`[0]` fields, or array pair) to `{ latitude, longitude }`.
 *
 * @param {*} value Raw coordinate value.
 * @returns {{latitude: number, longitude: number}|null} Normalized coordinate, or `null` when not finite.
 */
function normalizeCenter(value) {
  const latitude = Number(value?.latitude ?? value?.lat ?? value?.[0]);
  const longitude = Number(value?.longitude ?? value?.lng ?? value?.lon ?? value?.[1]);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

/**
 * Coerce a value to a finite number, or `null` when it is empty/non-numeric.
 *
 * @param {*} value Candidate value.
 * @returns {number|null} The finite number, or `null`.
 */
function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Coerce a value to a positive integer, or `null` when it is not one.
 *
 * @param {*} value Candidate value.
 * @returns {number|null} The positive integer, or `null`.
 */
function positiveIntegerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/**
 * Return a shallow copy of an object with `null`/`undefined`-valued keys removed.
 *
 * @param {object} value Source object.
 * @returns {object} Compacted shallow copy.
 */
function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null)
  );
}

/**
 * Whether a value is a plain, non-array object.
 *
 * @param {*} value Candidate value.
 * @returns {boolean} `true` when `value` is a non-null, non-array object.
 */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
