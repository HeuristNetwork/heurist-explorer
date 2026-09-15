/**
 * @file HCollection.js
 * @brief Browser-local Heurist record collection shared by same-origin client modules.
 *
 * The collection is deliberately independent of legacy window.hWin/HAPI4.
 * Storage is keyed by database so Explorer, Data, Map, Timeline and Graph may
 * read and update the same collection directly without an iframe bridge.
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

/** A record-ID collection persisted in browser storage and synchronized across same-origin modules. */
export class HCollection {
  /**
   * @param {object} options Collection configuration.
   * @param {string} options.database Heurist database name; namespaces the storage key.
   * @param {Storage} [options.storage] Storage backend; defaults to `localStorage`.
   * @param {EventTarget} [options.eventTarget] Event target used for cross-module notifications; defaults to `window`.
   */
  constructor({ database, storage = globalThis.localStorage, eventTarget = globalThis.window } = {}) {
    this.database = String(database || '');
    if (!this.database) throw new Error('HCollection requires a database name');
    this.storage = storage || null;
    this.eventTarget = eventTarget || null;
    this.storagePrefix = 'heurist-record-collection:';
    this.eventName = 'heurist-collection-changed';
    this.instanceId = `collection-${Math.random().toString(36).slice(2)}`;
    this._subscribers = new Set();
    this._onStorage = (event) => {
      if (event?.key !== this.storageKey) return;
      this._notify(this.get(), { external: true });
    };
    this._onCollectionEvent = (event) => {
      const detail = event?.detail || {};
      if (detail.database !== this.database || detail.sourceId === this.instanceId) return;
      this._notifySubscribers(detail.collection || [], { external: true });
    };
    this.eventTarget?.addEventListener?.('storage', this._onStorage);
    this.eventTarget?.addEventListener?.(this.eventName, this._onCollectionEvent);
  }

  /** Storage key this collection reads and writes, namespaced by database. */
  get storageKey() {
    return `${this.storagePrefix}${this.database}`;
  }

  /**
   * Read the current collection from storage.
   *
   * @returns {Array<number>} Current record IDs, or an empty array when unavailable or invalid.
   */
  get() {
    if (!this.storage) return [];
    try {
      const value = JSON.parse(this.storage.getItem(this.storageKey) || '[]');
      return normalizeIds(value);
    } catch {
      return [];
    }
  }

  /**
   * Add record IDs to the collection.
   *
   * @param {number|string|Array<number|string>} recordIds Record ID(s) to add.
   * @returns {Array<number>} Updated collection.
   */
  add(recordIds) {
    const next = [...new Set([...this.get(), ...normalizeIds(recordIds)])];
    return this._store(next);
  }

  /**
   * Remove record IDs from the collection.
   *
   * @param {number|string|Array<number|string>} recordIds Record ID(s) to remove.
   * @returns {Array<number>} Updated collection.
   */
  remove(recordIds) {
    const remove = new Set(normalizeIds(recordIds));
    return this._store(this.get().filter((id) => !remove.has(id)));
  }

  /**
   * Remove all record IDs from the collection.
   *
   * @returns {Array<number>} Updated (empty) collection.
   */
  clear() {
    return this._store([]);
  }

  /**
   * Replace the entire collection with the given record IDs.
   *
   * @param {Array<number|string>} recordIds New collection contents.
   * @returns {Array<number>} Updated collection.
   */
  replace(recordIds) {
    return this._store(normalizeIds(recordIds));
  }

  /**
   * Subscribe to collection changes, whether made locally or by another same-origin module.
   *
   * @param {function(Array<number>, {external: boolean}): void} handler Called with the new collection and change metadata.
   * @param {{immediate?: boolean}} [options] Pass `immediate: true` to call `handler` once with the current collection.
   * @returns {function(): void} Unsubscribe function.
   */
  subscribe(handler, { immediate = false } = {}) {
    if (typeof handler !== 'function') return () => {};
    this._subscribers.add(handler);
    if (immediate) handler(this.get());
    return () => this._subscribers.delete(handler);
  }

  /**
   * Detach storage/event listeners and clear subscribers.
   *
   * @returns {void}
   */
  destroy() {
    this.eventTarget?.removeEventListener?.('storage', this._onStorage);
    this.eventTarget?.removeEventListener?.(this.eventName, this._onCollectionEvent);
    this._subscribers.clear();
  }

  /**
   * Persist a normalized collection and notify local and cross-module subscribers.
   *
   * @private
   * @param {Array<number|string>} ids Collection to persist.
   * @returns {Array<number>} Normalized, stored collection.
   */
  _store(ids) {
    const normalized = normalizeIds(ids);
    if (!this.storage) return normalized;
    this.storage.setItem(this.storageKey, JSON.stringify(normalized));
    this._notify(normalized, { external: false });
    return normalized;
  }

  /**
   * Notify local subscribers and broadcast a cross-module collection-changed event.
   *
   * @private
   * @param {Array<number>} ids Current collection.
   * @param {object} meta Change metadata merged into the broadcast event detail.
   * @returns {void}
   */
  _notify(ids, meta) {
    const snapshot = [...ids];
    this._notifySubscribers(snapshot, meta);
    this.eventTarget?.dispatchEvent?.(createCollectionEvent(this.eventName, {
      database: this.database,
      collection: snapshot,
      sourceId: this.instanceId,
      ...meta,
    }));
  }

  /**
   * Call every local subscriber with the current collection.
   *
   * @private
   * @param {Array<number>} ids Current collection.
   * @param {object} meta Change metadata.
   * @returns {void}
   */
  _notifySubscribers(ids, meta) {
    const snapshot = [...ids];
    for (const handler of this._subscribers) handler(snapshot, meta);
  }
}

/** Normalize a value into a de-duplicated array of positive-integer-like ID strings, parsed to numbers. */
function normalizeIds(value) {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(list
    .map((id) => String(id).trim())
    .filter((id) => /^\d+$/.test(id) && Number(id) > 0))];
}

/** Create a CustomEvent (or a best-effort fallback) carrying the given detail payload. */
function createCollectionEvent(name, detail) {
  if (typeof CustomEvent === 'function') return new CustomEvent(name, { detail });
  const event = typeof Event === 'function' ? new Event(name) : { type: name };
  try { Object.defineProperty(event, 'detail', { value: detail }); } catch { event.detail = detail; }
  return event;
}

/**
 * Normalize a value into a de-duplicated array of positive record IDs.
 *
 * @param {*} value Value to normalize.
 * @returns {Array<number>} Normalized record IDs.
 */
export function normalizeCollectionIds(value) {
  return normalizeIds(value);
}
