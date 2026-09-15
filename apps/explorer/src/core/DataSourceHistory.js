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

/** Database-scoped, most-recently-used DataSource history. */
export class DataSourceHistory {
  /**
   * @param {object} options History store configuration.
   * @param {string} options.database Heurist database name; scopes the storage key.
   * @param {Storage|null} [options.storage] Storage backend; defaults to `localStorage`.
   * @param {number} [options.limit=DEFAULT_LIMIT] Maximum number of entries retained.
   * @param {Function} [options.clock] Returns the current time in ms; defaults to `Date.now`.
   */
  constructor({ database, storage = null, limit = DEFAULT_LIMIT, clock = Date.now } = {}) {
    this.storage = storage ?? defaultStorage();
    this.limit = positiveInteger(limit) || DEFAULT_LIMIT;
    this.clock = typeof clock === 'function' ? clock : Date.now;
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
      title: dataSourceTitle(dataSource, requestTitle(dataSource)),
      dataSource: cloneDataSource(dataSource),
      usedAt: Number(this.clock()) || Date.now()
    };
    const entries = this._read().filter((item) => item.key !== key);
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
        if (!key || seen.has(key)) continue;
        seen.add(key);
        entries.push({
          key,
          title: text(item?.title) || dataSourceTitle(dataSource, requestTitle(dataSource)),
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

/** Derive a fallback title from a datasource's query text, or a generic placeholder. */
function requestTitle(source) {
  const q = source?.request?.q;
  if (typeof q === 'string' && q.trim()) return q.trim();
  return 'Untitled search';
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
