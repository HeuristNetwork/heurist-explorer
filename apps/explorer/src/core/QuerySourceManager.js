/**
 * @file QuerySourceManager.js
 * @brief Loads RT_QUERY_SOURCE records and resolves their presentation definition.
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
import { QuerySourceProvider } from '#shared/data/QuerySourceProvider.js';
import { QuerySource } from '#shared/data/QuerySource.js';
import { hasQueryParameters } from '#shared/data/queryParameters.js';

// RT_QUERY_SOURCE's portable concept code: a fixed, global constant, the
// same in every Heurist database (see `dbconst()` in the server's
// `srv/Definitions/DefinitionSnapshotService.php`, which hardcodes this same
// "3-1021" for every db). Resolving it needs one small `/rty/{code}` lookup
// (RecordTypeProvider), not the whole per-database HDbDefs snapshot.
const QUERY_SOURCE_CONCEPT_CODE = '3-1021';
// DT_QUERY_STRING and DT_EXPANSION_RULES (hserv/consts.php): read in the list
// request to mark parameterized sources and sources with expansion rules.
const QUERY_FIELD_CONCEPT_CODE = '2-12';
const RULES_FIELD_CONCEPT_CODE = '2-1163';

/** Loads RT_QUERY_SOURCE records and resolves their presentation definition. */
export class QuerySourceManager {
  /**
   * @param {object} options Manager configuration.
   * @param {import('#shared/api').HeuristApiClient} options.apiClient Heurist API client.
   * @param {import('#shared/data/RecordTypeProvider.js').RecordTypeProvider} options.recordTypeProvider Resolves RT_QUERY_SOURCE's local id by concept code.
   * @param {Function|Array<number>|null} [options.ownerIds] Owners (`rec_OwnerUGrpID`) to load, or a
   *   function returning them (see `ownerScope`); `null` loads every visible source.
   * @param {Function|null} [options.dbDefsProvider] Resolves HDbDefs, for the query/rules field ids;
   *   without it the list has no parameter/rules marks.
   */
  constructor({ apiClient, recordTypeProvider, ownerIds = null, dbDefsProvider = null } = {}) {
    if (!apiClient) throw new TypeError('QuerySourceManager requires apiClient');
    if (!recordTypeProvider) throw new TypeError('QuerySourceManager requires recordTypeProvider');
    this.apiClient = apiClient;
    this.recordTypeProvider = recordTypeProvider;
    this.querySourceProvider = new QuerySourceProvider({ apiClient });
    this.ownerIds = ownerIds;
    this.dbDefsProvider = typeof dbDefsProvider === 'function' ? dbDefsProvider : null;
    this.sources = [];
    this.recordTypeId = null;
    this._loadController = null;
  }

  /**
   * Load every RT_QUERY_SOURCE record, replacing the cached list.
   *
   * @returns {Promise<Array<{id: number, title: string}>>} Loaded, sorted sources; see {@link QuerySourceManager#list}.
   */
  async load() {
    this._loadController?.abort();
    this._loadController = new AbortController();
    const signal = this._loadController.signal;
    try {
      this.recordTypeId = await this.recordTypeProvider.getIdByConceptCode(QUERY_SOURCE_CONCEPT_CODE, { signal });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // RT_QUERY_SOURCE isn't registered in this database (older install) - no sources to show.
      this.recordTypeId = null;
      this.sources = [];
      return [];
    }

    const query = [{ t: String(this.recordTypeId) }];
    const owners = ownerList(typeof this.ownerIds === 'function' ? this.ownerIds() : this.ownerIds);
    if (owners) query.push({ owner: owners.join(',') });
    const fieldIds = await this._fieldIds();
    const fields = ['rec_OwnerUGrpID', fieldIds.query, fieldIds.rules].filter(Boolean).join(',');
    const payload = await this.apiClient.get('/records/', {
      query: { q: query, fields, limit: 100000 },
      signal
    });
    const rows = Array.isArray(payload) ? payload : payload?.items || payload?.records || [];
    this.sources = rows.map((row) => normalizeListItem(row, fieldIds)).filter(Boolean);
    return this.list();
  }

  /**
   * List cached sources, optionally filtered by title, sorted alphabetically.
   *
   * @param {{text?: string}} [options] `text` filters by case-insensitive title substring.
   * @returns {Array<{id: number, title: string}>} Cloned, sorted sources.
   */
  list({ text = '' } = {}) {
    const search = String(text || '').trim().toLowerCase();
    const values = search
      ? this.sources.filter((item) => item.title.toLowerCase().includes(search))
      : this.sources;
    return clone(values).sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  }

  /**
   * Look up one cached source by id.
   *
   * @param {number|string} id Source record id.
   * @returns {{id: number, title: string}|null} Cloned source, or `null` when not found.
   */
  get(id) {
    const sourceId = positiveId(id);
    const item = this.sources.find((value) => value.id === sourceId);
    return item ? clone(item) : null;
  }

  /**
   * Fetch a source record's full definition and resolve it into an executable DataSource.
   *
   * @param {number|string} id Source record id.
   * @param {{origin?: string}} [options] `origin` tags the resulting DataSource's metadata.
   * @returns {Promise<object|null>} Resolved DataSource, or `null` when the record or its query is missing.
   */
  async resolveDataSource(id, { origin = 'source' } = {}) {
    const sourceId = positiveId(id);
    if (!sourceId) return null;

    const payload = await this.querySourceProvider.load(sourceId);
    let querySource;
    try {
      querySource = new QuerySource(payload);
    } catch {
      return null; // missing/empty query, or a malformed persisted definition
    }
    if (querySource.id !== sourceId) return null;

    const request = { q: clone(querySource.source.query) };
    if (querySource.rules.length) request.rules = clone(querySource.rules);
    const dataSource = normalizeDataSource({
      reference: { type: 'source', id: sourceId },
      title: querySource.title || querySource.source.title || this.get(sourceId)?.title,
      request,
      presentation: {
        data: { fields: clone(querySource.fields) },
        map: {
          geoFields: querySource.map.geoFields.map((field) => field.field),
          dynamicRequests: querySource.map.dynamicRequests,
          minZoom: querySource.map.minZoom,
          maxZoom: querySource.map.maxZoom,
          geoOutputMode: querySource.map.geoOutputMode
        },
        timeline: { fields: querySource.timefields.map((field) => field.field) },
        graph: null,
        filterForm: clone(querySource.filterForm)
      },
      meta: { origin }
    });
    const item = { id: sourceId, title: dataSource.title || `Source ${sourceId}`, ownerGroupId: null,
      parametrized: hasQueryParameters(request.q), hasRules: Boolean(request.rules?.length) };
    const index = this.sources.findIndex((value) => value.id === sourceId);
    if (index < 0) this.sources.push(item);
    else this.sources[index] = { ...this.sources[index], ...item, ownerGroupId: this.sources[index].ownerGroupId };
    return dataSource;
  }

  /**
   * Local ids of the query and rules fields (0 when unknown).
   *
   * @private
   * @returns {Promise<{query: number, rules: number}>} Field ids.
   */
  async _fieldIds() {
    try {
      const dbdefs = await this.dbDefsProvider?.();
      return {
        query: Number(dbdefs?.localId?.('dty', QUERY_FIELD_CONCEPT_CODE)) || 0,
        rules: Number(dbdefs?.localId?.('dty', RULES_FIELD_CONCEPT_CODE)) || 0
      };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      return { query: 0, rules: 0 };
    }
  }

  /**
   * Abort any in-flight load.
   *
   * @returns {void}
   */
  destroy() { this._loadController?.abort(); }
}

/**
 * Normalize one API row to `{id, title, ownerGroupId, parametrized, hasRules}`,
 * or `null` when it has no valid id.
 */
function normalizeListItem(value, fieldIds = {}) {
  const id = positiveId(value?.rec_ID ?? value?.id);
  if (!id) return null;
  const query = detailText(value, fieldIds.query);
  const rules = detailText(value, fieldIds.rules);
  return {
    id,
    title: String(value?.rec_Title ?? value?.title ?? `Source ${id}`),
    // 0 is a real owner: Everyone
    ownerGroupId: ownerId(value?.rec_OwnerUGrpID ?? value?.ownerGroupId),
    parametrized: query ? hasQueryParameters(parseJson(query)) : false,
    hasRules: nonEmptyRules(rules)
  };
}

/** @returns {string} First value of a detail field of a `/records` row (`details[id][0]`), or ''. */
function detailText(row, fieldId) {
  if (!fieldId) return '';
  const values = row?.details?.[fieldId] ?? row?.details?.[String(fieldId)];
  const value = Array.isArray(values) ? values[0] : values;
  return value == null ? '' : String(typeof value === 'object' ? value.value ?? '' : value);
}

/** @returns {*} Parsed JSON, or the text itself. */
function parseJson(text) {
  try { return JSON.parse(text); } catch { return text; }
}

/** @returns {boolean} True for expansion rules that are not empty. */
function nonEmptyRules(text) {
  const value = String(text ?? '').trim();
  return value !== '' && value !== '[]' && value !== 'null' && value !== '{}';
}

/** Owner (user/group) id: a non-negative integer (0 is Everyone), or `null`. */
function ownerId(value) {
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id >= 0 ? id : null;
}

/** @returns {number[]|null} Distinct owner ids, or `null` when none are given. */
function ownerList(value) {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map(ownerId).filter((id) => id !== null))];
  return ids.length ? ids : null;
}

/** Normalize a value to a positive integer id, or `null` when invalid. */
function positiveId(value) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

/** Deep-clone a JSON-safe value, tolerating `null`/`undefined`. */
function clone(value) { return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
