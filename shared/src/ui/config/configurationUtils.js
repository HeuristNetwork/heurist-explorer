/**
 * configurationUtils.js - Shared persisted-configuration envelope and value helpers
 *
 * The format string and available configuration-dialog modes are per-module
 * concerns and stay in each consuming module; this file only knows the
 * generic envelope shape and the primitive normalizers reused across module
 * configuration schemas (heurist-map/data/graph).
 *
 * @project     Heurist academic knowledge management system
 * @package     client-core.ui.config
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @author      Artem Osmakov <osmakov@gmail.com>
 */

export const CONFIGURATION_VERSION = 1;

/** Produce a versioned JSON-safe settings envelope tagged with the caller's format string. */
export function serializeConfigurationSettings(value, normalizeSettings, format, version = CONFIGURATION_VERSION) {
  const normalized = normalizeSettings(value);
  return {
    format,
    version,
    options: normalized.options,
    config: normalized.config
  };
}

export function unwrapSettings(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function boolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

export function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function stringValue(value, fallback) {
  return typeof value === 'string' ? value : fallback;
}

export function nullableString(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

export function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/** A persisted identifier: a positive-integer id (numeric:true), an opaque string id, or 'dynamic' when allowDynamic. */
export function nullableIdentifier(value, { numeric = false, allowDynamic = false } = {}) {
  if (value === null || value === undefined || value === '') return null;
  if (allowDynamic && String(value) === 'dynamic') return 'dynamic';
  if (!numeric) return String(value);
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

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
