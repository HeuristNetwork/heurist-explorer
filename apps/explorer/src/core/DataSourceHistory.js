/**
 * @file DataSourceHistory.js
 * @brief Database-scoped, most-recently-used DataSource history.
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

import { cloneDataSource, dataSourceKey, dataSourceTitle, normalizeDataSource } from './DataSource.js';

const DEFAULT_LIMIT = 12;
const UNTITLED = 'Untitled search';

/**
 * Database-scoped, most-recently-used DataSource history. One entry per query:
 * running the same request again (as a saved filter, a source or typed in)
 * moves it to the top. An untitled entry is named by `describe` - the query
 * in words, e.g. 'Find Persons where Gender is not "Male"'.
 */
export class DataSourceHistory {
  /**
   * @param {object} options History store configuration.
   * @param {string} options.database Heurist database name; scopes the storage key.
   * @param {Storage|null} [options.storage] Storage backend; defaults to `localStorage`.
   * @param {number} [options.limit=DEFAULT_LIMIT] Maximum number of entries retained.
   * @param {Function} [options.clock] Returns the current time in ms; defaults to `Date.now`.
   * @param {(q: *) => string} [options.describe] Human-readable sentence for a query, titling untitled entries.
   */
  constructor({ database, storage = null, limit = DEFAULT_LIMIT, clock = Date.now, describe = null } = {}) {
    this.storage = storage ?? defaultStorage();
    this.limit = positiveInteger(limit) || DEFAULT_LIMIT;
    this.clock = typeof clock === 'function' ? clock : Date.now;
    this.describe = typeof describe === 'function' ? describe : null;
    this.storageKey = `heurist.explorer.${storageScope(database)}.history`;
  }

  /**
   * Record a datasource as most-recently-used, moving it to the front.
   *
   * @param {object} source Legacy or canonical datasource-like input.
   * @returns {{key: string, title: string, dataSource: object, usedAt: number}|null} The stored entry, or `null` when `source` is invalid.
   */
  add(source) {
    let dataSource;
    try {
      dataSource = normalizeDataSource(source);
    } catch {
      return null;
    }
    if (!dataSource) return null;

    const key = dataSourceKey(dataSource);
    if (!key) return null;
    const entry = {
      key,
      title: dataSourceTitle(dataSource, requestTitle(dataSource, this.describe)),
      dataSource: cloneDataSource(dataSource),
      usedAt: Number(this.clock()) || Date.now()
    };
    const request = requestKey(dataSource);
    const entries = this._read().filter((item) => item.key !== key && requestKey(item.dataSource) !== request);
    entries.unshift(entry);
    this._write(entries.slice(0, this.limit));
    return clone(entry);
  }

  /**
   * List history entries, most recently used first.
   *
   * @returns {Array<object>} Cloned history entries.
   */
  list() {
    return clone(this._read());
  }

  /**
   * Remove a history entry by key, entry, or datasource.
   *
   * @param {object|string} key Stored entry key, entry, or datasource-like value.
   * @returns {boolean} True when an entry was found and removed.
   */
  remove(key) {
    const normalizedKey = entryKey(key);
    if (!normalizedKey) return false;

    const entries = this._read();
    const next = entries.filter((item) => item.key !== normalizedKey);
    if (next.length === entries.length) return false;
    this._write(next);
    return true;
  }

  /**
   * Remove every history entry for this database.
   *
   * @returns {void}
   */
  clear() {
    safeRemove(this.storage, this.storageKey);
  }

  /**
   * Read, validate, and de-duplicate stored history entries from storage.
   *
   * @private
   * @returns {Array<object>} Valid, de-duplicated history entries, capped at `this.limit`.
   */
  _read() {
    const value = safeParse(safeGet(this.storage, this.storageKey));
    if (!Array.isArray(value)) return [];

    const entries = [];
    const seen = new Set();
    for (const item of value) {
      try {
        const dataSource = normalizeDataSource(item?.dataSource);
        const key = dataSourceKey(dataSource);
        const request = requestKey(dataSource);
        if (!key || seen.has(key) || seen.has(request)) continue;
        seen.add(key);
        seen.add(request);
        // entries stored before queries were described still say "Untitled search"
        const stored = text(item?.title);
        entries.push({
          key,
          title: (stored !== UNTITLED && stored) || dataSourceTitle(dataSource, requestTitle(dataSource, this.describe)),
          dataSource,
          usedAt: finiteNumber(item?.usedAt)
        });
      } catch { /* ignore invalid or obsolete entries */ }
      if (entries.length >= this.limit) break;
    }

    return entries;
  }

  /**
   * Persist history entries to storage.
   *
   * @private
   * @param {Array<object>} entries Entries to persist.
   * @returns {void}
   */
  _write(entries) {
    safeSet(this.storage, this.storageKey, JSON.stringify(entries));
  }
}

/** Derive a fallback title: the query in words, else its text, else a generic placeholder. */
function requestTitle(source, describe = null) {
  const q = source?.request?.q;
  let described = '';
  try { described = text(describe?.(q)); } catch { /* an undescribable query keeps its text */ }
  if (described) return described;
  if (typeof q === 'string' && q.trim()) return q.trim();
  return UNTITLED;
}

/**
 * Identity of a datasource's request, whatever produced it: the same query as a saved
 * filter, a source or typed in is one history entry. A JSON-text `q` is compared as
 * JSON, object keys in any order, and `10` equals `"10"`.
 */
function requestKey(source) {
  const request = { ...(source?.request || {}) };
  if (typeof request.q === 'string') {
    const q = request.q.trim();
    try { request.q = /^[[{]/.test(q) ? JSON.parse(q) : q; } catch { request.q = q; }
  }
  return `request:${JSON.stringify(canonical(request))}`;
}

/** Sort object keys and turn numbers into strings, so equal queries serialize identically. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] != null) result[key] = canonical(value[key]);
    }
    return result;
  }
  return typeof value === 'number' ? String(value) : value;
}

/** Resolve the storage key for a history entry from a string key, entry, or datasource. */
function entryKey(value) {
  if (typeof value === 'string') return value.trim() || null;
  return value?.key || dataSourceKey(value?.dataSource ?? value);
}

/** URL-encode a database name for use in a storage key, defaulting to `'default'`. */
function storageScope(value) { return encodeURIComponent(text(value) || 'default'); }

/** Trim a value to text, returning `''` for `null`/`undefined`. */
function text(value) { return value == null ? '' : String(value).trim(); }

/** Normalize a value to a finite number, defaulting to `0`. */
function finiteNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }

/** Normalize a value to a positive integer, or `null` when invalid. */
function positiveInteger(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }

/** Parse a JSON array from storage, tolerating missing or invalid data. */
function safeParse(value) { try { return value ? JSON.parse(value) : []; } catch { return []; } }

/** Read a storage key, tolerating an unavailable or throwing storage backend. */
function safeGet(storage, key) { try { return storage?.getItem?.(key) ?? null; } catch { return null; } }

/** Write a storage key, tolerating an unavailable or throwing storage backend. */
function safeSet(storage, key, value) { try { storage?.setItem?.(key, value); } catch { /* storage may be unavailable */ } }

/** Remove a storage key, tolerating an unavailable or throwing storage backend. */
function safeRemove(storage, key) { try { storage?.removeItem?.(key); } catch { /* storage may be unavailable */ } }

/** Return `localStorage` when accessible, otherwise `null`. */
function defaultStorage() { try { return globalThis.localStorage ?? null; } catch { return null; } }

/** Deep-clone a JSON-safe value. */
function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
