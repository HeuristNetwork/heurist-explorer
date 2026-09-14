/**
 * thematicSymbolResolver.js - Thematic feature symbol resolution
 *
 * @fileOverview Resolves one normalized thematic map against feature attributes and returns the final engine-neutral map symbol.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

import { getActiveThematicMap } from './thematicAttributes.js';

const GEO_FIELD_CODE = 'rec_GeoField';

/**
 * Resolve the final symbol for one GeoJSON feature.
 *
 * With no active thematic map, the ordinary normalized layer symbol is returned.
 * With an active thematic map, resolution starts from the thematic base symbol and
 * applies at most one range override per thematic field, in field order. Multiple
 * fields may therefore contribute independent properties to the final symbol.
 */
export function resolveFeatureSymbol(feature, style = {}) {
  const ordinarySymbol = isObject(style.symbol) ? style.symbol : {};
  const theme = getActiveThematicMap(style);
  if (!theme) return ordinarySymbol;

  let symbol = { ...(isObject(theme.symbol) ? theme.symbol : ordinarySymbol) };
  for (const field of Array.isArray(theme.fields) ? theme.fields : []) {
    const override = resolveThematicFieldSymbol(feature, field);
    if (override) symbol = mergeThematicSymbol(symbol, override);
  }
  return symbol;
}


/**
 * Merge one partial thematic range symbol into the current symbol.
 *
 * Leaflet CircleMarker renders point size from `radius`, while persisted
 * thematic ranges historically vary point size with `iconSize`. When a
 * circle range overrides iconSize but not radius, translate the requested
 * diameter to the engine radius so thematic size ranges affect the map.
 */
export function mergeThematicSymbol(base = {}, override = {}) {
  const merged = { ...(isObject(base) ? base : {}), ...(isObject(override) ? override : {}) };
  if (merged.iconType === 'circle'
      && Object.prototype.hasOwnProperty.call(override, 'iconSize')
      && !Object.prototype.hasOwnProperty.call(override, 'radius')) {
    const diameter = Array.isArray(override.iconSize)
      ? Number(override.iconSize[0])
      : Number(override.iconSize);
    if (Number.isFinite(diameter) && diameter >= 0) merged.radius = diameter / 2;
  }
  return merged;
}

/** Return the first configured range symbol matching any value of one thematic field. */
export function resolveThematicFieldSymbol(feature, field) {
  if (!field || !Array.isArray(field.ranges)) return null;
  const values = getFeatureThematicValues(feature, field.code);
  if (!values.length) return null;

  for (const range of field.ranges) {
    if (!range || !isObject(range.symbol)) continue;
    if (values.some((value) => thematicRangeMatches(value, range))) {
      return range.symbol;
    }
  }
  return null;
}

/** Return all values available to one thematic field without discarding multivalues. */
export function getFeatureThematicValues(feature, code) {
  const fieldCode = String(code ?? '').trim();
  if (!fieldCode) return [];

  const properties = isObject(feature?.properties) ? feature.properties : {};
  if (fieldCode === GEO_FIELD_CODE) {
    return flattenValues(
      properties.rec_GeoField
      ?? properties._geoFieldID
      ?? properties.heurist?.geoField
      ?? properties.heurist?.detailTypeId
      ?? properties.geoField
    );
  }

  const details = properties.thematic?.[fieldCode];
  if (isObject(details)) return Object.values(details).flatMap(flattenThematicValues);
  if (details != null) return flattenThematicValues(details);

  // Compatibility with GeoJSON that already exposes thematic values directly
  // under the persisted field-path code.
  return flattenThematicValues(properties[fieldCode]);
}

/**
 * Match one value against a persisted thematic range.
 * Supported legacy forms:
 * - "a,b,c"       membership list;
 * - "min<>max"    inclusive numeric or lexical interval;
 * - scalar value   equality.
 * Pre-parsed `min`/`max` and array-valued `value` are also supported.
 */
export function thematicRangeMatches(value, range) {
  if (!range) return false;

  if (Array.isArray(range.value)) {
    return range.value.some((candidate) => valuesEqual(value, candidate));
  }

  if (range.min != null && range.max != null) {
    return betweenInclusive(value, range.min, range.max);
  }

  if (typeof range.value === 'string') {
    const text = range.value.trim();
    if (text.includes(',')) {
      return text.split(',').map((item) => item.trim()).some((candidate) => valuesEqual(value, candidate));
    }
    const separator = text.indexOf('<>');
    if (separator >= 0) {
      const min = text.slice(0, separator).trim();
      const max = text.slice(separator + 2).trim();
      if (min !== '' && max !== '') return betweenInclusive(value, min, max);
    }
  }

  return valuesEqual(value, range.value);
}

function betweenInclusive(value, min, max) {
  const numericValue = toFiniteNumber(value);
  const numericMin = toFiniteNumber(min);
  const numericMax = toFiniteNumber(max);
  if (numericValue != null && numericMin != null && numericMax != null) {
    return numericValue >= numericMin && numericValue <= numericMax;
  }

  const text = scalarText(value);
  const minText = scalarText(min);
  const maxText = scalarText(max);
  if (text == null || minText == null || maxText == null) return false;
  return text >= minText && text <= maxText;
}

function valuesEqual(left, right) {
  const leftNumber = toFiniteNumber(left);
  const rightNumber = toFiniteNumber(right);
  if (leftNumber != null && rightNumber != null) return leftNumber === rightNumber;
  return scalarText(left) === scalarText(right);
}

function toFiniteNumber(value) {
  if (value == null || value === '' || typeof value === 'boolean' || isObject(value) || Array.isArray(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scalarText(value) {
  if (value == null || isObject(value) || Array.isArray(value)) return null;
  return String(value);
}

function flattenValues(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenValues);
  return [value];
}

/** Extract the actual value while retaining compatibility with legacy scalars. */
function flattenThematicValues(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenThematicValues);
  if (isObject(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return flattenValues(value.value);
  }
  return flattenValues(value);
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
