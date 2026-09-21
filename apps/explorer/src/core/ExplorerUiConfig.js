/**
 * @file ExplorerUiConfig.js
 * @brief Database-scoped persistent Explorer toolbar/layout configuration.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

const TOOLBAR_POSITIONS = ['vertical', 'horizontal'];
const BUTTON_SIZES = ['small', 'small-caption', 'large', 'large-caption'];
const REGION_TYPES = ['data', 'map', 'graph', 'timeline', 'recordview'];
const REGIONS = ['north', 'west', 'center', 'east', 'south'];

/** Database-scoped persistent Explorer toolbar position/size and module-to-region layout. */
export class ExplorerUiConfig {
  /**
   * @param {object} options Store configuration.
   * @param {string} options.database Heurist database name; scopes the storage key.
   * @param {Storage|null} [options.storage] Storage backend; defaults to `localStorage`.
   */
  constructor({ database, storage = null } = {}) {
    this.storage = storage ?? defaultStorage();
    this.storageKey = `heurist.explorer.${storageScope(database)}.uiConfig`;
  }

  /**
   * Read the persisted configuration, filling in defaults for anything missing or invalid.
   *
   * @returns {{version: number, toolbar: {position: string, buttonSize: string}, regions: object}}
   */
  load() {
    return normalize(safeParse(safeGet(this.storage, this.storageKey)));
  }

  /**
   * Normalize and persist a configuration value.
   *
   * @param {object} value Configuration value; see `load()`'s return shape.
   * @returns {object} The normalized, persisted value.
   */
  save(value) {
    const normalized = normalize(value);
    safeSet(this.storage, this.storageKey, JSON.stringify(normalized));
    return normalized;
  }

  /**
   * The built-in configuration defaults.
   *
   * @returns {object}
   */
  static defaults() {
    return defaults();
  }
}

/** Apply persisted module-to-pane assignments to normalized layout definitions. */
export function applyUiRegions(definitions, value) {
  const regions = value?.regions || {};
  return (Array.isArray(definitions) ? definitions : []).map((definition) => ({
    ...definition,
    region: regions[definition.type] || definition.region
  }));
}

/** Build a fresh copy of the default configuration. */
function defaults() {
  return {
    version: 1,
    toolbar: { position: 'vertical', buttonSize: 'small' },
    regions: { data: 'west', map: 'center', graph: 'center', timeline: 'south', recordview: 'east' }
  };
}

/** Normalize a persisted or user-supplied value, filling in defaults for missing/invalid fields. */
function normalize(value) {
  const source = value && typeof value === 'object' ? value : {};
  const fallback = defaults();
  const toolbar = source.toolbar && typeof source.toolbar === 'object' ? source.toolbar : {};
  const regions = source.regions && typeof source.regions === 'object' ? source.regions : {};

  const normalized = {
    version: 1,
    toolbar: {
      position: TOOLBAR_POSITIONS.includes(toolbar.position) ? toolbar.position : fallback.toolbar.position,
      buttonSize: BUTTON_SIZES.includes(toolbar.buttonSize) ? toolbar.buttonSize : fallback.toolbar.buttonSize
    },
    regions: {}
  };

  for (const type of REGION_TYPES) {
    normalized.regions[type] = REGIONS.includes(regions[type]) ? regions[type] : fallback.regions[type];
  }

  return normalized;
}

/** URL-encode a database name for use in a storage key, defaulting to `'default'`. */
function storageScope(value) { return encodeURIComponent(text(value) || 'default'); }

/** Trim a value to text, returning `''` for `null`/`undefined`. */
function text(value) { return value == null ? '' : String(value).trim(); }

/** Parse a JSON object from storage, tolerating missing or invalid data. */
function safeParse(value) { try { return value ? JSON.parse(value) : null; } catch { return null; } }

/** Read a storage key, tolerating an unavailable or throwing storage backend. */
function safeGet(storage, key) { try { return storage?.getItem?.(key) ?? null; } catch { return null; } }

/** Write a storage key, tolerating an unavailable or throwing storage backend. */
function safeSet(storage, key, value) { try { storage?.setItem?.(key, value); } catch { /* storage may be unavailable */ } }

/** Return `localStorage` when accessible, otherwise `null`. */
function defaultStorage() { try { return globalThis.localStorage ?? null; } catch { return null; } }
