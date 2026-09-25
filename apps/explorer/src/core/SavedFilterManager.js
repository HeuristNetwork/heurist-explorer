/**
 * @file SavedFilterManager.js
 * @brief Loads saved-filter definitions and resolves them into runtime DataSources.
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

import { normalizeDataSource } from './DataSource.js';

/** Loads saved-filter definitions and resolves them into runtime DataSources. */
export class SavedFilterManager {
  /**
   * @param {object} options Manager configuration.
   * @param {import('#shared/api').HeuristApiClient} options.apiClient Heurist API client.
   * @param {Array<number|string>|null} [options.filterIds] Restrict loading to these filter record ids.
   * @param {Function|null} [options.classifyFilter] Overrides `simple`/`parametrized` classification for a loaded filter.
   * @param {object|null} [options.legacyConverter] Optional legacy `svs_Query` converter
   *   (`LegacySavedFilterConverter`): `isParameterized(stored)` and async `convert(stored)`.
   */
  constructor({ apiClient, filterIds = null, classifyFilter = null, legacyConverter = null } = {}) {
    if (!apiClient) throw new TypeError('SavedFilterManager requires apiClient');
    this.apiClient = apiClient;
    this.filterIds = normalizeIds(filterIds);
    this.classifyFilter = typeof classifyFilter === 'function' ? classifyFilter : null;
    this.legacyConverter = legacyConverter || null;
    this.filters = [];
    this._loadController = null;
  }

  /**
   * Load saved-filter definitions, replacing the cached list.
   *
   * @returns {Promise<Array<object>>} Loaded filters; see {@link SavedFilterManager#list}.
   */
  async load() {
    this._loadController?.abort();
    this._loadController = new AbortController();
    const q = { t: 'filter', filterType: ['filter','faceted'] };
    if (this.filterIds.length) q.ids = this.filterIds.join(',');
    const payload = await this.apiClient.get('/sys', {
      query: { q, fields: 'query,filterType' },
      signal: this._loadController.signal
    });
    const source = Array.isArray(payload) ? payload : payload?.items || payload?.filters || payload?.records || [];
    this.filters = source.map((value) => this._normalize(value)).filter(Boolean);
    return this.list();
  }

  /**
   * List cached filters, optionally filtered by title, owner group, or kind.
   *
   * @param {{text?: string, group?: number|string|null, type?: string}} [options] Filter criteria.
   * @returns {Array<object>} Cloned, filtered filters.
   */
  list({ text = '', group = null, type = '' } = {}) {
    const search = String(text || '').trim().toLowerCase();
    const groupId = positiveId(group);
    const kind = String(type || '');
    return clone(this.filters.filter((filter) => {
      if (search && !filter.title.toLowerCase().includes(search)) return false;
      if (groupId && filter.ownerGroupId !== groupId) return false;
      return !kind || filter.kind === kind;
    }));
  }

  /**
   * List the distinct owner group ids present in the loaded filters, ascending.
   *
   * @returns {Array<number>} Distinct, sorted owner group ids.
   */
  groups() {
    return [...new Set(this.filters.map((filter) => filter.ownerGroupId).filter(Boolean))].sort((a, b) => a - b);
  }

  /**
   * Fetch (if needed) and resolve a saved filter into an executable DataSource.
   *
   * @param {number|string} id Filter record id.
   * @param {{origin?: string}} [options] `origin` tags the resulting DataSource's metadata.
   * @returns {Promise<object|null>} Resolved DataSource, or `null` when the filter or its request is empty.
   *   Conversion warnings are returned in `meta.warnings`.
   * @throws {Error} When the legacy converter reports the filter as unsupported (`error.legacyQuery` is set).
   */
  async resolveDataSource(id, { origin = 'filter' } = {}) {
    const filter = await this._loadOne(id);
    if (!filter) return null;

    let definition = filter.definition;
    const meta = { origin };
    if (this.legacyConverter) {
      const converted = await this.legacyConverter.convert(filter.query);
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

  /**
   * Fetch one filter's full definition and merge it into the cached list.
   *
   * @private
   * @param {number|string} id Filter record id.
   * @returns {Promise<object|null>} Cloned, normalized filter, or `null` when the id is invalid.
   */
  async _loadOne(id) {
    const filterId = positiveId(id);
    if (!filterId) return null;

    const value = await this.apiClient.get(`/sys/filter/${filterId}`);
    const fresh = this._normalize(value?.record ?? value);
    if (!fresh) return null;
    const index = this.filters.findIndex((item) => item.id === fresh.id);
    if (index >= 0) this.filters[index] = fresh;
    else this.filters.push(fresh);
    return clone(fresh);
  }

  /**
   * Normalize one API filter record into the manager's internal shape.
   *
   * @private
   * @param {object} value Raw API filter record.
   * @returns {object|null} Normalized filter, or `null` when it has no valid id.
   */
  _normalize(value) {
    const id = positiveId(value?.rec_ID ?? value?.id ?? value?.svs_ID);
    if (!id) return null;

    const details = value?.details || {};
    const query = detailValue(details, 'query') ?? value?.query ?? null;
    const storedType = detailValue(details, 'filterType') ?? value?.filterType ?? null;
    const definition = parseSavedFilterDefinition(query);
    const kind = this.classifyFilter
      ? this.classifyFilter(value, definition)
      : this.legacyConverter?.isParameterized(query) ? 'parametrized' : inferFilterKind(value, definition);
    return {
      id,
      title: String(value?.rec_Title ?? value?.title ?? `Filter ${id}`),
      ownerGroupId: positiveId(value?.rec_OwnerUGrpID ?? value?.ownerGroupId ?? value?.svs_UGrpID),
      query,
      definition,
      storedType,
      kind,
      raw: value
    };
  }

  /**
   * Abort any in-flight load.
   *
   * @returns {void}
   */
  destroy() {
    this._loadController?.abort();
  }
}

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

/** Classify a filter as `'parametrized'` or `'simple'` from explicit flags, else `'simple'`. */
function inferFilterKind(value, definition) {
  const explicit = value?.kind ?? value?.parameterized ?? value?.parametrized
    ?? definition?.filterKind ?? definition?.parameterized ?? definition?.parametrized;
  return explicit === true || ['parametrized', 'parameterized'].includes(String(explicit).toLowerCase())
    ? 'parametrized' : 'simple';
}

/** Read the first value of a Heurist `details` field entry, or `null` when absent. */
function detailValue(details, field) {
  const values = details?.[field];
  return Array.isArray(values) && values.length ? values[0]?.value ?? null : null;
}

/** Normalize a value to a positive integer id, or `null` when invalid. */
function positiveId(value) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

/** Normalize a value into a de-duplicated array of positive integer ids. */
function normalizeIds(value) {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(items.map(positiveId).filter(Boolean))];
}

/** Deep-clone a JSON-safe value. */
function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
