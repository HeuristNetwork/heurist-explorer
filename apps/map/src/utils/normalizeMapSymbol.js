/**
 * normalizeMapSymbol.js - Map symbol normalization
 *
 * @fileOverview Resolves sparse Heurist map symbols against an effective parent
 * and converts them into the complete engine-neutral symbol used at runtime.
 * Persisted opacity is canonical 0..1. Legacy 0..100 values are accepted only
 * at this normalization boundary. iconSize is the semantic marker diameter;
 * Leaflet circle radius is derived as iconSize / 2.
 * @project     Heurist mapping application
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2026 Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

/** Built-in symbology shared with main Heurist. */
export const DEFAULT_MAP_SYMBOL = Object.freeze({
  iconType: 'rectype',
  color: '#ff0000',
  fillColor: '#ff0000',
  weight: 3,
  opacity: 1,
  dashArray: '',
  fillOpacity: 0.2,
  iconSize: 18,
  stroke: true,
  fill: true
});

/**
 * Canonicalize one sparse/local symbol without applying inheritance.
 * Radius is accepted as a legacy input alias only when iconSize is absent.
 */
export function canonicalizeMapSymbol(value = {}) {
  const symbol = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};

  if (hasOwn(symbol, 'iconType') || hasOwn(symbol, 'type')) {
    const rawType = symbol.iconType ?? symbol.type;
    if (rawType !== '' && rawType !== 'default') result.iconType = normalizeIconType(rawType);
  }
  if (hasOwn(symbol, 'iconUrl') || hasOwn(symbol, 'iconURL')) result.iconUrl = nonEmptyStringOrNull(symbol.iconUrl ?? symbol.iconURL);
  if (hasOwn(symbol, 'iconFont')) result.iconFont = nonEmptyStringOrNull(symbol.iconFont);

  if (hasOwn(symbol, 'iconSize')) {
    const size = normalizeSize(symbol.iconSize, null);
    if (size != null) result.iconSize = size;
  } else if (hasOwn(symbol, 'radius')) {
    const radius = nonNegativeNumber(symbol.radius, null);
    if (radius != null) result.iconSize = radius * 2;
  }

  if (hasOwn(symbol, 'legendLabel')) result.legendLabel = stringOrNull(symbol.legendLabel);

  if (hasOwn(symbol, 'iconAnchor')) result.iconAnchor = normalizePair(symbol.iconAnchor, null);
  if (hasOwn(symbol, 'popupAnchor')) result.popupAnchor = normalizePair(symbol.popupAnchor, null);
  if (hasOwn(symbol, 'color')) result.color = nonEmptyStringOrNull(symbol.color);
  if (hasOwn(symbol, 'fillColor')) result.fillColor = nonEmptyStringOrNull(symbol.fillColor);
  if (hasOwn(symbol, 'weight')) result.weight = nonNegativeNumber(symbol.weight, null);
  if (hasOwn(symbol, 'opacity')) result.opacity = normalizeOpacity(symbol.opacity, null);
  if (hasOwn(symbol, 'fillOpacity')) result.fillOpacity = normalizeOpacity(symbol.fillOpacity, null);
  if (hasOwn(symbol, 'fill')) result.fill = booleanValue(symbol.fill, null);
  if (hasOwn(symbol, 'stroke')) result.stroke = booleanValue(symbol.stroke, null);
  if (hasOwn(symbol, 'dashArray')) result.dashArray = stringOrNull(symbol.dashArray);

  for (const name of ['blur', 'brightness', 'contrast', 'grayscale', 'invert', 'saturate', 'sepia', 'transparentColor']) {
    if (hasOwn(symbol, name)) result[name] = nonEmptyStringOrNull(symbol[name]);
  }
  if (hasOwn(symbol, 'hue-rotate') || hasOwn(symbol, 'hueRotate')) {
    result['hue-rotate'] = nonEmptyStringOrNull(symbol['hue-rotate'] ?? symbol.hueRotate);
  }

  return result;
}

/**
 * Normalize a complete map symbol against an effective parent.
 * DEFAULT_MAP_SYMBOL is always the final fallback.
 */
export function normalizeMapSymbol(value = {}, parentSymbol = DEFAULT_MAP_SYMBOL) {
  const parent = canonicalizeMapSymbol(parentSymbol);

  delete parent.legendLabel; // legendLabel is never inherited, only local

  const local = canonicalizeMapSymbol(value);
  const merged = { ...canonicalizeMapSymbol(DEFAULT_MAP_SYMBOL), ...definedValues(parent), ...definedValues(local) };

  const iconSize = normalizeSize(merged.iconSize, DEFAULT_MAP_SYMBOL.iconSize);
  const result = {
    iconType: normalizeIconType(merged.iconType ?? DEFAULT_MAP_SYMBOL.iconType),
    iconUrl: nonEmptyStringOrNull(merged.iconUrl),
    iconFont: nonEmptyStringOrNull(merged.iconFont),
    iconSize: [iconSize, iconSize],
    iconAnchor: normalizePair(merged.iconAnchor, null),
    popupAnchor: normalizePair(merged.popupAnchor, null),
    color: nonEmptyString(merged.color, DEFAULT_MAP_SYMBOL.color),
    fillColor: nonEmptyString(merged.fillColor, DEFAULT_MAP_SYMBOL.fillColor),
    weight: nonNegativeNumber(merged.weight, DEFAULT_MAP_SYMBOL.weight),
    opacity: normalizeOpacity(merged.opacity, DEFAULT_MAP_SYMBOL.opacity),
    fillOpacity: normalizeOpacity(merged.fillOpacity, DEFAULT_MAP_SYMBOL.fillOpacity),
    fill: booleanValue(merged.fill, DEFAULT_MAP_SYMBOL.fill),
    stroke: booleanValue(merged.stroke, DEFAULT_MAP_SYMBOL.stroke),
    dashArray: stringOrNull(merged.dashArray),
    blur: nonEmptyStringOrNull(merged.blur),
    brightness: nonEmptyStringOrNull(merged.brightness),
    contrast: nonEmptyStringOrNull(merged.contrast),
    grayscale: nonEmptyStringOrNull(merged.grayscale),
    'hue-rotate': nonEmptyStringOrNull(merged['hue-rotate'] ?? merged.hueRotate),
    invert: nonEmptyStringOrNull(merged.invert),
    saturate: nonEmptyStringOrNull(merged.saturate),
    sepia: nonEmptyStringOrNull(merged.sepia),
    transparentColor: nonEmptyStringOrNull(merged.transparentColor),
    legendLabel: nonEmptyStringOrNull(merged.legendLabel)
  };

  // radius is runtime/Leaflet compatibility, never an independent inherited property.
  result.radius = result.iconType === 'circle' ? iconSize / 2 : iconSize / 2;
  return result;
}

/**
 * Normalize only explicitly stored thematic range properties. The range remains
 * sparse; it is applied later over its effective thematic parent.
 */
export function normalizeMapSymbolOverride(value = {}) {
  const local = canonicalizeMapSymbol(value);
  const result = { ...local };
  if (hasOwn(result, 'iconSize')) {
    const size = normalizeSize(result.iconSize, null);
    if (size != null) result.iconSize = [size, size];
  }
  return result;
}

/** Convert legacy percentage opacity to canonical 0..1. */
export function normalizeOpacity(value, fallback = 1) {
  let number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  if (number > 1) number /= 100;
  return Math.min(1, Math.max(0, number));
}

function definedValues(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => item !== null && item !== undefined && item !== ''));
}
function hasOwn(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
function normalizeIconType(value) {
  const type = String(value || '').trim().toLowerCase();
  return ['circle', 'marker', 'icon', 'iconfont', 'url', 'rectype'].includes(type) ? type : DEFAULT_MAP_SYMBOL.iconType;
}
function normalizeSize(value, fallback) {
  if (Array.isArray(value)) value = value[0];
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
function normalizePair(value, fallback) {
  if (Array.isArray(value) && value.length >= 2) {
    const first = Number(value[0]); const second = Number(value[1]);
    if (Number.isFinite(first) && Number.isFinite(second)) return [first, second];
  } else if (value !== null && value !== undefined && value !== '') {
    const number = Number(value);
    if (Number.isFinite(number)) return [number, number];
  }
  return Array.isArray(fallback) ? [...fallback] : fallback;
}
function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
function booleanValue(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  const text = value == null ? '' : String(value).trim().toLowerCase();
  if (text === 'true') return true;
  if (text === 'false') return false;
  return fallback;
}
function nonEmptyString(value, fallback) {
  const text = value == null ? '' : String(value).trim();
  return text || fallback;
}
function nonEmptyStringOrNull(value) {
  const text = value == null ? '' : String(value).trim();
  return text || null;
}
function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim();
}
