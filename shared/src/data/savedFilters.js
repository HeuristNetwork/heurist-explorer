/**
 * @file savedFilters.js
 * @brief Saved filters (`/sys/filter/{id}`, legacy usrSavedSearches) as runtime DataSources: Explorer's
 *        SavedFilterManager and the Filter widget / Saved filter action of a website page (plan 27l §3).
 *
 * A stored query may be JSON (`{q, w, rules, rulesonly, filterForm...}`), a legacy URL (`?q=…&rules=…`), a faceted
 * search or plain text: with a `legacyConverter` (shared/src/data/legacy/LegacySavedFilterConverter.js) every kind is
 * converted; without one the JSON / text is used as it is.
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

import { normalizeDataSource } from './DataSource.js';

/**
 * Normalize persisted saved-filter JSON.
 *
 * @param {*} value Raw persisted value: an object, a JSON string, or a bare query string.
 * @returns {object} Normalized definition object; `{q: value}` when `value` isn't valid JSON.
 */
export function parseSavedFilterDefinition(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return clone(value);

  const text = String(value ?? '').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { q: text };
  } catch {
    return { q: text };
  }
}

/**
 * Build an executable records request from a saved-filter definition.
 *
 * @param {object} definition Normalized filter definition.
 * @returns {object} Executable request understood by the records API.
 */
export function executableRequest(definition) {
  const value = definition || {};
  const request = {};
  if (value.q !== undefined) request.q = value.q;
  if (value.query !== undefined && request.q === undefined) request.q = value.query;
  if (value.rules !== undefined && value.rules !== null) request.rules = value.rules;
  if (value.rulesonly !== undefined && value.rulesonly !== null) request.rulesonly = value.rulesonly;
  if (value.w !== undefined && value.w !== null && value.w !== '') request.w = value.w;
  if (value.filter !== undefined && value.filter !== null && value.filter !== '') request.filter = value.filter;
  if (value.sort !== undefined && value.sort !== null && value.sort !== '') request.sort = value.sort;
  return request;
}

/**
 * Whether an executable request has neither a query nor rules to run.
 *
 * @param {object} request Executable request; see {@link executableRequest}.
 * @returns {boolean} True when both `q` and `rules` are empty.
 */
export function isEmptySearchRequest(request) {
  const q = request?.q;
  const qEmpty = q == null || q === '' || (typeof q === 'object' && !Array.isArray(q) && Object.keys(q).length === 0);
  const rulesEmpty = request?.rules == null || request.rules === '' || (Array.isArray(request.rules) && request.rules.length === 0);
  return qEmpty && rulesEmpty;
}

/**
 * Whether a stored filter has expansion rules: a `rules` member of its JSON
 * definition, or a `rules=` parameter of a legacy URL-style query.
 *
 * @param {*} query Stored query (JSON text or legacy URL parameters).
 * @param {object} definition Parsed definition.
 * @returns {boolean} True when rules are present.
 */
export function hasExpansionRules(query, definition) {
  if (nonEmptyRules(definition?.rules)) return true;
  const text = typeof query === 'string' ? query : '';
  const match = /(?:^|[?&])rules=([^&]*)/.exec(text);
  if (!match) return false;
  let value = match[1];
  try { value = decodeURIComponent(value); } catch { /* keep the raw text */ }
  return nonEmptyRules(value);
}

/**
 * The stored query of a saved filter record (`/sys/filter/{id}` in the record format, or an older flat shape).
 *
 * @param {object} value The record.
 * @returns {{id: number, title: string, query: *, definition: object}|null} Null without a valid id.
 */
export function savedFilterRecord(value) {
  const id = positiveId(value?.rec_ID ?? value?.id ?? value?.svs_ID);
  if (!id) return null;
  const query = detailValue(value?.details || {}, 'query') ?? value?.query ?? null;
  return { id, title: String(value?.rec_Title ?? value?.title ?? `Filter ${id}`), query, definition: parseSavedFilterDefinition(query) };
}

/**
 * The DataSource of a saved filter (its parameters `$NAME$` kept: a Filter Form fills them).
 *
 * @param {{id: number, title: string, query: *, definition: object}} filter savedFilterRecord (or the filter of
 *        Explorer's SavedFilterManager).
 * @param {object} [options]
 * @param {object|null} [options.legacyConverter] LegacySavedFilterConverter: converts every stored kind.
 * @param {string} [options.origin='filter'] Tag of the DataSource's metadata.
 * @returns {Promise<object|null>} Null when the request is empty. Conversion warnings in `meta.warnings`.
 * @throws {Error} When the legacy converter reports the filter as unsupported (`error.legacyQuery` is set).
 */
export async function savedFilterDataSource(filter, { legacyConverter = null, origin = 'filter' } = {}) {
  if (!filter) return null;
  let definition = filter.definition;
  const meta = { origin };
  if (legacyConverter) {
    const converted = await legacyConverter.convert(filter.query);
    if (converted.status === 'unsupported') {
      const error = new Error(`${filter.title}: ${converted.warnings.join(' ') || 'legacy, cannot open.'}`);
      error.legacyQuery = converted.legacyQuery;
      throw error;
    }
    definition = converted.definition;
    if (converted.warnings.length) meta.warnings = converted.warnings;
  }

  const request = executableRequest(definition);
  if (isEmptySearchRequest(request)) return null;
  return normalizeDataSource({
    reference: { type: 'filter', id: filter.id },
    title: definition.title || filter.title,
    request,
    presentation: definition.filterForm ? { filterForm: definition.filterForm } : {},
    meta
  });
}

/** @returns {boolean} True for rules that are not empty (`[]`, `""`, `null`). */
function nonEmptyRules(rules) {
  if (rules == null) return false;
  if (Array.isArray(rules)) return rules.length > 0;
  const text = String(rules).trim();
  return text !== '' && text !== '[]' && text !== 'null' && text !== '{}';
}

/** Read the first value of a Heurist `details` field entry, or `null` when absent. */
function detailValue(details, field) {
  const values = details?.[field];
  return Array.isArray(values) && values.length ? values[0]?.value ?? null : null;
}

/** Normalize a value to a positive integer id, or `null` when invalid. */
function positiveId(value) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

/** Deep-clone a JSON-safe value. */
function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
