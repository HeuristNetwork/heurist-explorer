/**
 * @file configurationUtils.js
 * @brief Map-specific configuration constants and value helpers.
 *
 * The generic envelope helpers and primitive normalizers shared with
 * heurist-data and heurist-graph live in `#shared/ui`. This file
 * only keeps heurist-map's own format/mode constants and the geo/zoom helpers
 * that have no equivalent in the other modules.
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

import { serializeConfigurationSettings as serializeSettings } from '#shared/ui';

export {
  CONFIGURATION_VERSION,
  unwrapSettings,
  boolean,
  enumValue,
  stringValue,
  nullableString,
  boundedNumber,
  nullableIdentifier,
  nullableList
} from '#shared/ui';

/** Format identifier stamped on every serialized map configuration envelope. */
export const CONFIGURATION_FORMAT = 'heurist-map-settings';

/** Supported map configuration dialog modes. */
export const CONFIGURATION_MODES = Object.freeze(['preferences', 'website', 'publish']);

/**
 * Produce a versioned JSON-safe settings envelope tagged with the map's format string.
 *
 * @param {object} [value] Raw settings object.
 * @param {Function} [normalizeSettings] Normalizer applied to `value` before serialization.
 * @returns {object} Versioned settings envelope.
 */
export function serializeConfigurationSettings(value = {}, normalizeSettings = (item) => item) {
  return serializeSettings(value, normalizeSettings, CONFIGURATION_FORMAT);
}

/**
 * Coerce a value to a finite number, or `null` when it is empty/non-numeric.
 *
 * @param {*} value Candidate value.
 * @returns {number|null} The finite number, or `null`.
 */
export function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Coerce a value to a positive finite number, or `null` when it is not one.
 *
 * @param {*} value Candidate value.
 * @returns {number|null} The positive number, or `null`.
 */
export function nullablePositiveNumber(value) {
  const number = nullableNumber(value);
  return number !== null && number > 0 ? number : null;
}

/**
 * Coerce a value to a valid zoom level (`0`-`22`), or `null` when it is not one.
 *
 * @param {*} value Candidate value.
 * @returns {number|null} The zoom level, or `null`.
 */
export function nullableZoom(value) {
  const number = nullableNumber(value);
  return number !== null && number >= 0 && number <= 22 ? number : null;
}

/**
 * Coerce a value to one of the supported feature-limit presets, or `fallback` otherwise.
 *
 * @param {*} value Candidate value.
 * @param {number} fallback Value used when `value` is not a supported preset.
 * @returns {number} A supported feature limit, or `fallback`.
 */
export function allowedFeatureLimit(value, fallback) {
  const number = Number(value);
  return [500, 1000, 2000, 5000].includes(number) ? number : fallback;
}

/**
 * Normalize a raw bounds object, requiring all four sides to be finite numbers.
 *
 * @param {object} value Raw bounds object.
 * @returns {{west: number, south: number, east: number, north: number}|null}
 *          Normalized bounds, or `null` when any side is missing/non-numeric.
 */
export function normalizeBounds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const west = nullableNumber(value.west);
  const south = nullableNumber(value.south);
  const east = nullableNumber(value.east);
  const north = nullableNumber(value.north);
  if ([west, south, east, north].some((item) => item === null)) return null;
  return { west, south, east, north };
}

/**
 * Normalize a value (object, or JSON string) to a plain JSON object, or `null` when invalid.
 *
 * @param {*} value Raw object or JSON string.
 * @returns {object|null} The parsed/cloned object, or `null` when empty/unparseable.
 */
export function nullableJsonObject(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return clone(value);
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Deep-clone a value via JSON round-trip.
 *
 * @param {*} value Candidate value.
 * @returns {*} The cloned value, or `value` itself when nullish.
 */
function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
