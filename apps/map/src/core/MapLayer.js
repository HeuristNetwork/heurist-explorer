/**
 * MapLayer.js - MapLayer domain normalization
 *
 * @fileOverview Validates and normalizes public MapLayer responses, source definitions, styles, options, and supported source types.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

import { normalizeLayerStyle } from '../utils/normalizeLayerStyle.js';
import { normalizeMapSymbol } from '../utils/normalizeMapSymbol.js';
import { normalizeBounds } from '../utils/normalizeBounds.js';

export const MAP_LAYER_FORMAT = 'heurist-map-layer';
export const MAP_LAYER_VERSION = 1;

/** Normalize a MapLayer, applying configured global fallbacks only when absent. */
export function normalizeMapLayer(value = {}, { defaults = {} } = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const sourceOptions = source.options && typeof source.options === 'object' ? source.options : {};
  const defaulted = {
    symbology: !hasExplicitSymbol(source.style),
    selectSymbology: !hasExplicitSelectSymbol(source.style),
    markerClustering: !Object.hasOwn(sourceOptions, 'markerClustering'),
    markerClusterGridPixels: !Object.hasOwn(sourceOptions, 'markerClusterGridPixels'),
    markerClusterMaxLevel: !Object.hasOwn(sourceOptions, 'markerClusterMaxLevel'),
    maxAllowedFeatures: !Object.hasOwn(sourceOptions, 'maxAllowedFeatures'),
    dynamicRequests: !Object.hasOwn(sourceOptions, 'dynamicRequests'),
    popupTemplate: !Object.hasOwn(sourceOptions, 'popupTemplate'),
    sourceLimit: source.source?.type === 'heurist-query'
      && (source.source.limit === null || source.source.limit === undefined || source.source.limit === '')
  };

  const options = normalizeOptions(sourceOptions, defaults);
  const normalizedSource = normalizeSource(source.source);
  if (defaulted.sourceLimit && Number(options.maxAllowedFeatures) > 0) {
    normalizedSource.limit = Number(options.maxAllowedFeatures);
  }

  const result = {
    format: source.format || MAP_LAYER_FORMAT,
    version: Number(source.version) || MAP_LAYER_VERSION,
    id: positiveIntegerOrNull(source.id),
    title: String(source.title || ''),
    description: String(source.description || ''),
    visible: source.visible !== false,
    selectable: source.selectable !== false,
    source: normalizedSource,
    style: normalizeStyle(source.style, defaults),
    timeline: normalizeTimeline(source.timeline),
    options
  };

  // Internal inheritance metadata is intentionally non-enumerable: it must not
  // leak through public API clones or persisted configuration.
  Object.defineProperty(result, '_defaulted', {
    value: defaulted,
    enumerable: false,
    configurable: true,
    writable: true
  });
  // Preserve the sparse/source style privately so changed global defaults can be
  // resolved again without materialising inherited values into persistence.
  Object.defineProperty(result, '_sourceStyle', {
    value: cloneObject(source.style) || {},
    enumerable: false,
    configurable: true,
    writable: true
  });
  return result;
}

/** Reapply changed global defaults to properties originally inherited by a layer. */
export function reapplyMapLayerDefaults(mapLayer, defaults = {}) {
  const inherited = mapLayer?._defaulted;
  if (!inherited) return false;
  let changed = false;

  // Every sparse layer/thematic symbol inherits from global defaults, even when
  // it has some explicit properties. Re-resolve from the private source style so
  // only inherited properties change. Explicit overrides remain untouched.
  if (mapLayer._sourceStyle) {
    const style = normalizeStyle(mapLayer._sourceStyle, defaults);
    if (!sameJson(mapLayer.style, style)) {
      mapLayer.style = style;
      changed = true;
    }
  } else {
    if (inherited.symbology) {
      const symbol = normalizeMapSymbol(defaults.symbology ?? {});
      if (!sameJson(mapLayer.style?.symbol, symbol)) {
        mapLayer.style = { ...(mapLayer.style || {}), symbol };
        changed = true;
      }
    }
    if (inherited.selectSymbology) {
      const selectSymbol = cloneObject(defaults.selectSymbology);
      if (!sameJson(mapLayer.style?.selectSymbol, selectSymbol)) {
        mapLayer.style = { ...(mapLayer.style || {}), selectSymbol };
        changed = true;
      }
    }
  }

  const optionDefaults = {
    markerClustering: defaults.markerClustering === true,
    markerClusterGridPixels: boundedNumber(defaults.markerClusterGridPixels, 20, 0, 100),
    markerClusterMaxLevel: boundedNumber(defaults.markerClusterMaxLevel, 12, 1, 18),
    maxAllowedFeatures: positiveIntegerOrNull(defaults.maxAllowedFeatures) ?? 1000,
    dynamicRequests: defaults.dynamicRequests === true,
    popupTemplate: nullableString(defaults.popupTemplate)
  };
  for (const key of ['markerClustering', 'markerClusterGridPixels', 'markerClusterMaxLevel', 'maxAllowedFeatures', 'dynamicRequests', 'popupTemplate']) {
    if (!inherited[key]) continue;
    if (!sameJson(mapLayer.options?.[key], optionDefaults[key])) {
      mapLayer.options = { ...(mapLayer.options || {}), [key]: optionDefaults[key] };
      changed = true;
    }
  }

  if (inherited.sourceLimit && mapLayer.source?.type === 'heurist-query') {
    const limit = Number(mapLayer.options?.maxAllowedFeatures) || 1000;
    if (Number(mapLayer.source.limit) !== limit) {
      mapLayer.source = { ...mapLayer.source, limit };
      changed = true;
    }
  }
  return changed;
}

function normalizeSource(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    ...source,
    type: String(source.type || ''),
    recordId: positiveIntegerOrNull(source.recordId),
    title: String(source.title || ''),
    geoFields: normalizeGeoFields(source.geoFields),
    bounds: normalizeBounds(source.bounds)
  };
}


function normalizeGeoFields(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeStyle(value, defaults) {
  return normalizeLayerStyle(value, {
    symbol: defaults?.symbology ?? null,
    selectSymbol: defaults?.selectSymbology ?? null
  });
}

function normalizeTimeline(value) {
  const timeline = value && typeof value === 'object' ? value : {};
  return {
    enabled: timeline.enabled === true,
    fields: Array.isArray(timeline.fields) ? [...timeline.fields] : []
  };
}

function normalizeOptions(value, defaults = {}) {
  const options = value && typeof value === 'object' ? { ...value } : {};
  return {
    ...options,
    minZoom: finiteNumberOrNull(options.minZoom),
    maxZoom: finiteNumberOrNull(options.maxZoom),
    minimumZoomKm: finiteNumberOrNull(options.minimumZoomKm ?? options.minimumZoom),
    maximumZoomKm: finiteNumberOrNull(options.maximumZoomKm ?? options.maximumZoom),
    markerClustering: typeof options.markerClustering === 'boolean'
      ? options.markerClustering : defaults.markerClustering === true,
    markerClusterGridPixels: boundedNumber(options.markerClusterGridPixels, boundedNumber(defaults.markerClusterGridPixels, 20, 0, 100), 0, 100),
    markerClusterMaxLevel: boundedNumber(options.markerClusterMaxLevel, boundedNumber(defaults.markerClusterMaxLevel, 12, 1, 18), 1, 18),
    maxAllowedFeatures: positiveIntegerOrNull(options.maxAllowedFeatures)
      ?? positiveIntegerOrNull(defaults.maxAllowedFeatures)
      ?? 1000,
    dynamicRequests: typeof options.dynamicRequests === 'boolean'
      ? options.dynamicRequests : defaults.dynamicRequests === true,
    popupTemplate: nullableString(options.popupTemplate) ?? nullableString(defaults.popupTemplate)
  };
}

function hasExplicitSymbol(value) {
  const style = value && typeof value === 'object' ? value : {};
  const candidate = style.symbol !== undefined ? style.symbol : style;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
  const ignored = new Set(['type', 'thematic', 'selectSymbol', 'selectSymbology']);
  return Object.keys(candidate).some((key) => !ignored.has(key));
}

function hasExplicitSelectSymbol(value) {
  const style = value && typeof value === 'object' ? value : {};
  const candidate = style.selectSymbol ?? style.selectSymbology;
  return Boolean(candidate && typeof candidate === 'object' && !Array.isArray(candidate) && Object.keys(candidate).length);
}

function cloneObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? JSON.parse(JSON.stringify(value))
    : null;
}

function sameJson(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function nullableString(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveIntegerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
