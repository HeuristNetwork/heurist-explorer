/**
 * @file queryChoices.js
 * @brief The one list of query choices (review 7 of plan 27q2, docs/development/query-choice-picker.md): the query
 *        sources and the saved filters a user (or a visitor of a website) may choose, by their names, for the one picker
 *        (HValuePicker in querySourceChooser.js or an enum field). No DOM.
 *
 *   const choices = await listQueryChoices({ apiClient, dbdefs, scope: 'website' });
 *   const items = queryChoiceItems(choices, { parameters: 'without' });   // picker items, [filter] [parametrized]
 *   const { query, filterForm } = await queryChoiceDefinition(choice, { apiClient, dbdefs });
 *
 * Scopes: `user` — every query source the user can read and the saved filters of `ownerIds` (Explorer: ownerScope;
 * none: what the server permits); `website` — public query sources and the saved filters of "Website filters" (group 4),
 * which visitors can read.
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

import { listQuerySources } from './querySourceList.js';
import { hasQueryParameters } from './queryParameters.js';
import { savedFilterRecord } from './savedFilters.js';
import { LegacySavedFilterConverter } from './legacy/LegacySavedFilterConverter.js';
import { CMS_WEBSITE_FILTERS_GROUP, resolveCmsFilterItem } from '../site/cmsFilterWidget.js';

/** Marks of a picker item (translated by the picker). */
export const QUERY_CHOICE_MARKS = Object.freeze({ filter: 'filter', parameterized: 'parametrized' });

/**
 * @typedef {object} QueryChoice
 * @property {string} value `source:<id>` or `filter:<id>`.
 * @property {'source'|'filter'} kind
 * @property {number} id Record id (query source) or saved filter id.
 * @property {string} label The name (DT_NAME of a query source, the name of a saved filter).
 * @property {boolean} parameterized Parameters (`$NAME$`) or facets: needs a Filter Form.
 * @property {*} [query] The query of a query source (a saved filter: read by queryChoiceDefinition).
 * @property {object|null} [filterForm] The Filter Form of a query source.
 */

/**
 * The query sources and saved filters of a scope, sorted by name (both kinds mixed: the mark tells them apart).
 *
 * @param {object} options
 * @param {object} options.apiClient HeuristApiClient.
 * @param {object} [options.dbdefs] HDbDefs (field ids of a query source).
 * @param {'user'|'website'} [options.scope='user']
 * @param {Array<number>|function(): Array<number>|null} [options.ownerIds] Owners of the saved filters (`user`).
 * @returns {Promise<Array<QueryChoice>>}
 */
export async function listQueryChoices({ apiClient, dbdefs = null, scope = 'user', ownerIds = null } = {}) {
  const website = scope === 'website';
  const owners = website ? [CMS_WEBSITE_FILTERS_GROUP] : (typeof ownerIds === 'function' ? ownerIds() : ownerIds);
  const [sources, filters] = await Promise.all([
    listQuerySources({ apiClient, dbdefs, publicOnly: website }),
    // no saved filters (an older server, no rights): the query sources alone
    listSavedFilters(apiClient, owners).catch(() => [])
  ]);
  const choices = [
    ...sources.map((item) => ({
      value: `source:${item.id}`, kind: 'source', id: item.id, label: item.title, parameterized: Boolean(item.parameterized),
      query: item.query, filterForm: item.filterForm || null
    })),
    ...filters.map((item) => ({ value: `filter:${item.id}`, kind: 'filter', ...item }))
  ];
  return choices.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The saved filters of owners (`/sys`, filter and faceted ones), by their names.
 *
 * @param {object} apiClient
 * @param {Array<number>|null} owners Owner groups; null: what the server permits.
 * @returns {Promise<Array<{id: number, label: string, parameterized: boolean}>>}
 */
async function listSavedFilters(apiClient, owners) {
  const q = { t: 'filter', filterType: ['filter', 'faceted'] };
  const list = Array.isArray(owners) ? [...new Set(owners.map(Number).filter((id) => Number.isInteger(id) && id >= 0))] : null;
  if (list?.length) q.owner = list.join(',');
  const payload = await apiClient.get('/sys', { query: { q, fields: 'query,filterType,owner' } });
  const records = Array.isArray(payload) ? payload : payload?.items || payload?.filters || payload?.records || [];
  return records.map(savedFilterRecord).filter(Boolean).map(({ id, title, query, definition }) => ({
    id,
    label: String(title || '').replace(/<[^>]*>/g, '').trim() || `#${id}`,
    // a faceted search, or $NAME$ in the query (plan 27l §11.3)
    parameterized: Boolean(definition?.facets) || hasQueryParameters(definition?.q ?? definition?.query ?? query)
  }));
}

/**
 * The items of the picker: `[filter]` and `[parametrized]` marks; where a query can have no parameters
 * (`parameters: 'without'`, a query field without a Filter Form) the parameterized ones are shown disabled.
 *
 * @param {Array<QueryChoice>} choices
 * @param {object} [options]
 * @param {'any'|'without'} [options.parameters='any']
 * @param {Array<{value: string, label: string}>} [options.first] Fixed items above the list (Current result).
 * @returns {Array<{value: string, label: string, marks: string[], disabled?: boolean, title?: string, choice: object}>}
 */
export function queryChoiceItems(choices = [], { parameters = 'any', first = [] } = {}) {
  const fixed = first.map((item) => ({ value: item.value, label: item.label, marks: [], group: 'first', choice: item }));
  const listed = (choices || []).map((choice) => {
    const disabled = parameters === 'without' && choice.parameterized;
    return {
      value: choice.value,
      label: choice.label,
      marks: [...(choice.kind === 'filter' ? [QUERY_CHOICE_MARKS.filter] : []),
        ...(choice.parameterized ? [QUERY_CHOICE_MARKS.parameterized] : [])],
      ...(disabled ? { disabled: true, title: 'Needs a Filter Form for its parameters: not possible here' } : {}),
      group: 'list',
      choice
    };
  });
  return [...fixed, ...listed];
}

/** The search row of a picker of query choices from more than this number of entries (rule e of review 7). */
export const QUERY_CHOICE_FILTER_THRESHOLD = 10;

/**
 * The terms of an enum field of query choices (HEditForm select: HValueCombo / HValuePicker), with the marks; `keys`
 * maps a choice to the stored id (default its value `source:<id>` / `filter:<id>`).
 *
 * @param {Array<QueryChoice>} choices
 * @param {object} [options] `parameters` as queryChoiceItems.
 * @returns {Array<{id: string, label: string, marks: string[], disabled?: boolean, title?: string}>}
 */
export function queryChoiceTerms(choices = [], options = {}) {
  return queryChoiceItems(choices, options).map(({ value, label, marks, disabled, title }) => ({
    id: value, label, marks, ...(disabled ? { disabled: true, title } : {})
  }));
}

/**
 * The query and Filter Form of a choice (copied by value into a query field): a query source has them already; a saved
 * filter is read and converted (every stored kind, facets become its Filter Form).
 *
 * @param {QueryChoice} choice
 * @param {{apiClient: object, dbdefs?: object}} options
 * @returns {Promise<{query: *, filterForm: object|null}|null>} Null when it has no query.
 */
export async function queryChoiceDefinition(choice, { apiClient, dbdefs = null }) {
  if (!choice) return null;
  if (choice.kind !== 'filter') return { query: choice.query ?? null, filterForm: choice.filterForm || null };
  const dataSource = await resolveCmsFilterItem({ kind: 'filter', id: choice.id }, {
    apiClient, legacyConverter: new LegacySavedFilterConverter({ getDbDefs: async () => dbdefs })
  });
  if (!dataSource?.request?.q) return null;
  return { query: dataSource.request.q, filterForm: dataSource.presentation?.filterForm || null };
}

/**
 * A choice by its value (`source:<id>` / `filter:<id>`), from a list.
 *
 * @param {Array<QueryChoice>} choices
 * @param {string} value
 * @returns {QueryChoice|null}
 */
export function findQueryChoice(choices, value) {
  return (choices || []).find((choice) => choice.value === String(value ?? '')) || null;
}
