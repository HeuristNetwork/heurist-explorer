/**
 * @file publishedView.js
 * @brief Explorer on a published page (plan 27b §11.3): the configuration it applies (no
 *        toolbars, no tools), the HFilter settings of the page, and storage kept in memory
 *        (no Favorites, History or Workspace in the visitor's browser).
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

import { TOOL_TYPES, UNUSED_REGION } from './ExplorerUiConfig.js';

/** Presentation of the filter list in HFilter. */
export const FILTER_MODES = ['buttons', 'list', 'select'];
/** Pane of HFilter: West only (2026-10-29). */
export const FILTER_PLACEMENTS = ['west'];
/** Kinds of a published filter item: saved filter, query source, the query of publication time. */
const ITEM_KINDS = ['filter', 'source', 'query'];

/**
 * The configuration a published Explorer applies: the author's layout and language, without
 * toolbars (the rails are hidden), without the tools and without docked lists; never the
 * simplified interface (its Query Source editor is not on the page).
 *
 * @param {object} value The configuration of the page (`ExplorerUiConfig` value).
 * @returns {object}
 */
export function publishedUiConfig(value = {}) {
  const regions = { ...(value.regions || {}) };
  for (const type of TOOL_TYPES) regions[type] = UNUSED_REGION;
  return {
    ...value,
    toolbar: { ...(value.toolbar || {}), position: 'vertical' },
    lists: 'popup',
    isSimplifiedUI: false,
    regions
  };
}

/**
 * Settings of a module on a published page: no Help, Options and Publish buttons (the
 * persisted settings envelope of every module, plan 29: `options.ui`).
 *
 * @param {object} [settings] Module settings.
 * @returns {object}
 */
export function publishedModuleSettings(settings = {}) {
  const value = settings && typeof settings === 'object' ? settings : {};
  const options = value.options && typeof value.options === 'object' ? value.options : {};
  return {
    ...value,
    options: { ...options, ui: { ...(options.ui || {}), showHelp: false, showOptions: false, showPublish: false } }
  };
}

/**
 * The HFilter settings of a page (`settings.filter`), normalized. Items are references (the
 * latest version is read when the page opens); the query of publication time keeps its request
 * and presentation (columns, geo and time fields).
 *
 * @param {object|null} value `{items, active, mode, placement}`.
 * @returns {{items: Array<{key: string, kind: string, id?: number, title: string, request?: object, presentation?: object}>,
 *   active: string|null, mode: string, placement: string}}
 */
export function normalizePublishedFilter(value = null) {
  const source = value && typeof value === 'object' ? value : {};
  const items = [];
  for (const item of Array.isArray(source.items) ? source.items : []) {
    const kind = ITEM_KINDS.includes(item?.kind) ? item.kind : null;
    if (!kind) continue;
    const id = Number(item.id);
    if (kind !== 'query' && !(id > 0)) continue;
    if (kind === 'query' && !item.request?.q) continue;
    const key = itemKey(kind, id);
    if (items.some((other) => other.key === key)) continue;
    items.push({
      key,
      kind,
      ...(kind === 'query' ? { request: structuredClone(item.request), ...queryPresentation(item) } : { id }),
      title: String(item.title || '')
    });
  }
  const active = items.some((item) => item.key === source.active) ? source.active : null;
  return {
    items,
    active,
    mode: FILTER_MODES.includes(source.mode) ? source.mode : 'buttons',
    placement: FILTER_PLACEMENTS.includes(source.placement) ? source.placement : 'west'
  };
}

/** `{presentation}` of a query item when it has one. */
function queryPresentation(item) {
  const presentation = item.presentation;
  return presentation && typeof presentation === 'object' && !Array.isArray(presentation)
    ? { presentation: structuredClone(presentation) } : {};
}

/**
 * Key of a filter item in the form and the page: `filter:12`, `source:34`, `current`.
 *
 * @param {string} kind `filter`, `source` or `query`.
 * @param {number} [id] Saved filter / query source id.
 * @returns {string}
 */
export function itemKey(kind, id) {
  return kind === 'query' ? 'current' : `${kind}:${Number(id)}`;
}

/**
 * Storage that lives as long as the page (a published Explorer writes nothing to the
 * visitor's browser).
 *
 * @returns {Storage}
 */
export function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; }
  };
}
