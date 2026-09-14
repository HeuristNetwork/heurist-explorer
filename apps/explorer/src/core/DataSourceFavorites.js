const REFERENCE_ALIASES = Object.freeze({
  filter: 'filter', recordtype: 'recordtype', rectype: 'recordtype', source: 'source',
  querysource: 'source', 'query-source': 'source', dataset: 'source', mapsource: 'source', 'map-source': 'source'
});

/** Database-scoped persistent references displayed as Explorer Favorites. */
export class DataSourceFavorites {
  constructor({ database, storage = null, clock = Date.now, resolver = null } = {}) {
    this.storage = storage ?? defaultStorage();
    this.clock = typeof clock === 'function' ? clock : Date.now;
    this.resolver = typeof resolver === 'function' ? resolver : null;
    this.storageKey = `heurist.explorer.${storageScope(database)}.favorites`;
  }

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

  remove(value) {
    const key = favoriteKey(value);
    if (!key) return false;
    const entries = this._read();
    const next = entries.filter((item) => item.key !== key);
    if (next.length === entries.length) return false;
    this._write(next);
    return true;
  }

  has(value) {
    const key = favoriteKey(value);
    return Boolean(key && this._read().some((item) => item.key === key));
  }

  list() {
    return clone(this._read());
  }

  clear() {
    safeRemove(this.storage, this.storageKey);
  }

  async resolve(value) {
    const reference = normalizeReference(value?.reference ?? value);
    if (!reference || !this.resolver) return null;
    return this.resolver(clone(reference));
  }

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

  _write(entries) {
    safeSet(this.storage, this.storageKey, JSON.stringify(entries));
  }
}

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
function favoriteKey(value) {
  if (typeof value === 'string') return value.trim() || null;
  return normalizeReference(value?.reference ?? value)?.key ?? value?.key ?? null;
}
function defaultTitle(reference) {
  const label = { filter: 'Filter', source: 'Source', recordtype: 'Record type' }[reference.type] || 'Favorite';
  return `${label} ${reference.id}`;
}
function positiveId(value) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }
function storageScope(value) { return encodeURIComponent(text(value) || 'default'); }
function text(value) { return value == null ? '' : String(value).trim(); }
function finiteNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function safeParse(value) { try { return value ? JSON.parse(value) : []; } catch { return []; } }
function safeGet(storage, key) { try { return storage?.getItem?.(key) ?? null; } catch { return null; } }
function safeSet(storage, key, value) { try { storage?.setItem?.(key, value); } catch { /* storage may be unavailable */ } }
function safeRemove(storage, key) { try { storage?.removeItem?.(key); } catch { /* storage may be unavailable */ } }
function defaultStorage() { try { return globalThis.localStorage ?? null; } catch { return null; } }
function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
