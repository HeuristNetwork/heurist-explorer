/**
 * Browser-local Heurist record collection shared by same-origin client modules.
 *
 * The collection is deliberately independent of legacy window.hWin/HAPI4.
 * Storage is keyed by database so Explorer, Data, Map, Timeline and Graph may
 * read and update the same collection directly without an iframe bridge.
 */
export class HCollection {
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

  get storageKey() {
    return `${this.storagePrefix}${this.database}`;
  }

  get() {
    if (!this.storage) return [];
    try {
      const value = JSON.parse(this.storage.getItem(this.storageKey) || '[]');
      return normalizeIds(value);
    } catch {
      return [];
    }
  }

  add(recordIds) {
    const next = [...new Set([...this.get(), ...normalizeIds(recordIds)])];
    return this._store(next);
  }

  remove(recordIds) {
    const remove = new Set(normalizeIds(recordIds));
    return this._store(this.get().filter((id) => !remove.has(id)));
  }

  clear() {
    return this._store([]);
  }

  replace(recordIds) {
    return this._store(normalizeIds(recordIds));
  }

  subscribe(handler, { immediate = false } = {}) {
    if (typeof handler !== 'function') return () => {};
    this._subscribers.add(handler);
    if (immediate) handler(this.get());
    return () => this._subscribers.delete(handler);
  }

  destroy() {
    this.eventTarget?.removeEventListener?.('storage', this._onStorage);
    this.eventTarget?.removeEventListener?.(this.eventName, this._onCollectionEvent);
    this._subscribers.clear();
  }

  _store(ids) {
    const normalized = normalizeIds(ids);
    if (!this.storage) return normalized;
    this.storage.setItem(this.storageKey, JSON.stringify(normalized));
    this._notify(normalized, { external: false });
    return normalized;
  }

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

  _notifySubscribers(ids, meta) {
    const snapshot = [...ids];
    for (const handler of this._subscribers) handler(snapshot, meta);
  }
}

function normalizeIds(value) {
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(list
    .map((id) => String(id).trim())
    .filter((id) => /^\d+$/.test(id) && Number(id) > 0))];
}

function createCollectionEvent(name, detail) {
  if (typeof CustomEvent === 'function') return new CustomEvent(name, { detail });
  const event = typeof Event === 'function' ? new Event(name) : { type: name };
  try { Object.defineProperty(event, 'detail', { value: detail }); } catch { event.detail = detail; }
  return event;
}

export function normalizeCollectionIds(value) {
  return normalizeIds(value);
}
