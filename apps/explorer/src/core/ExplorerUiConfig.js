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

// panes: buttons and tabs in the panes they act on (2026-10-13, plan 16; named
// 'compact' until 2026-10-14, still read)
const TOOLBAR_POSITIONS = ['vertical', 'horizontal', 'panes'];
const BUTTON_SIZES = ['small', 'small-caption', 'large', 'large-caption'];
const REGIONS = ['north', 'west', 'center', 'east', 'south'];
/** Presentation modules (iframe or direct apps). */
export const PRESENTATION_TYPES = ['data', 'map', 'graph', 'timeline', 'recordview'];
/** Tools placed in panes like the presentations (2026-10-14, plan 16 Part 2). */
export const TOOL_TYPES = ['report', 'crosstabs', 'actions', 'export', 'publish'];
/** Everything that can be placed in a pane. */
export const MODULE_TYPES = [...PRESENTATION_TYPES, ...TOOL_TYPES];
/** The configuration's bucket for modules not shown at all; Result can not go there. */
export const UNUSED_REGION = 'unused';
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

/**
 * Apply persisted module-to-pane assignments to normalized layout definitions.
 * Modules placed in Unused are left out.
 */
export function applyUiRegions(definitions, value) {
  const regions = value?.regions || {};
  return (Array.isArray(definitions) ? definitions : [])
    .map((definition) => ({ ...definition, region: regions[definition.type] || definition.region }))
    .filter((definition) => definition.region !== UNUSED_REGION);
}

/**
 * Whether a module type is placed in a pane (not in Unused).
 *
 * @param {object} value Configuration value; see `ExplorerUiConfig.load()`.
 * @param {string} type Module type.
 * @returns {boolean}
 */
export function isModuleUsed(value, type) {
  return REGIONS.includes(value?.regions?.[type]);
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
    if (REGIONS.includes(region) && !leading.has(region)) leading.set(region, type);
  }
  return leading;
}

/**
 * Module types in toolbar order: pane by pane (north, west, center, east, south),
 * and within a pane in the configured order. Modules in Unused are left out.
 *
 * @param {object} value Configuration value; see `ExplorerUiConfig.load()`.
 * @returns {Array<string>} Module types.
 */
export function moduleTypesInOrder(value) {
  const regions = value?.regions || {};
  const order = Array.isArray(value?.order) ? value.order : defaults().order;
  const paneIndex = (type) => REGIONS.indexOf(regions[type]);
  return order.filter((type) => paneIndex(type) >= 0)
    .sort((a, b) => paneIndex(a) - paneIndex(b) || order.indexOf(a) - order.indexOf(b));
}

/** Build a fresh copy of the default configuration. */
function defaults() {
  return {
    version: 1,
    // toolbar rails on top (decided 2026-10-01), large icons with captions (2026-10-03)
    toolbar: { position: 'horizontal', buttonSize: 'large-caption' },
    // Result west; Record View, Map, Graph center (2026-10-04); the tools center after
    // Graph (2026-10-14)
    regions: {
      data: 'west', map: 'center', graph: 'center', timeline: 'south', recordview: 'center',
      report: 'center', crosstabs: 'center', actions: 'center', export: 'center', publish: 'center'
    },
    // module order within a pane: the first module of an expanded pane is shown at start
    order: ['data', 'recordview', 'map', 'graph', 'report', 'crosstabs', 'actions', 'export', 'publish', 'timeline'],
    // panes expanded when Explorer starts; the others start hidden (opened from the toolbar)
    panes: { north: false, west: true, center: true, east: false, south: false },
    // toolbar lists (Filters, Entities, Sources; Favorites, History, Workspace since
    // 2026-10-06): docked in the West pane or popup (2026-10-04)
    lists: 'docked',
    // interface language for Explorer and every module; auto = the host's language
    language: 'auto',
    // "Interface for dummies (v7 like)": fixed toolbar and layout, fewer buttons; the
    // other settings above are kept for when it is switched off (2026-10-14)
    isSimplifiedUI: true
  };
}

/** Toolbar, lists and layout of the simplified interface (Artem, 2026-10-14). */
const SIMPLIFIED = {
  toolbar: { position: 'panes', buttonSize: 'small' },
  lists: 'docked',
  regions: {
    data: 'west', recordview: 'center', map: 'center', graph: 'center', report: 'center', export: 'center',
    timeline: 'south', publish: UNUSED_REGION, crosstabs: UNUSED_REGION, actions: UNUSED_REGION
  },
  order: ['data', 'recordview', 'map', 'graph', 'report', 'export', 'timeline', 'publish', 'crosstabs', 'actions']
};

/**
 * The configuration Explorer applies: the saved one, or for the simplified interface
 * (`isSimplifiedUI`) its fixed toolbar, lists and layout over it. The saved value keeps
 * the user's own choices for when the simplified interface is switched off.
 *
 * @param {object} value Normalized configuration; see `ExplorerUiConfig.load()`.
 * @returns {object} The configuration to apply.
 */
export function effectiveUiConfig(value) {
  if (value?.isSimplifiedUI !== true) return value;
  return {
    ...value,
    toolbar: { ...SIMPLIFIED.toolbar },
    lists: SIMPLIFIED.lists,
    regions: { ...SIMPLIFIED.regions },
    order: [...SIMPLIFIED.order],
    panes: { ...defaults().panes }
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
      position: toolbar.position === 'compact' ? 'panes'
        : TOOLBAR_POSITIONS.includes(toolbar.position) ? toolbar.position : fallback.toolbar.position,
      buttonSize: BUTTON_SIZES.includes(toolbar.buttonSize) ? toolbar.buttonSize : fallback.toolbar.buttonSize
    },
    regions: {},
    order: [],
    panes: {},
    lists: LIST_MODES.includes(source.lists) ? source.lists : fallback.lists,
    language: UI_LANGUAGES.includes(source.language) ? source.language : fallback.language,
    isSimplifiedUI: typeof source.isSimplifiedUI === 'boolean' ? source.isSimplifiedUI : fallback.isSimplifiedUI
  };

  for (const type of MODULE_TYPES) {
    // Result always has a pane: a DataSource is shown there (and so not everything is unused)
    const placed = REGIONS.includes(regions[type]) || (regions[type] === UNUSED_REGION && type !== 'data');
    normalized.regions[type] = placed ? regions[type] : fallback.regions[type];
  }
  normalized.order = normalizeOrder(source.order, fallback.order);
  const panes = source.panes && typeof source.panes === 'object' ? source.panes : {};
  for (const region of REGIONS) {
    normalized.panes[region] = typeof panes[region] === 'boolean' ? panes[region] : fallback.panes[region];
  }

  return normalized;
}

/**
 * Known module types once each, in the saved order. A missing type goes after its
 * predecessor in the default order (the tools of an older configuration after Graph).
 */
function normalizeOrder(saved, fallback) {
  const order = [...new Set(Array.isArray(saved) ? saved.filter((type) => MODULE_TYPES.includes(type)) : [])];
  for (const [index, type] of fallback.entries()) {
    if (order.includes(type)) continue;
    const previous = fallback.slice(0, index).findLast((other) => order.includes(other));
    order.splice(previous ? order.indexOf(previous) + 1 : 0, 0, type);
  }
  return order;
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
