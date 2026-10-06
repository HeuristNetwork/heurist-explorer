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
const LIST_MODES = ['docked', 'popup'];
/** Interface languages; `auto` follows the language given by the host (Heurist preferences). */
export const UI_LANGUAGES = ['auto', 'eng', 'fre', 'ger', 'por'];

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

/**
 * The interface language to use: the configured one, or the host's language for `auto`.
 *
 * @param {object} value Configuration value; see `ExplorerUiConfig.load()`.
 * @param {string} hostLanguage Language given by the host bootstrap.
 * @returns {string} Three-letter language code.
 */
export function resolveUiLanguage(value, hostLanguage) {
  const language = value?.language;
  return language && language !== 'auto' && UI_LANGUAGES.includes(language) ? language : (hostLanguage || 'eng');
}

/**
 * The module type shown first in each pane: the first type of the configured
 * order assigned to that pane.
 *
 * @param {object} value Configuration value; see `ExplorerUiConfig.load()`.
 * @returns {Map<string, string>} Region → module type.
 */
export function leadingPaneTypes(value) {
  const regions = value?.regions || {};
  const order = Array.isArray(value?.order) ? value.order : defaults().order;
  const leading = new Map();
  for (const type of order) {
    const region = regions[type];
    if (region && !leading.has(region)) leading.set(region, type);
  }
  return leading;
}

/**
 * Module types in toolbar order: pane by pane (north, west, center, east, south),
 * and within a pane in the configured order.
 *
 * @param {object} value Configuration value; see `ExplorerUiConfig.load()`.
 * @returns {Array<string>} Module types.
 */
export function moduleTypesInOrder(value) {
  const regions = value?.regions || {};
  const order = Array.isArray(value?.order) ? value.order : defaults().order;
  const paneIndex = (type) => {
    const index = REGIONS.indexOf(regions[type]);
    return index < 0 ? REGIONS.length : index;
  };
  return [...order].sort((a, b) => paneIndex(a) - paneIndex(b) || order.indexOf(a) - order.indexOf(b));
}

/** Build a fresh copy of the default configuration. */
function defaults() {
  return {
    version: 1,
    // toolbar rails on top (decided 2026-10-01), large icons with captions (2026-10-03)
    toolbar: { position: 'horizontal', buttonSize: 'large-caption' },
    // Result west; Record View, Map, Graph center (2026-10-04)
    regions: { data: 'west', map: 'center', graph: 'center', timeline: 'south', recordview: 'center' },
    // module order within a pane: the first module of an expanded pane is shown at start
    order: ['data', 'recordview', 'map', 'graph', 'timeline'],
    // panes expanded when Explorer starts; the others start hidden (opened from the toolbar)
    panes: { north: false, west: true, center: true, east: false, south: false },
    // toolbar lists (Filters, Entities, Sources; Favorites, History, Workspace since
    // 2026-10-06): docked in the West pane or popup (2026-10-04)
    lists: 'docked',
    // interface language for Explorer and every module; auto = the host's language
    language: 'auto'
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
    regions: {},
    order: [],
    panes: {},
    lists: LIST_MODES.includes(source.lists) ? source.lists : fallback.lists,
    language: UI_LANGUAGES.includes(source.language) ? source.language : fallback.language
  };

  for (const type of REGION_TYPES) {
    normalized.regions[type] = REGIONS.includes(regions[type]) ? regions[type] : fallback.regions[type];
  }
  // known types once each, in the saved order; missing ones follow in default order
  const order = Array.isArray(source.order) ? source.order : [];
  normalized.order = [...new Set([...order.filter((type) => REGION_TYPES.includes(type)), ...fallback.order])];
  const panes = source.panes && typeof source.panes === 'object' ? source.panes : {};
  for (const region of REGIONS) {
    normalized.panes[region] = typeof panes[region] === 'boolean' ? panes[region] : fallback.panes[region];
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
