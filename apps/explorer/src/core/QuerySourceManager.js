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

// RT_QUERY_SOURCE's portable concept code: a fixed, global constant, the
// same in every Heurist database (see `dbconst()` in the server's
// `srv/Definitions/DefinitionSnapshotService.php`, which hardcodes this same
// "3-1021" for every db). Resolving it needs one small `/rty/{code}` lookup
// (RecordTypeProvider), not the whole per-database HDbDefs snapshot.
const QUERY_SOURCE_CONCEPT_CODE = '3-1021';

/** Loads RT_QUERY_SOURCE records and resolves their presentation definition. */
export class QuerySourceManager {
  /**
   * @param {object} options Manager configuration.
   * @param {import('#shared/api').HeuristApiClient} options.apiClient Heurist API client.
   * @param {import('#shared/data/RecordTypeProvider.js').RecordTypeProvider} options.recordTypeProvider Resolves RT_QUERY_SOURCE's local id by concept code.
   */
  constructor({ apiClient, recordTypeProvider } = {}) {
    if (!apiClient) throw new TypeError('QuerySourceManager requires apiClient');
    if (!recordTypeProvider) throw new TypeError('QuerySourceManager requires recordTypeProvider');
    this.apiClient = apiClient;
    this.recordTypeProvider = recordTypeProvider;
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

    const payload = await this.apiClient.get('/records/', {
      query: { q: `t:${this.recordTypeId}`, limit: 100000 },
      signal
    });
    const rows = Array.isArray(payload) ? payload : payload?.items || payload?.records || [];
    this.sources = rows.map(normalizeListItem).filter(Boolean);
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

    const payload = await this.apiClient.get(`/records/dataset/${sourceId}`);
    if (!payload || positiveId(payload.id) !== sourceId) return null;

    const query = payload?.source?.query;
    if (query == null || query === '') return null;

    const request = { q: clone(query) };
    if (Array.isArray(payload.rules) && payload.rules.length) request.rules = clone(payload.rules);
    const map = payload.map && typeof payload.map === 'object' ? payload.map : {};
    const dataSource = normalizeDataSource({
      reference: { type: 'source', id: sourceId },
      title: payload.title || payload?.source?.title || this.get(sourceId)?.title,
      request,
      presentation: {
        data: { fields: clone(payload.fields || []) },
        map: {
          geoFields: fieldPaths(map.geoFields ?? payload.geofields),
          dynamicRequests: map.dynamicRequests === true,
          minZoom: finiteNumberOrNull(map.minZoom),
          maxZoom: finiteNumberOrNull(map.maxZoom)
        },
        timeline: { fields: fieldPaths(payload.timefields) },
        graph: null,
        filterForm: null
      },
      meta: { origin }
    });
    const item = { id: sourceId, title: dataSource.title || `Source ${sourceId}` };
    const index = this.sources.findIndex((value) => value.id === sourceId);
    if (index < 0) this.sources.push(item);
    else this.sources[index] = { ...this.sources[index], ...item };
    return dataSource;
  }

  /**
   * Abort any in-flight load.
   *
   * @returns {void}
   */
  destroy() { this._loadController?.abort(); }
}

/** Normalize one API row to `{id, title}`, or `null` when it has no valid id. */
function normalizeListItem(value) {
  const id = positiveId(value?.rec_ID ?? value?.id);
  if (!id) return null;
  return { id, title: String(value?.rec_Title ?? value?.title ?? `Source ${id}`) };
}

/** Normalize a list of field descriptors (objects or bare codes) to trimmed field-path strings. */
function fieldPaths(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => typeof value === 'object' ? value.field ?? value.code : value)
    .map((value) => String(value || '').trim()).filter(Boolean);
}

/** Normalize a value to a positive integer id, or `null` when invalid. */
function positiveId(value) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

/** Normalize a value to a finite number, or `null` when empty or invalid. */
function finiteNumberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Deep-clone a JSON-safe value, tolerating `null`/`undefined`. */
function clone(value) { return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
