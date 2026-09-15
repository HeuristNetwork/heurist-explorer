/**
 * @file configurationUtils.js
 * @brief Shared persisted-configuration envelope and value helpers.
 *
 * The format string and available configuration-dialog modes are per-module
 * concerns and stay in each consuming module; this file only knows the
 * generic envelope shape and the primitive normalizers reused across module
 * configuration schemas (heurist-map/data/graph).
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

/** Current version of the persisted-configuration envelope shape. */
export const CONFIGURATION_VERSION = 1;

/**
 * Produce a versioned JSON-safe settings envelope tagged with the caller's format string.
 *
 * @param {*} value Raw settings value to normalize.
 * @param {Function} normalizeSettings Module-specific normalizer; returns `{options, config}`.
 * @param {string} format Module-specific format tag stamped on the envelope.
 * @param {number} [version=CONFIGURATION_VERSION] Envelope version to stamp.
 * @returns {{format: string, version: number, options: object, config: object}} Serializable settings envelope.
 */
export function serializeConfigurationSettings(value, normalizeSettings, format, version = CONFIGURATION_VERSION) {
  const normalized = normalizeSettings(value);
  return {
    format,
    version,
    options: normalized.options,
    config: normalized.config
  };
}

/**
 * Return the value as a plain object, or an empty object when it isn't one.
 *
 * @param {*} value Value to unwrap.
 * @returns {object} `value` itself when it is a plain object, otherwise `{}`.
 */
export function unwrapSettings(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * Normalize a loosely-typed boolean (`true`/`false`, `1`/`0`, `'true'`/`'false'`).
 *
 * @param {*} value Value to normalize.
 * @param {boolean} fallback Value to return when `value` isn't recognized as boolean-like.
 * @returns {boolean} Normalized boolean, or `fallback`.
 */
export function boolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

/**
 * Restrict a value to one of an allowed set, otherwise returning a fallback.
 *
 * @param {*} value Value to check.
 * @param {Array<*>} allowed Allowed values.
 * @param {*} fallback Value to return when `value` is not in `allowed`.
 * @returns {*} `value` when allowed, otherwise `fallback`.
 */
export function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

/**
 * Return the value when it is a string, otherwise a fallback.
 *
 * @param {*} value Value to check.
 * @param {*} fallback Value to return when `value` is not a string.
 * @returns {string|*} `value` when it is a string, otherwise `fallback`.
 */
export function stringValue(value, fallback) {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Normalize an optional string value, treating `null`/`undefined`/`''` as `null`.
 *
 * @param {*} value Value to normalize.
 * @returns {string|null} String value, or `null` when empty.
 */
export function nullableString(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

/**
 * Clamp a numeric value to `[min, max]`, falling back when it isn't finite.
 *
 * @param {*} value Value to normalize.
 * @param {number} fallback Value to return when `value` is not a finite number.
 * @param {number} min Minimum allowed value.
 * @param {number} max Maximum allowed value.
 * @returns {number} Clamped number, or `fallback`.
 */
export function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/**
 * A persisted identifier: a positive-integer id (numeric:true), an opaque string id, or 'dynamic' when allowDynamic.
 *
 * @param {*} value Value to normalize.
 * @param {{numeric?: boolean, allowDynamic?: boolean}} [options] Normalization options.
 * @returns {number|string|null} Normalized identifier, or `null` when empty or invalid.
 */
export function nullableIdentifier(value, { numeric = false, allowDynamic = false } = {}) {
  if (value === null || value === undefined || value === '') return null;
  if (allowDynamic && String(value) === 'dynamic') return 'dynamic';
  if (!numeric) return String(value);
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/**
 * Normalize a list of persisted identifiers, dropping invalid or duplicate entries.
 *
 * @param {*} value Value to normalize; must be an array to produce a result.
 * @param {{numeric?: boolean}} [options] Normalization options, forwarded to `nullableIdentifier`.
 * @returns {Array<number|string>|null} Normalized, de-duplicated identifier list, or `null` when empty or not an array.
 */
export function nullableList(value, { numeric = false } = {}) {
  if (value === null || value === undefined || value === '') return null;
  if (!Array.isArray(value)) return null;

  const result = [];
  for (const item of value) {
    const normalized = nullableIdentifier(item, { numeric });
    if (normalized !== null && !result.includes(normalized)) result.push(normalized);
  }

  return result;
}
