/**
 * @file FieldValueSource.js
 * @brief Value sources backed by `GET /records/?detail=values` (plan §5.1):
 *        the values a field actually has in a query result, with counts.
 *
 * `FieldValueSource` implements the complete/incremental rule (V9): the first
 * load asks for up to 1000 values; when the server reports no more than that,
 * the list is complete and the picker filters locally, otherwise each filter
 * text is sent to the server.
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

import { VALUE_LOAD_LIMIT, hideZeroCounts, mergeTermCounts, sortItems } from './valueList.js';
import { vocabularyItems } from './localSources.js';

const CACHE_SIZE = 8;

/** Unique values of one field over a (possibly changing) query. */
export class FieldValueSource {
  /**
   * @param {object} api HeuristApiClient (needs `get`).
   * @param {object} options Source options.
   * @param {Array|object|Function} options.query Query, or a function returning
   *        one (or a promise of one) - evaluated on every load (dynamic facets).
   * @param {number|string} options.field Detail type ID or header keyword
   *        (`owner`, `addedby`, `tag`, `rectype`, `access`).
   * @param {'label'|'count'} [options.sort='label'] Client order (V8).
   * @param {number} [options.limit=VALUE_LOAD_LIMIT] Values per request.
   * @param {Function} [options.labelFor] `value → label` for values the server
   *        does not label (enum terms, resolved through HDbDefs).
   * @param {Function} [options.selected] `() → values` kept visible even when
   *        absent from the result (V15).
   */
  constructor(api, { query = [], field, sort = 'label', limit = VALUE_LOAD_LIMIT, labelFor = null, selected = null } = {}) {
    if (!api?.get) throw new TypeError('FieldValueSource requires an API client');
    if (field == null || field === '') throw new TypeError('FieldValueSource requires a field');
    this.api = api;
    this.query = query;
    this.field = String(field);
    this.sort = sort;
    this.limit = Math.max(1, Math.min(VALUE_LOAD_LIMIT, Number(limit) || VALUE_LOAD_LIMIT));
    this.labelFunction = labelFor;
    this.selected = selected;
    this._cache = new Map();
    this._labels = new Map();
  }

  /** Forget cached results (for example after another facet changed). */
  invalidate() {
    this._cache.clear();
  }

  /**
   * @param {{text?: string, limit?: number, signal?: AbortSignal}} [options] Load options.
   * @returns {Promise<{items: Array<object>, total: number, complete: boolean}>} Values.
   */
  async load({ text = '', limit = this.limit, signal } = {}) {
    const query = await resolveQuery(this.query);
    const filter = String(text ?? '').trim();
    const key = JSON.stringify([query, filter, limit]);
    let payload = this._cache.get(key);
    if (!payload) {
      payload = await this.api.get('/records/', {
        query: {
          q: query,
          detail: 'values',
          field: this.field,
          ...(filter ? { text: filter } : {}),
          limit,
          sort: this.sort === 'count' ? 'count' : 'value'
        },
        signal
      });
      this._cache.set(key, payload);
      if (this._cache.size > CACHE_SIZE) this._cache.delete(this._cache.keys().next().value);
    }
    const values = Array.isArray(payload?.values) ? payload.values : [];
    let items = values.map((row) => this._item(row));
    const selected = (this.selected?.() || []).map(String);
    for (const value of selected) {
      if (!items.some((item) => String(item.value) === value)) {
        items.push({ value: numericOr(value), label: this.labelFor(value) || value, count: 0 });
      }
    }
    // groups before users (owner/addedby), then the requested order within each block
    items.sort((a, b) => groupRank(a) - groupRank(b));
    items = sortItems(hideZeroCounts(items, selected), this.sort === 'count' ? 'count' : 'label');
    const total = Math.max(Number(payload?.total) || 0, values.length);
    return { items, total, complete: !filter && values.length >= total };
  }

  /**
   * @param {*} value A value.
   * @returns {string} Its label: server label seen earlier, `labelFor`, or `''`.
   */
  labelFor(value) {
    return this._labels.get(String(value)) || this.labelFunction?.(value) || '';
  }

  /** @returns {object} Picker item for one server row. */
  _item(row) {
    const value = row?.value;
    const label = row?.label != null && row.label !== ''
      ? String(row.label)
      : this.labelFunction?.(value) || String(value ?? '');
    this._labels.set(String(value), label);
    const item = { value, label, count: Number(row?.count) || 0 };
    if (row?.rty != null) item.rty = Number(row.rty);
    if (row?.kind) item.group = row.kind === 'group' ? 'groups' : 'users';
    return item;
  }
}

/**
 * Enum facet: the vocabulary in its own order, reduced to the terms that occur
 * in the result (with counts) and their ancestors (no count), plus selected
 * terms (V8, V13, V15).
 */
export class FacetTermSource {
  /**
   * @param {object} dbdefs HDbDefs.
   * @param {number|string} vocabId Vocabulary root term ID.
   * @param {FieldValueSource} values Source of the field's term counts.
   * @param {{selected?: Function}} [options] `() → values` kept visible.
   */
  constructor(dbdefs, vocabId, values, { selected = null } = {}) {
    this.dbdefs = dbdefs;
    this.vocabId = Number(vocabId) || 0;
    this.values = values;
    this.selected = selected;
  }

  /** Forget cached counts. */
  invalidate() {
    this.values.invalidate?.();
  }

  /** @returns {Promise<{items: Array<object>, total: number, complete: boolean}>} Facet terms. */
  async load({ signal } = {}) {
    const result = await this.values.load({ text: '', signal });
    const counts = new Map(result.items.filter((item) => item.count > 0)
      .map((item) => [String(item.value), item.count]));
    const items = mergeTermCounts(vocabularyItems(this.dbdefs, this.vocabId), counts,
      this.selected?.() || []);
    return { items, total: items.length, complete: true };
  }

  /** @returns {string} Term label from HDbDefs. */
  labelFor(value) {
    return this.dbdefs?.termLabel?.(value) || '';
  }
}

/**
 * Ranges of a date or numeric field over a (possibly changing) query, with
 * record counts (`GET /records/?detail=ranges`). Item values are `"from/to"`,
 * which `resolveQueryParameters` puts into the parameter's template; a count
 * equals the number of records selecting that range finds.
 */
export class RangeBucketSource {
  /**
   * @param {object} api HeuristApiClient (needs `get`).
   * @param {object} options Source options.
   * @param {Array|object|Function} options.query Query, or a function returning one.
   * @param {number|string} options.field Detail type ID, or `added` / `modified`.
   * @param {string} [options.groupBy] Dates: `month` | `year` | `decade` | `century`.
   * @param {number} [options.ranges] Numbers: how many ranges (1–20).
   * @param {'overlap'|'within'} [options.match='overlap'] How a date span counts.
   * @param {Function} [options.selected] `() → values` kept visible when absent (V15).
   */
  constructor(api, { query = [], field, groupBy = null, ranges = null, match = 'overlap', selected = null } = {}) {
    if (!api?.get) throw new TypeError('RangeBucketSource requires an API client');
    if (field == null || field === '') throw new TypeError('RangeBucketSource requires a field');
    this.api = api;
    this.query = query;
    this.field = String(field);
    this.grouping = groupBy ? { groupby: groupBy } : { ranges: String(ranges || '') };
    this.match = match === 'within' ? 'within' : 'overlap';
    this.selected = selected;
    this._cache = new Map();
    this._labels = new Map();
  }

  /** Forget cached ranges (another facet changed). */
  invalidate() {
    this._cache.clear();
  }

  /** @returns {Promise<{items: Array<object>, total: number, complete: boolean}>} Ranges. */
  async load({ signal } = {}) {
    const query = await resolveQuery(this.query);
    const key = JSON.stringify(query);
    let payload = this._cache.get(key);
    if (!payload) {
      payload = await this.api.get('/records/', {
        query: { q: query, detail: 'ranges', field: this.field, ...this.grouping, match: this.match },
        signal
      });
      this._cache.set(key, payload);
      if (this._cache.size > CACHE_SIZE) this._cache.delete(this._cache.keys().next().value);
    }
    const items = (Array.isArray(payload?.buckets) ? payload.buckets : []).map((bucket) => {
      const value = `${bucket.from}/${bucket.to}`;
      const label = String(bucket.label ?? value);
      this._labels.set(value, label);
      return { value, label, count: Number(bucket.count) || 0 };
    });
    // a selected range that no longer occurs stays visible (count 0)
    for (const value of (this.selected?.() || []).map(String)) {
      if (!items.some((item) => item.value === value)) items.push({ value, label: this.labelFor(value), count: 0 });
    }
    return { items, total: items.length, complete: true };
  }

  /** @returns {string} Label seen from the server, else `from – to`. */
  labelFor(value) {
    const text = String(value ?? '');
    const cut = text.indexOf('/', 1);
    return this._labels.get(text) || (cut > 0 ? `${text.slice(0, cut)} – ${text.slice(cut + 1)}` : text);
  }
}

/**
 * Smallest and largest value of a numeric or date field over a query
 * (`GET /records/?detail=minmax`), for sliders without configured bounds.
 *
 * @param {object} api HeuristApiClient (needs `get`).
 * @param {{query?: Array|object|Function, field: number|string, signal?: AbortSignal}} options
 *        `field`: detail type ID, or `added` / `modified`.
 * @returns {Promise<{min: number|string|null, max: number|string|null, count: number}>}
 *          Bounds (numbers, or ISO dates), null without values.
 */
export async function fetchFieldRange(api, { query = [], field, signal } = {}) {
  if (!api?.get) throw new TypeError('fetchFieldRange requires an API client');
  if (field == null || field === '') throw new TypeError('fetchFieldRange requires a field');
  const payload = await api.get('/records/', {
    query: { q: await resolveQuery(query), detail: 'minmax', field: String(field) },
    signal
  });
  return { min: payload?.min ?? null, max: payload?.max ?? null, count: Number(payload?.count) || 0 };
}

/** @returns {Promise<Array|object>} The query a source option describes. */
async function resolveQuery(query) {
  const value = typeof query === 'function' ? await query() : query;
  return value ?? [];
}

/** @returns {number} Block order: groups, users, then everything else. */
function groupRank(item) {
  return item.group === 'groups' ? 0 : item.group === 'users' ? 1 : 2;
}

/** @returns {number|string} A numeric string as a number, other values unchanged. */
function numericOr(value) {
  return /^\d+$/.test(String(value)) ? Number(value) : value;
}
