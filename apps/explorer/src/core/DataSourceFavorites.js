/**
 * @file DataSourceFavorites.js
 * @brief Database-scoped persistent references displayed as Explorer Favorites.
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

const REFERENCE_ALIASES = Object.freeze({
  filter: 'filter', recordtype: 'recordtype', rectype: 'recordtype', source: 'source',
  querysource: 'source', 'query-source': 'source', dataset: 'source', mapsource: 'source', 'map-source': 'source'
});

/** Database-scoped persistent references displayed as Explorer Favorites. */
export class DataSourceFavorites {
  /**
   * @param {object} options Favorites store configuration.
   * @param {string} options.database Heurist database name; scopes the storage key.
   * @param {Storage|null} [options.storage] Storage backend; defaults to `localStorage`.
   * @param {Function} [options.clock] Returns the current time in ms; defaults to `Date.now`.
   * @param {Function|null} [options.resolver] Resolves a persistent reference to its current data, for `resolve()`.
   */
  constructor({ database, storage = null, clock = Date.now, resolver = null } = {}) {
    this.storage = storage ?? defaultStorage();
    this.clock = typeof clock === 'function' ? clock : Date.now;
    this.resolver = typeof resolver === 'function' ? resolver : null;
    this.storageKey = `heurist.explorer.${storageScope(database)}.favorites`;
  }

  /**
   * Add or update a favorite for a persistent reference.
   *
   * @param {object} value Reference-like value (filter/source/recordtype), or a DataSource carrying one.
   * @param {{title?: string}} [options] Explicit title override.
   * @returns {{key: string, title: string, reference: object, addedAt: number}|null} The stored entry, or `null` when `value` has no valid persistent reference.
   */
  add(value, options = {}) {
    const reference = normalizeReference(value);
    if (!reference) return null;

    const entry = {
      key: reference.key,
      title: text(options.title ?? value?.title ?? value?.reference?.title) || defaultTitle(reference),
      reference,
      addedAt: Number(this.clock()) || Date.now()
    };
    const entries = this._read().filter((item) => item.key !== entry.key);
    entries.push(entry);
    this._write(entries);
    return clone(entry);
  }

  /**
   * Remove a favorite by reference, entry, or key.
   *
   * @param {object|string} value Reference-like value, stored entry, or its key string.
   * @returns {boolean} True when an entry was found and removed.
   */
  remove(value) {
    const key = favoriteKey(value);
    if (!key) return false;

    const entries = this._read();
    const next = entries.filter((item) => item.key !== key);
    if (next.length === entries.length) return false;
    this._write(next);
    return true;
  }

  /**
   * Whether a favorite exists for the given reference, entry, or key.
   *
   * @param {object|string} value Reference-like value, stored entry, or its key string.
   * @returns {boolean} True when a matching favorite exists.
   */
  has(value) {
    const key = favoriteKey(value);
    return Boolean(key && this._read().some((item) => item.key === key));
  }

  /**
   * List every favorite, most recently added last.
   *
   * @returns {Array<object>} Cloned favorite entries.
   */
  list() {
    return clone(this._read());
  }

  /**
   * Remove every favorite for this database.
   *
   * @returns {void}
   */
  clear() {
    safeRemove(this.storage, this.storageKey);
  }

  /**
   * Resolve a favorite reference to its current data via the configured resolver.
   *
   * @param {object} value Reference-like value, or a DataSource carrying one.
   * @returns {Promise<*>} Resolver result, or `null` when the reference is invalid or no resolver is configured.
   */
  async resolve(value) {
    const reference = normalizeReference(value?.reference ?? value);
    if (!reference || !this.resolver) return null;
    return this.resolver(clone(reference));
  }

  /**
   * Read and de-duplicate stored favorite entries from storage.
   *
   * @private
   * @returns {Array<object>} Valid, de-duplicated favorite entries.
   */
  _read() {
    const value = safeParse(safeGet(this.storage, this.storageKey));
    if (!Array.isArray(value)) return [];

    const entries = [];
    const seen = new Set();
    for (const item of value) {
      const reference = normalizeReference(item?.reference ?? item);
      if (!reference || seen.has(reference.key)) continue;
      seen.add(reference.key);
      entries.push({
        key: reference.key,
        title: text(item?.title) || defaultTitle(reference),
        reference,
        addedAt: finiteNumber(item?.addedAt)
      });
    }

    return entries;
  }

  /**
   * Persist favorite entries to storage.
   *
   * @private
   * @param {Array<object>} entries Entries to persist.
   * @returns {void}
   */
  _write(entries) {
    safeSet(this.storage, this.storageKey, JSON.stringify(entries));
  }
}

/** Normalize a reference-like or DataSource-like value to `{type, id, key}`, or `null` when invalid. */
function normalizeReference(value) {
  if (!value || typeof value !== 'object') return null;

  const input = value.reference && typeof value.reference === 'object' ? value.reference : value;
  const rawType = input.type ?? input.kind ?? value.type ?? value.kind;
  const alias = String(rawType ?? '').trim().toLowerCase().replaceAll('_', '-');
  const type = REFERENCE_ALIASES[alias];
  if (!type) return null;

  const id = positiveId(input.id ?? value.id ?? value.filterId ?? value.recordTypeId
    ?? value.rectypeId ?? value.sourceId ?? value.querySourceId ?? value.datasetId ?? value.mapSourceId);
  if (!id) return null;

  return { type, id, key: `${type}:${id}` };
}

/** Resolve the storage key for a favorite from a string key, reference, or entry. */
function favoriteKey(value) {
  if (typeof value === 'string') return value.trim() || null;
  return normalizeReference(value?.reference ?? value)?.key ?? value?.key ?? null;
}

/** Build a default display title from a reference's type and id. */
function defaultTitle(reference) {
  const label = { filter: 'Filter', source: 'Source', recordtype: 'Record type' }[reference.type] || 'Favorite';
  return `${label} ${reference.id}`;
}

/** Normalize a value to a positive integer id, or `null` when invalid. */
function positiveId(value) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }

/** URL-encode a database name for use in a storage key, defaulting to `'default'`. */
function storageScope(value) { return encodeURIComponent(text(value) || 'default'); }

/** Trim a value to text, returning `''` for `null`/`undefined`. */
function text(value) { return value == null ? '' : String(value).trim(); }

/** Normalize a value to a finite number, defaulting to `0`. */
function finiteNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }

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
