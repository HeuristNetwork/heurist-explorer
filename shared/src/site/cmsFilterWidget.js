/**
 * @file cmsFilterWidget.js
 * @brief The Filter widget of a website page (plan 27l §3): its settings and the DataSource of each of its items.
 *
 * Settings `{items: [{kind: 'source'|'filter', id, title}], active: '<kind>:<id>'|null, mode: 'buttons'|'list'|'select'}`
 * (the item format of the published Explorer filter, without the current query). Items are references: the latest
 * version of a query source (`/records/querysource/{id}`) or saved filter (`/sys/filter/{id}`, legacy kinds converted)
 * is read when the visitor chooses it, with the visitor's rights.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-client-core
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { QuerySource } from '../data/QuerySource.js';
import { QuerySourceProvider } from '../data/QuerySourceProvider.js';
import { savedFilterDataSource, savedFilterRecord } from '../data/savedFilters.js';
import { cmsFilterRequest } from './cmsSavedFilter.js';
import { valueInLanguage } from '../data/recordEditValues.js';

/** Presentations of the list (HFilter). */
export const CMS_FILTER_WIDGET_MODES = Object.freeze(['buttons', 'list', 'select']);

/** Owner group of the saved filters a website may use ("Website filters", as the published Explorer). */
export const CMS_WEBSITE_FILTERS_GROUP = 4;

/** Kinds of items: query source, saved filter. */
export const CMS_FILTER_ITEM_KINDS = Object.freeze(['source', 'filter']);

/**
 * Key of an item: `source:12`, `filter:34`.
 *
 * @param {string} kind
 * @param {number|string} id
 * @returns {string}
 */
export function cmsFilterItemKey(kind, id) {
  return `${kind}:${Number(id)}`;
}

/**
 * The captions of filter items (the published Explorer and the Filter widget of a website page, 2026-11-14 / 2026-11-16):
 * a query source shows its name (DT_NAME) in the language of the page, from its translations (`fre:...`); a saved
 * filter keeps its stored title (no translations yet).
 *
 * @param {Array<{kind: string, id?: number, title?: string}>} items
 * @param {(id: number) => string[]|undefined} names The DT_NAME values of a query source (translations included).
 * @param {string} language Language of the page (3 letters).
 * @returns {Array<object>} The items, with `title` replaced where a name is known.
 */
export function filterItemCaptions(items, names, language) {
  return (items || []).map((item) => {
    if (item?.kind !== 'source') return item;
    const name = valueInLanguage(names(Number(item.id)) || [], language);
    return name ? { ...item, title: name } : item;
  });
}

/**
 * The names (DT_NAME with its translations) of query sources, read with the rights of the visitor.
 *
 * @param {object} apiClient HeuristApiClient.
 * @param {number[]} ids Query source record ids.
 * @param {number} nameField Local id of DT_NAME (0: nothing is read).
 * @returns {Promise<Map<number, string[]>>}
 */
export async function querySourceNames(apiClient, ids, nameField) {
  const list = [...new Set((ids || []).map(Number).filter((id) => id > 0))];
  const result = new Map();
  if (!list.length || !(Number(nameField) > 0) || !apiClient) return result;
  const payload = await apiClient.get('/records/', {
    query: { q: [{ ids: list.join(',') }], fields: `rec_ID,${Number(nameField)}`, limit: list.length }
  });
  for (const row of (Array.isArray(payload) ? payload : payload?.records || payload?.items || [])) {
    const values = row?.details?.[nameField] ?? row?.details?.[String(nameField)];
    result.set(Number(row?.rec_ID ?? row?.id), (Array.isArray(values) ? values : values == null ? [] : [values])
      .map((value) => String(value && typeof value === 'object' ? value.value ?? '' : value)).filter(Boolean));
  }
  return result;
}

/**
 * The settings normalized: known kinds with an id, no duplicates; `active` one of the items, else null.
 *
 * @param {object|null} value
 * @returns {{items: Array<{key: string, kind: string, id: number, title: string}>, active: string|null, mode: string}}
 */
export function cmsFilterWidgetSettings(value = null) {
  const source = value && typeof value === 'object' ? value : {};
  const items = [];
  for (const item of Array.isArray(source.items) ? source.items : []) {
    const id = Number(item?.id);
    if (!CMS_FILTER_ITEM_KINDS.includes(item?.kind) || !Number.isInteger(id) || id < 1) continue;
    const key = cmsFilterItemKey(item.kind, id);
    if (items.some((other) => other.key === key)) continue;
    items.push({ key, kind: item.kind, id, title: String(item.title || `#${id}`) });
  }
  return {
    items,
    active: items.some((item) => item.key === source.active) ? source.active : null,
    mode: CMS_FILTER_WIDGET_MODES.includes(source.mode) ? source.mode : 'buttons'
  };
}

/**
 * The stored settings (keys of the items left out: they follow from kind and id).
 *
 * @param {object} value
 * @returns {{items: Array<{kind: string, id: number, title: string}>, active?: string, mode: string}}
 */
export function storedCmsFilterWidget(value) {
  const settings = cmsFilterWidgetSettings(value);
  return {
    items: settings.items.map(({ kind, id, title }) => ({ kind, id, title })),
    ...(settings.active ? { active: settings.active } : {}),
    mode: settings.mode
  };
}

/**
 * The DataSource of an item, its parameters (`$NAME$`) kept for the Filter Form; null when it can not be read.
 *
 * @param {{kind: string, id: number, title?: string}} item
 * @param {object} options
 * @param {object} options.apiClient HeuristApiClient.
 * @param {object|null} [options.legacyConverter] LegacySavedFilterConverter (saved filters of every stored kind).
 * @returns {Promise<object|null>}
 */
export async function resolveCmsFilterItem(item, { apiClient, legacyConverter = null }) {
  if (item?.kind === 'source') {
    const payload = await new QuerySourceProvider({ apiClient }).load(item.id);
    return cmsFilterRequest(new QuerySource(payload?.querySource || payload), {}).raw;
  }
  if (item?.kind === 'filter') {
    const value = await apiClient.get(`/sys/filter/${Number(item.id)}`);
    return savedFilterDataSource(savedFilterRecord(value?.record ?? value), { legacyConverter, origin: 'page-filter' });
  }
  return null;
}
