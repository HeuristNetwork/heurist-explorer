/**
 * configurationUtils.js - Map-specific configuration constants and value helpers
 *
 * The generic envelope helpers and primitive normalizers shared with
 * heurist-data and heurist-graph live in `#shared/ui`. This file
 * only keeps heurist-map's own format/mode constants and the geo/zoom helpers
 * that have no equivalent in the other modules.
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
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

export const CONFIGURATION_FORMAT = 'heurist-map-settings';
export const CONFIGURATION_MODES = Object.freeze(['preferences', 'website', 'publish']);

/** Produce a versioned JSON-safe settings envelope tagged with the map's format string. */
export function serializeConfigurationSettings(value = {}, normalizeSettings = (item) => item) {
  return serializeSettings(value, normalizeSettings, CONFIGURATION_FORMAT);
}

export function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function nullablePositiveNumber(value) {
  const number = nullableNumber(value);
  return number !== null && number > 0 ? number : null;
}

export function nullableZoom(value) {
  const number = nullableNumber(value);
  return number !== null && number >= 0 && number <= 22 ? number : null;
}

export function allowedFeatureLimit(value, fallback) {
  const number = Number(value);
  return [500, 1000, 2000, 5000].includes(number) ? number : fallback;
}

export function normalizeBounds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const west = nullableNumber(value.west);
  const south = nullableNumber(value.south);
  const east = nullableNumber(value.east);
  const north = nullableNumber(value.north);
  if ([west, south, east, north].some((item) => item === null)) return null;
  return { west, south, east, north };
}

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

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
