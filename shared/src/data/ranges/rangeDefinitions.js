/**
 * @file rangeDefinitions.js
 * @brief Ranges and categories of field values: the value syntax, matching a value
 *        and generating ranges from the bounds of a field. Not tied to maps:
 *        thematic maps use it now, crosstabs later (plan 17 §2).
 *
 * Value syntax (legacy thematic maps, stored in DT_SYMBOLOGY):
 * - `"40"`         one value (a number, a term id, a text);
 * - `"40<>50"`     an inclusive interval (numbers, or dates/texts compared as text);
 * - `"69,71,75"`   a list of values.
 * A stored range may also carry `value` as an array, or `min` and `max`.
 *
 * Generation is the legacy "Define ranges" of mapThemesEditor (_definePreviewRanges):
 * `count` intervals between `min` and `max`, rounded.
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

/** Separator of an interval. */
export const INTERVAL_SEPARATOR = '<>';

/**
 * Rounding choices of generated numeric ranges: value → label. A value of 10 and more
 * rounds to that multiple; below 10 it is the number of decimals (floats).
 */
export const NUMBER_ROUNDINGS = Object.freeze([
  [100000, '100000'], [10000, '10000'], [1000, '1000'], [100, '100'], [10, '10'],
  [0, '0'], [1, '.1'], [2, '.01'], [3, '.001']
]);

/** Rounding choices of generated date ranges (years): value → label. */
export const DATE_ROUNDINGS = Object.freeze([
  [0, ''], [1, 'years'], [10, 'decades'], [100, 'centuries']
]);

/** Field types whose ranges are intervals (the others are categories). */
const INTERVAL_TYPES = new Set(['integer', 'float', 'year', 'date']);

/**
 * Whether ranges of a field type are intervals (numbers, dates) rather than categories.
 *
 * @param {string} fieldType Heurist field type.
 * @returns {boolean}
 */
export function isIntervalType(fieldType) {
  return INTERVAL_TYPES.has(String(fieldType || '').toLowerCase());
}

/**
 * Read a range value.
 *
 * @param {string|number|Array|object} value Range value (`"40"`, `"40<>50"`, `"1,2,3"`), an array,
 *        or a range `{value}` / `{min, max}`.
 * @returns {{kind: 'value'|'interval'|'list'|'empty', value?: string, min?: string, max?: string, values?: string[]}}
 */
export function parseRange(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.min != null && value.max != null) return { kind: 'interval', min: String(value.min), max: String(value.max) };
    return parseRange(value.value);
  }
  if (Array.isArray(value)) {
    const values = value.map((item) => String(item ?? '').trim()).filter(Boolean);
    return values.length ? { kind: 'list', values } : { kind: 'empty' };
  }
  const text = String(value ?? '').trim();
  if (!text) return { kind: 'empty' };
  if (text.includes(',')) {
    const values = text.split(',').map((item) => item.trim()).filter(Boolean);
    return values.length > 1 ? { kind: 'list', values } : { kind: 'value', value: values[0] || '' };
  }
  const separator = text.indexOf(INTERVAL_SEPARATOR);
  if (separator >= 0) {
    const min = text.slice(0, separator).trim();
    const max = text.slice(separator + INTERVAL_SEPARATOR.length).trim();
    if (min !== '' && max !== '') return { kind: 'interval', min, max };
    return { kind: 'value', value: min || max };
  }
  return { kind: 'value', value: text };
}

/**
 * Write a range value: an interval of `from` and `to`, one value when only one is
 * given, a list for an array.
 *
 * @param {string|number|Array} from Lower bound, the value, or a list of values.
 * @param {string|number} [to] Upper bound.
 * @returns {string} The range value; `''` when empty.
 */
export function formatRange(from, to = '') {
  if (Array.isArray(from)) return from.map((item) => String(item ?? '').trim()).filter(Boolean).join(',');
  const min = String(from ?? '').trim();
  const max = String(to ?? '').trim();
  if (min && max) return `${min}${INTERVAL_SEPARATOR}${max}`;
  return min || max;
}

/**
 * Whether a value falls in a range.
 *
 * @param {*} value Field value.
 * @param {object} range Range `{value}` (the syntax above, or an array) or `{min, max}`.
 * @returns {boolean}
 */
export function rangeMatches(value, range) {
  if (!range) return false;
  const parsed = parseRange(range);
  switch (parsed.kind) {
    case 'interval': return betweenInclusive(value, parsed.min, parsed.max);
    case 'list': return parsed.values.some((candidate) => valuesEqual(value, candidate));
    case 'value': return valuesEqual(value, parsed.value);
    default: return false;
  }
}

/**
 * The first range a value falls in.
 *
 * @param {*} value Field value.
 * @param {Array<object>} ranges Ranges.
 * @returns {object|null} The range.
 */
export function findRange(value, ranges) {
  return (Array.isArray(ranges) ? ranges : []).find((range) => rangeMatches(value, range)) || null;
}

/**
 * Generate `count` intervals between `min` and `max` (legacy "Define ranges").
 * Integer fields step by whole numbers; a rounding of 10 and more rounds the bounds to
 * that multiple (and is the smallest step); for floats a rounding below 10 is the number
 * of decimals. Dates are generated over years (a decimal year or a date's year).
 *
 * @param {object} options
 * @param {string} options.fieldType `integer` | `float` | `year` | `date`.
 * @param {number|string} options.min Smallest value.
 * @param {number|string} options.max Largest value.
 * @param {number} [options.count=10] Number of intervals.
 * @param {number} [options.rounding=0] See NUMBER_ROUNDINGS / DATE_ROUNDINGS.
 * @returns {Array<{min: number, max: number}>} Intervals in order; empty when the bounds are not usable.
 */
export function generateRanges({ fieldType = 'float', min, max, count = 10, rounding = 0 } = {}) {
  const type = String(fieldType || '').toLowerCase();
  const date = type === 'date' || type === 'year';
  const low = date ? yearOf(min) : Number(min);
  const high = date ? yearOf(max) : Number(max);
  const intervals = Math.floor(Number(count));
  const round = Number(rounding) || 0;
  if (!Number.isFinite(low) || !Number.isFinite(high) || !(intervals > 0) || low > high) return [];

  // dates are whole years; their rounding is a multiple of years
  const integer = date || type === 'integer';
  const multiple = round >= 10 ? round : 0;
  const roundValue = (value) => {
    if (multiple) return Math.round(value / multiple) * multiple;
    if (integer) return Math.round(value);
    if (type === 'float') return round === 0 ? Math.round(value) : Number(value.toFixed(round));
    return value;
  };

  let step = (high - low) / intervals;
  if (integer) step = Math.max(1, Math.round(step));
  if (multiple && multiple >= high) return [{ min: low, max: high }];
  if (multiple && multiple > step) step = multiple;

  const ranges = [];
  let from = low;
  while (from < high && ranges.length < intervals) {
    let to = from + step > high ? high : from + step;
    if (ranges.length === intervals - 1 && to !== high) to = high;
    else to = roundValue(to);
    ranges.push({ min: roundValue(from), max: to });
    if (to <= from) break;
    from = to;
  }
  if (!ranges.length) ranges.push({ min: low, max: high });
  return ranges;
}

/**
 * Category ranges, one per value (enum terms, texts), in order, without duplicates.
 *
 * @param {Array<*>} values Values (term ids, texts) or items `{value}`.
 * @returns {Array<{value: string}>} Ranges.
 */
export function categoryRanges(values) {
  const seen = new Set();
  const ranges = [];
  for (const item of Array.isArray(values) ? values : []) {
    const value = String(item && typeof item === 'object' ? item.value ?? '' : item ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    ranges.push({ value });
  }
  return ranges;
}

/**
 * The year of a date value (`1850`, `1850-07-01`, `-500`, a decimal year).
 *
 * @param {*} value Date value.
 * @returns {number} The year (may be fractional for decimal years), NaN when unknown.
 */
export function yearOf(value) {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim();
  const match = /^(-?\d+(?:\.\d+)?)/.exec(text);
  return match ? Number(match[1]) : NaN;
}

/** Whether a value falls inclusively between `min` and `max`, numerically or as text. */
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

/** Whether two values are equal, numerically when both are numbers, otherwise as text. */
function valuesEqual(left, right) {
  const leftNumber = toFiniteNumber(left);
  const rightNumber = toFiniteNumber(right);
  if (leftNumber != null && rightNumber != null) return leftNumber === rightNumber;
  return scalarText(left) === scalarText(right);
}

/** A finite number for a plain numeric scalar, otherwise null. */
function toFiniteNumber(value) {
  if (value == null || value === '' || typeof value === 'boolean' || typeof value === 'object') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** The text of a scalar, null for objects and empty values. */
function scalarText(value) {
  if (value == null || typeof value === 'object') return null;
  return String(value);
}
