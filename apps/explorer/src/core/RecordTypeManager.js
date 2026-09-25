/**
 * @file RecordTypeManager.js
 * @brief Loads record-type usage counts and joins them to the definition snapshot.
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

const RECORD_TYPE_ICON_TOKEN = Date.now();

/** Loads record-type usage counts and joins them to the definition snapshot. */
export class RecordTypeManager {
  /**
   * @param {object} options Manager configuration.
   * @param {import('#shared/api').HeuristApiClient} options.apiClient Heurist API client.
   * @param {function(): Promise<object>} options.dbDefsProvider Resolves the current database's definitions.
   * @param {string} [options.baseUrl] Base URL used to build record-type icon URLs.
   * @param {string} [options.database] Database name used to build record-type icon URLs.
   */
  constructor({ apiClient, dbDefsProvider, baseUrl = '', database = '' } = {}) {
    if (!apiClient) throw new TypeError('RecordTypeManager requires apiClient');
    if (typeof dbDefsProvider !== 'function') {
      throw new TypeError('RecordTypeManager requires dbDefsProvider');
    }
    this.apiClient = apiClient;
    this.dbDefsProvider = dbDefsProvider;
    this.baseUrl = String(baseUrl || '');
    this.database = String(database || '');
    this.recordTypes = [];
    this.dbDefs = null;
    this._loadController = null;
  }

  /**
   * Load record-type usage counts and join them with the definition snapshot.
   *
   * @returns {Promise<Array<object>>} Loaded record types; see {@link RecordTypeManager#list}.
   */
  async load() {
    this._loadController?.abort();
    this._loadController = new AbortController();
    const [payload, dbDefs] = await Promise.all([
      this.apiClient.get('/records/', {
        query: { detail: 'rectypes' },
        signal: this._loadController.signal
      }),
      this.dbDefsProvider()
    ]);
    this.dbDefs = dbDefs;
    const counts = normalizeCounts(payload?.rectypes);
    // publish the counts on the shared definitions so every widget can hide unused types
    dbDefs.setRectypeCounts?.(counts);
    const definitions = new Map(dbDefs.rectypes().map((item) => [item.id, item]));
    const groups = new Map(dbDefs.rectypeGroups().map((item, index) => [item.id, { ...item, index }]));
    this.recordTypes = counts.map(({ id, count }) => {
      const definition = definitions.get(id);
      const groupId = definition?.group ?? null;
      const group = groups.get(groupId);
      return {
        id,
        title: String(definition?.name || `Record type ${id}`),
        plural: String(definition?.plural || definition?.name || `Record type ${id}`),
        count,
        groupId,
        groupName: String(group?.name || 'Ungrouped'),
        groupOrder: Number(group?.order ?? group?.index ?? Number.MAX_SAFE_INTEGER),
        iconUrl: this.iconUrl(id)
      };
    });
    return this.list();
  }

  /**
   * Return record types sorted by descending usage or localized name.
   *
   * @param {{sort?: 'usage'|'name'}} [options] Sort order; defaults to usage count descending.
   * @returns {Array<object>} Cloned, sorted record types.
   */
  list({ sort = 'usage' } = {}) {
    const byName = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    const items = [...this.recordTypes];
    items.sort(sort === 'name'
      ? byName
      : (a, b) => b.count - a.count || byName(a, b));
    return clone(items);
  }

  /**
   * Look up one loaded record type by id.
   *
   * @param {number|string} id Record type id.
   * @returns {object|null} Cloned record type, or `null` when not found.
   */
  get(id) {
    const recordTypeId = positiveId(id);
    const item = this.recordTypes.find((value) => value.id === recordTypeId);
    return item ? clone(item) : null;
  }

  /**
   * List the distinct record-type groups present in the loaded record types, ordered.
   *
   * @returns {Array<{id: *, name: string, order: number}>} Groups, sorted by order then name.
   */
  groups() {
    const found = new Map();
    for (const item of this.recordTypes) {
      const key = item.groupId == null ? 'ungrouped' : String(item.groupId);
      if (!found.has(key)) {
        found.set(key, {
          id: item.groupId,
          name: item.groupName,
          order: item.groupOrder
        });
      }
    }
    return [...found.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  /**
   * Build an executable DataSource that queries all records of one record type.
   *
   * @param {number|string} id Record type id.
   * @param {{origin?: string}} [options] `origin` tags the resulting DataSource's metadata.
   * @returns {object|null} Resolved DataSource, or `null` when the record type is not loaded.
   */
  resolveDataSource(id, { origin = 'recordtype' } = {}) {
    const item = this.get(id);
    if (!item) return null;
    return normalizeDataSource({
      reference: { type: 'recordtype', id: item.id },
      title: item.title,
      request: { q: `t:${item.id}` },
      presentation: {},
      meta: { origin, count: item.count }
    });
  }

  /**
   * Build the icon URL for a record type.
   *
   * @param {number|string} id Record type id.
   * @returns {string} Icon URL, or `''` when the id is invalid or no `baseUrl` is configured.
   */
  iconUrl(id) {
    const recordTypeId = positiveId(id);
    if (!recordTypeId || !this.baseUrl) return '';
    const root = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    return `${root}?db=${encodeURIComponent(this.database)}&icon=${recordTypeId}`
      + `&t=${RECORD_TYPE_ICON_TOKEN}`;
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

/** Normalize the API's usage-count payload (array or id-keyed map) to `{id, count}` rows. */
function normalizeCounts(value) {
  const rows = Array.isArray(value)
    ? value
    : Object.entries(value && typeof value === 'object' ? value : {}).map(([id, count]) => (
      count && typeof count === 'object' ? { ...count, rec_RecTypeID: count.rec_RecTypeID ?? id } : { rec_RecTypeID: id, count }
    ));
  const result = [];
  const seen = new Set();
  for (const row of rows) {
    const id = positiveId(row?.rec_RecTypeID ?? row?.id ?? row?.rty_ID);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, count: Math.max(0, Number(row?.count) || 0) });
  }
  return result;
}

/** Normalize a value to a positive integer id, or `null` when invalid. */
function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Deep-clone a JSON-safe value. */
function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
