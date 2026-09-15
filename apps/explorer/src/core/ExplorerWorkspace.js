/**
 * @file ExplorerWorkspace.js
 * @brief Database-scoped collection of DataSources deliberately retained by the user.
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

const PERSISTENT_TYPES = new Set(['filter', 'recordtype', 'source']);

/** Database-scoped collection of DataSources deliberately retained by the user. */
export class ExplorerWorkspace {
  /**
   * @param {object} options Workspace store configuration.
   * @param {string} options.database Heurist database name; scopes the storage key.
   * @param {Storage|null} [options.storage] Storage backend; defaults to `localStorage`.
   * @param {Function} [options.clock] Returns the current time in ms; defaults to `Date.now`.
   * @param {Function|null} [options.resolver] Resolves a persistent reference to its current data.
   */
  constructor({ database, storage = null, clock = Date.now, resolver = null } = {}) {
    this.storage = storage ?? defaultStorage();
    this.clock = typeof clock === 'function' ? clock : Date.now;
    this.resolver = typeof resolver === 'function' ? resolver : null;
    this.storageKey = `heurist.explorer.${storageScope(database)}.workspace`;
  }

  /**
   * Add a datasource or persistent reference to the workspace.
   *
   * @param {object} value Datasource-like or reference-like value to add.
   * @param {{title?: string}} [options] Explicit title override.
   * @returns {object|null} The stored entry, or `null` when `value` is invalid.
   */
  add(value, options = {}) {
    const normalized = normalizeWorkspaceValue(value);
    if (!normalized) return null;

    const { reference, dataSource } = normalized;
    const key = reference.key;
    const entry = {
      key,
      title: text(options.title ?? value?.title ?? dataSource?.title) || defaultTitle(reference, dataSource),
      reference,
      addedAt: Number(this.clock()) || Date.now()
    };
    const presentation = workspacePresentation(dataSource?.presentation);
    if (presentation) entry.presentation = presentation;
    // Only ad-hoc queries need their executable definition persisted locally.
    if (reference.type === 'query') entry.dataSource = cloneDataSource(dataSource);
    const entries = this._read().filter((item) => item.key !== key);
    entries.push(entry);
    this._write(entries);
    return clone(entry);
  }

  /**
   * Remove a workspace entry by value, entry, or key.
   *
   * @param {object|string} value Datasource-like, reference-like, entry, or key string.
   * @returns {boolean} True when an entry was found and removed.
   */
  remove(value) {
    const key = workspaceKey(value);
    if (!key) return false;

    const entries = this._read();
    const next = entries.filter((item) => item.key !== key);
    if (next.length === entries.length) return false;
    this._write(next);
    return true;
  }

  /**
   * Whether a workspace entry exists for the given value.
   *
   * @param {object|string} value Datasource-like, reference-like, entry, or key string.
   * @returns {boolean} True when a matching entry exists.
   */
  has(value) {
    const key = workspaceKey(value);
    return Boolean(key && this._read().some((item) => item.key === key));
  }

  /**
   * List every workspace entry.
   *
   * @returns {Array<object>} Cloned workspace entries.
   */
  list() {
    return clone(this._read());
  }

  /**
   * Look up one workspace entry by value.
   *
   * @param {object|string} value Datasource-like, reference-like, entry, or key string.
   * @returns {object|null} The matching entry, cloned, or `null` when not found.
   */
  get(value) {
    const key = workspaceKey(value);
    const entry = key ? this._read().find((item) => item.key === key) : null;
    return entry ? clone(entry) : null;
  }

  /**
   * Persist module-owned presentation state without changing source identity.
   *
   * @param {object|string} value Datasource-like, reference-like, entry, or key string identifying the entry.
   * @param {object} presentation Presentation patch (or an object carrying one under `.presentation`).
   * @returns {object|null} The updated entry, cloned, or `null` when not found.
   */
  update(value, presentation) {
    const key = workspaceKey(value);
    if (!key) return null;

    const entries = this._read();
    const index = entries.findIndex((item) => item.key === key);
    if (index < 0) return null;

    const nextPresentation = workspacePresentation(
      presentation?.presentation ?? presentation ?? value?.presentation
    );
    if (nextPresentation) entries[index].presentation = merge(entries[index].presentation || {}, nextPresentation);
    else delete entries[index].presentation;
    if (value?.title) entries[index].title = text(value.title) || entries[index].title;
    if (entries[index].reference.type === 'query' && value?.request) {
      entries[index].dataSource = cloneDataSource({
        ...entries[index].dataSource,
        ...value,
        presentation: merge(entries[index].dataSource?.presentation || {}, entries[index].presentation || {})
      });
    }
    this._write(entries);
    return clone(entries[index]);
  }

  /**
   * Remove every workspace entry for this database.
   *
   * @returns {void}
   */
  clear() {
    safeRemove(this.storage, this.storageKey);
  }

  /**
   * Resolve a workspace entry to its current executable DataSource.
   *
   * @param {object|string} value Datasource-like, reference-like, entry, or key string.
   * @returns {Promise<object|null>} Resolved DataSource, or `null` when not found or unresolved.
   */
  async resolve(value) {
    const entry = value?.key && value?.reference ? value : this.get(value);
    if (!entry) return null;

    if (entry.reference.type === 'query') {
      return cloneDataSource({
        ...entry.dataSource,
        presentation: merge(entry.dataSource?.presentation || {}, entry.presentation || {})
      });
    }
    if (!this.resolver) return null;

    const resolved = await this.resolver(clone(entry.reference));
    return resolved ? cloneDataSource({
      ...resolved,
      presentation: merge(resolved.presentation || {}, entry.presentation || {})
    }) : null;
  }

  /**
   * Read and de-duplicate stored workspace entries from storage.
   *
   * @private
   * @returns {Array<object>} Valid, de-duplicated workspace entries.
   */
  _read() {
    const value = safeParse(safeGet(this.storage, this.storageKey));
    if (!Array.isArray(value)) return [];

    const entries = [];
    const seen = new Set();
    for (const item of value) {
      const normalized = normalizeWorkspaceValue(item?.dataSource ?? item?.reference ?? item);
      if (!normalized || seen.has(normalized.reference.key)) continue;
      if (normalized.reference.type === 'query' && !normalized.dataSource) continue;
      seen.add(normalized.reference.key);
      const entry = {
        key: normalized.reference.key,
        title: text(item?.title) || defaultTitle(normalized.reference, normalized.dataSource),
        reference: normalized.reference,
        addedAt: finiteNumber(item?.addedAt)
      };
      if (normalized.reference.type === 'query') entry.dataSource = cloneDataSource(normalized.dataSource);
      const presentation = workspacePresentation(item?.presentation);
      if (presentation) entry.presentation = presentation;
      entries.push(entry);
    }

    return entries;
  }

  /**
   * Persist workspace entries to storage.
   *
   * @private
   * @param {Array<object>} entries Entries to persist.
   * @returns {void}
   */
  _write(entries) {
    safeSet(this.storage, this.storageKey, JSON.stringify(entries));
  }
}

/** Normalize a datasource-like or persistent-reference-like value to `{reference, dataSource}`, or `null` when invalid. */
function normalizeWorkspaceValue(value) {
  if (!value || typeof value !== 'object') return null;

  try {
    const dataSource = normalizeDataSource(value?.dataSource ?? value);
    return { reference: clone(dataSource.reference), dataSource };
  } catch { /* a persistent reference may intentionally have no request */ }

  const input = value.reference && typeof value.reference === 'object' ? value.reference : value;
  const type = normalizePersistentType(input.type ?? input.kind);
  const id = positiveId(input.id ?? value.id);
  if (!type || !id) return null;
  return { reference: { type, id, key: `${type}:${id}` }, dataSource: null };
}

/** Normalize a persistent reference type alias to one of `PERSISTENT_TYPES`, or `null` when unsupported. */
function normalizePersistentType(value) {
  const aliases = {
    filter: 'filter', recordtype: 'recordtype', rectype: 'recordtype', source: 'source',
    dataset: 'source', mapsource: 'source', querysource: 'source', 'query-source': 'source'
  };
  const type = aliases[String(value ?? '').trim().toLowerCase().replaceAll('_', '-')];
  return PERSISTENT_TYPES.has(type) ? type : null;
}

/** Resolve the storage key for a workspace entry from a string key, entry, reference, or datasource. */
function workspaceKey(value) {
  if (typeof value === 'string') return value.trim() || null;
  if (value?.key) return String(value.key);
  return normalizeWorkspaceValue(value?.dataSource ?? value?.reference ?? value)?.reference?.key ?? null;
}

/** Build a default display title from a reference and, when available, its resolved datasource. */
function defaultTitle(reference, dataSource) {
  if (dataSource) {
    const q = dataSource?.request?.q;
    return dataSourceTitle(dataSource, typeof q === 'string' ? q : 'Untitled search');
  }
  const label = { filter: 'Filter', recordtype: 'Record type', source: 'Source' }[reference.type] || 'Workspace item';
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

/** Extract the map-only presentation fields worth persisting locally (style/opacity/visible). */
function workspacePresentation(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const map = source.map && typeof source.map === 'object' && !Array.isArray(source.map) ? source.map : null;
  if (!map) return null;

  const result = {};
  if (map.style && typeof map.style === 'object') result.style = clone(map.style);
  if (map.opacity != null && Number.isFinite(Number(map.opacity))) result.opacity = Math.max(0, Math.min(1, Number(map.opacity)));
  if (typeof map.visible === 'boolean') result.visible = map.visible;
  return Object.keys(result).length ? { map: result } : null;
}

/** Recursively merge `override` into a clone of `base`. */
function merge(base, override) {
  const result = clone(base || {});
  for (const [key, value] of Object.entries(override || {})) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? merge(result[key] && typeof result[key] === 'object' ? result[key] : {}, value)
      : clone(value);
  }
  return result;
}
