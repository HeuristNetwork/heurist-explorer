import { cloneDataSource, dataSourceKey, dataSourceTitle, normalizeDataSource } from './DataSource.js';

const DEFAULT_LIMIT = 12;

/** Database-scoped, most-recently-used DataSource history. */
export class DataSourceHistory {
  constructor({ database, storage = null, limit = DEFAULT_LIMIT, clock = Date.now } = {}) {
    this.storage = storage ?? defaultStorage();
    this.limit = positiveInteger(limit) || DEFAULT_LIMIT;
    this.clock = typeof clock === 'function' ? clock : Date.now;
    this.storageKey = `heurist.explorer.${storageScope(database)}.history`;
  }

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

  list() {
    return clone(this._read());
  }

  remove(key) {
    const normalizedKey = entryKey(key);
    if (!normalizedKey) return false;
    const entries = this._read();
    const next = entries.filter((item) => item.key !== normalizedKey);
    if (next.length === entries.length) return false;
    this._write(next);
    return true;
  }

  clear() {
    safeRemove(this.storage, this.storageKey);
  }

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

  _write(entries) {
    safeSet(this.storage, this.storageKey, JSON.stringify(entries));
  }
}

function requestTitle(source) {
  const q = source?.request?.q;
  if (typeof q === 'string' && q.trim()) return q.trim();
  return 'Untitled search';
}
function entryKey(value) {
  if (typeof value === 'string') return value.trim() || null;
  return value?.key || dataSourceKey(value?.dataSource ?? value);
}
function storageScope(value) { return encodeURIComponent(text(value) || 'default'); }
function text(value) { return value == null ? '' : String(value).trim(); }
function finiteNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function positiveInteger(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
function safeParse(value) { try { return value ? JSON.parse(value) : []; } catch { return []; } }
function safeGet(storage, key) { try { return storage?.getItem?.(key) ?? null; } catch { return null; } }
function safeSet(storage, key, value) { try { storage?.setItem?.(key, value); } catch { /* storage may be unavailable */ } }
function safeRemove(storage, key) { try { storage?.removeItem?.(key); } catch { /* storage may be unavailable */ } }
function defaultStorage() { try { return globalThis.localStorage ?? null; } catch { return null; } }
function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
