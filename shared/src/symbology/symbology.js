/**
 * @file symbology.js
 * @brief The persisted symbology value (DT_SYMBOLOGY) in one place: split into
 *        the layer symbol and the thematic renderers, built back, effective and
 *        sparse symbols, colour gradients.
 *
 * Port of hclient/core/utils_map.js (splitSymbology, buildSymbology, diffMapSymbol,
 * prepareMapSymbolForSave, getColourGradient), plan 17 §1. Format:
 * - a plain symbol `{color, fillColor, ...}` (no thematic renderers);
 * - `{symbol, thematic: [renderer, ...]}`;
 * - legacy: an array of a symbol and renderers (`{fields: [...]}`), read only.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { DEFAULT_MAP_SYMBOL, canonicalizeMapSymbol } from './normalizeMapSymbol.js';

/** Vector symbol properties edited by the symbol editor (the persisted contract). */
export const SYMBOL_KEYS = Object.freeze([
  'iconType', 'iconUrl', 'iconFont', 'iconSize',
  'stroke', 'color', 'weight', 'dashArray', 'opacity',
  'fill', 'fillColor', 'fillOpacity'
]);

/** Raster (image layer) filter properties edited by the image filter editor. */
export const IMAGE_FILTER_KEYS = Object.freeze([
  'blur', 'brightness', 'contrast', 'grayscale', 'hue-rotate', 'invert', 'opacity', 'saturate', 'sepia', 'transparentColor'
]);

/**
 * Parse a stored value: JSON text or an object; anything else is null.
 *
 * @param {*} value Stored value.
 * @returns {object|Array|null} The parsed value.
 */
export function parseSymbology(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  const text = String(value).trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Split a stored symbology value into the layer symbol and the thematic renderers.
 *
 * @param {*} value Stored value (object, legacy array or JSON text).
 * @returns {{symbol: object|null, thematic: Array<object>}} Copies of both parts.
 */
export function splitSymbology(value) {
  const parsed = parseSymbology(value);
  if (!parsed) return { symbol: null, thematic: [] };
  if (Array.isArray(parsed)) {
    let symbol = null;
    const thematic = [];
    for (const item of parsed) {
      if (!isPlainObject(item)) continue;
      if (Array.isArray(item.fields)) thematic.push(clone(item));
      else symbol = clone(isPlainObject(item.symbol) ? item.symbol : item);
    }
    return { symbol, thematic };
  }
  if (Object.hasOwn(parsed, 'symbol') || Array.isArray(parsed.thematic)) {
    return {
      symbol: isPlainObject(parsed.symbol) ? clone(parsed.symbol) : null,
      thematic: Array.isArray(parsed.thematic) ? clone(parsed.thematic) : []
    };
  }
  return { symbol: clone(parsed), thematic: [] };
}

/**
 * The value to store: a plain symbol without renderers, `{symbol, thematic}` with them.
 *
 * @param {object|null} symbol Layer symbol (sparse).
 * @param {Array<object>} [thematic] Thematic renderers.
 * @returns {object} The value.
 */
export function buildSymbology(symbol, thematic = []) {
  const base = isPlainObject(symbol) ? clone(symbol) : {};
  const renderers = Array.isArray(thematic) ? clone(thematic) : [];
  return renderers.length ? { symbol: base, thematic: renderers } : base;
}

/**
 * The complete flat symbol the editor shows: built-in symbol ← parent ← local.
 * `iconSize` is one number (the persisted contract), `radius` is not kept.
 *
 * @param {object} [local] Sparse local symbol.
 * @param {object} [parent] Effective parent symbol.
 * @returns {object} Complete symbol with every SYMBOL_KEYS property.
 */
export function effectiveSymbol(local = {}, parent = DEFAULT_MAP_SYMBOL) {
  const result = { ...canonicalizeMapSymbol(DEFAULT_MAP_SYMBOL) };
  for (const source of [canonicalizeMapSymbol(parent || {}), canonicalizeMapSymbol(local || {})]) {
    for (const [key, value] of Object.entries(source)) {
      if (key === 'legendLabel' || value === null || value === undefined || value === '') continue;
      result[key] = value;
    }
  }
  if (Array.isArray(result.iconSize)) result.iconSize = result.iconSize[0];
  return result;
}

/**
 * The sparse symbol to store: only the properties of `edited` that differ from its
 * parent; a circle with its own size also keeps the Leaflet `radius` (legacy paths).
 *
 * @param {object} edited Symbol as edited (complete or sparse).
 * @param {object} [parent] Effective parent symbol.
 * @returns {object} Sparse symbol.
 */
export function sparseSymbol(edited, parent = DEFAULT_MAP_SYMBOL) {
  const base = effectiveSymbol({}, parent);
  const effective = effectiveSymbol(edited, base);
  const result = {};
  for (const [key, value] of Object.entries(effective)) {
    if (key === 'radius') continue;
    if (!sameValue(value, base[key])) result[key] = clone(value);
  }
  if (effective.iconType === 'circle' && Object.hasOwn(result, 'iconSize')) {
    const size = Number(result.iconSize);
    if (Number.isFinite(size) && size >= 0) result.radius = size / 2;
  }
  return result;
}

/**
 * Pick the editable vector properties of a value (runtime styles carry inherited
 * and engine-only properties); `iconSize` becomes one number.
 *
 * @param {object} [symbol] Symbol or runtime style symbol.
 * @returns {object} Vector symbol properties.
 */
export function vectorSymbol(symbol = {}) {
  const result = {};
  for (const key of SYMBOL_KEYS) {
    if (!isPlainObject(symbol) || symbol[key] === undefined || symbol[key] === null) continue;
    result[key] = key === 'iconSize' && Array.isArray(symbol[key]) ? symbol[key][0] : clone(symbol[key]);
  }
  if (isPlainObject(symbol) && symbol.legendLabel != null && symbol.legendLabel !== '') result.legendLabel = symbol.legendLabel;
  return result;
}

/**
 * Colours from one to another in `count` steps (legacy getColourGradient).
 *
 * @param {string} from Start colour `#rrggbb` / `#rgb`.
 * @param {string} to End colour.
 * @param {number} count Number of colours.
 * @returns {string[]} Colours `#rrggbb`; empty when a colour cannot be read.
 */
export function colourGradient(from, to, count) {
  const start = parseHexColour(from);
  const end = parseHexColour(to);
  const total = Math.max(0, Math.floor(Number(count) || 0));
  if (!start || !end || !total) return [];
  if (total === 1) return [toHexColour(start)];
  const colours = [];
  for (let index = 0; index < total; index++) {
    const ratio = index / (total - 1);
    colours.push(toHexColour(start.map((channel, i) => Math.round(channel + (end[i] - channel) * ratio))));
  }
  return colours;
}

/**
 * Values from one number to another in `count` steps (gradient of opacity, icon size).
 *
 * @param {number} from Start value.
 * @param {number} to End value.
 * @param {number} count Number of values.
 * @param {{round?: number}} [options] `round`: decimals kept (default 3).
 * @returns {number[]} Values; empty when a bound is not a number.
 */
export function numberGradient(from, to, count, { round = 3 } = {}) {
  const start = Number(from);
  const end = Number(to);
  const total = Math.max(0, Math.floor(Number(count) || 0));
  if (!Number.isFinite(start) || !Number.isFinite(end) || !total) return [];
  const factor = 10 ** Math.max(0, round);
  return Array.from({ length: total }, (_, index) => {
    const value = total === 1 ? start : start + ((end - start) * index) / (total - 1);
    return Math.round(value * factor) / factor;
  });
}

/** `#rrggbb` / `#rgb` → `[r, g, b]`, or null. */
export function parseHexColour(value) {
  const text = String(value ?? '').trim();
  let match = /^#([0-9a-f]{6})$/i.exec(text);
  if (!match) {
    const short = /^#([0-9a-f]{3})$/i.exec(text);
    if (!short) return null;
    match = [null, short[1].split('').map((c) => c + c).join('')];
  }
  return [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16));
}

/** `[r, g, b]` → `#rrggbb`. */
function toHexColour(channels) {
  return `#${channels.map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`;
}

/** Whether two symbol values are the same (numbers within rounding). */
function sameValue(left, right) {
  if (typeof left === 'number' || typeof right === 'number') {
    const a = Number(left);
    const b = Number(right);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) < 1e-9;
  }
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/** Whether a value is a plain object. */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Deep copy of a JSON value. */
function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
