/**
 * @file thematicSymbolResolver.js
 * @brief Resolves one normalized thematic map against feature attributes and returns
 *        the final engine-neutral map symbol.
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

import { rangeMatches } from '#shared/data/ranges/rangeDefinitions.js';
import { getActiveThematicMap } from './thematicAttributes.js';

const GEO_FIELD_CODE = 'rec_GeoField';

/**
 * Resolve the final symbol for one GeoJSON feature.
 *
 * With no active thematic map, the ordinary normalized layer symbol is returned.
 * With an active thematic map, resolution starts from the thematic base symbol and
 * applies at most one range override per thematic field, in field order. Multiple
 * fields may therefore contribute independent properties to the final symbol.
 *
 * @param {object} feature GeoJSON feature.
 * @param {object} [style] Normalized layer style.
 * @returns {object} Resolved engine-neutral map symbol.
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
 *
 * @param {object} [base] Base symbol.
 * @param {object} [override] Partial range-symbol override.
 * @returns {object} Merged symbol.
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

/**
 * Return the first configured range symbol matching any value of one thematic field.
 *
 * @param {object} feature GeoJSON feature.
 * @param {object} field Thematic field descriptor (`{ code, ranges }`).
 * @returns {object|null} Matching range symbol, or `null` when none match.
 */
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

/**
 * Return all values available to one thematic field without discarding multivalues.
 *
 * @param {object} feature GeoJSON feature.
 * @param {string} code Thematic field code (or {@link GEO_FIELD_CODE}).
 * @returns {Array} Flattened list of raw field values.
 */
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
 * Match one value against a persisted thematic range (shared rangeMatches).
 *
 * Supported legacy forms:
 * - "a,b,c"       membership list;
 * - "min<>max"    inclusive numeric or lexical interval;
 * - scalar value   equality.
 *
 * Pre-parsed `min`/`max` and array-valued `value` are also supported.
 *
 * @param {*} value Feature value to test.
 * @param {object} range Persisted thematic range descriptor.
 * @returns {boolean} `true` when `value` matches `range`.
 */
export function thematicRangeMatches(value, range) {
  // the shared range definitions (plan 17 §2): the editor and the map match alike
  return rangeMatches(value, range);
}

/**
 * Recursively flatten a value (or array of values) into a flat array.
 *
 * @param {*} value Candidate value or nested array.
 * @returns {Array} Flattened values.
 */
function flattenValues(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenValues);
  return [value];
}

/**
 * Extract the actual value while retaining compatibility with legacy scalars.
 *
 * @param {*} value Candidate raw thematic value, possibly `{ value }`-wrapped.
 * @returns {Array} Flattened values.
 */
function flattenThematicValues(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenThematicValues);
  if (isObject(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return flattenValues(value.value);
  }
  return flattenValues(value);
}

/**
 * Whether a value is a plain, non-array object.
 *
 * @param {*} value Candidate value.
 * @returns {boolean} `true` when `value` is a non-null, non-array object.
 */
function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
