/**
 * @file RecordListLoader.js
 * @brief Pages of records for HRecordList outside the Data module (plan 21): the
 *        record manager's query, sort and title filter over `POST /records`, or the
 *        search path of another API domain (`/files`, `/system/{type}`; see
 *        recordDomains.js - all domains take the `/records` parameters).
 *
 * `load()` has the shape HRecordList's `onDataRequest` expects. A newer request
 * aborts the one still running; the total of a query and filter is counted once
 * (later pages ask the server not to count again), as DataApplication does.
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

/** Fields HRecordList shows: title, type, and owner/visibility/bookmark/thumbnail (admin info, cards). */
export const RECORD_LIST_FIELDS = Object.freeze([
  'rec_ID', 'rec_Title', 'rec_RecTypeID',
  'rec_OwnerName', 'rec_ThumbnailURL', 'rec_Bookmarked', 'rec_NonOwnerVisibility'
]);

/** Loads record list pages for one query. */
export class RecordListLoader {
  /**
   * @param {object} options
   * @param {object} options.apiClient HeuristApiClient.
   * @param {*} [options.query] Heurist query (`q` array or string).
   * @param {Array<string>} [options.fields] Field codes; default RECORD_LIST_FIELDS.
   * @param {string|null} [options.sort] `/records` sort token (`title`, `-modified`...), null = the query's own.
   * @param {string} [options.path='/records'] Search path of the record types' domain
   *        (`recordTypesDomain(dbdefs, types).path`).
   */
  constructor({ apiClient, query = null, fields = RECORD_LIST_FIELDS, sort = null, path = '/records' } = {}) {
    if (!apiClient) throw new TypeError('RecordListLoader needs an apiClient');
    this.apiClient = apiClient;
    this.path = path || '/records';
    this.fields = [...new Set(fields)];
    this.sort = sort || null;
    this.setQuery(query);
  }

  /**
   * Use another query; known totals are forgotten.
   *
   * @param {*} query Heurist query.
   * @returns {RecordListLoader} This loader.
   */
  setQuery(query) {
    this.query = query;
    this.totals = new Map();
    return this;
  }

  /**
   * Use another sort (the totals stay: sorting does not change them).
   *
   * @param {string|null} sort `/records` sort token, or null.
   * @returns {RecordListLoader} This loader.
   */
  setSort(sort) {
    this.sort = sort || null;
    return this;
  }

  /**
   * Load one page (HRecordList `onDataRequest`).
   *
   * @param {{offset?: number, limit?: number, filter?: *, signal?: AbortSignal}} [request]
   *        `filter`: HRecordList's search, `{f: text}`, or null.
   * @returns {Promise<{records: Array<object>, meta: object, recordsTotal: number, recordsFiltered: number}>}
   * @throws {Error} AbortError when a newer request replaced this one.
   */
  async load({ offset = 0, limit = 100, filter = null, signal = null } = {}) {
    if (this.query == null || this.query === '') {
      return { records: [], meta: {}, recordsTotal: 0, recordsFiltered: 0 };
    }
    this._abort?.abort();
    const abort = new AbortController();
    this._abort = abort;
    signal?.addEventListener?.('abort', () => abort.abort(), { once: true });

    const key = filterKey(filter);
    const known = this.totals.get(key);
    const body = {
      q: this.query,
      fields: this.fields.join(','),
      limit,
      offset,
      resolveDetails: 1
    };
    if (this.sort) body.sort = this.sort;
    if (key) body.filter = filter;
    if (known != null) body.total = false;
    const response = await this.apiClient.post(this.path, { body, signal: abort.signal });
    if (this._abort === abort) this._abort = null;
    if (!response || !Array.isArray(response.records)) {
      throw new TypeError('Records API response is missing records');
    }
    const reported = Number(response.pagination?.total);
    const filtered = Number.isFinite(reported) && reported >= 0 ? reported : (known ?? response.records.length);
    this.totals.set(key, filtered);
    return {
      records: response.records,
      meta: response.meta || {},
      recordsTotal: this.totals.get('') ?? filtered,
      recordsFiltered: filtered
    };
  }

  /** Abort the running request. */
  abort() {
    this._abort?.abort();
    this._abort = null;
  }
}

/** Key of a filter for the known totals ("" = no filter). */
function filterKey(filter) {
  if (filter == null || filter === '') return '';
  if (typeof filter === 'object' && !Object.keys(filter).length) return '';
  if (typeof filter === 'object' && (filter.f == null || filter.f === '') && Object.keys(filter).length === 1) return '';
  return JSON.stringify(filter);
}
