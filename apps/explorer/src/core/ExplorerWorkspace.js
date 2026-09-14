import { cloneDataSource, dataSourceKey, dataSourceTitle, normalizeDataSource } from './DataSource.js';

const PERSISTENT_TYPES = new Set(['filter', 'recordtype', 'source']);

/** Database-scoped collection of DataSources deliberately retained by the user. */
export class ExplorerWorkspace {
  constructor({ database, storage = null, clock = Date.now, resolver = null } = {}) {
    this.storage = storage ?? defaultStorage();
    this.clock = typeof clock === 'function' ? clock : Date.now;
    this.resolver = typeof resolver === 'function' ? resolver : null;
    this.storageKey = `heurist.explorer.${storageScope(database)}.workspace`;
  }

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

  remove(value) {
    const key = workspaceKey(value);
    if (!key) return false;
    const entries = this._read();
    const next = entries.filter((item) => item.key !== key);
    if (next.length === entries.length) return false;
    this._write(next);
    return true;
  }

  has(value) {
    const key = workspaceKey(value);
    return Boolean(key && this._read().some((item) => item.key === key));
  }

  list() {
    return clone(this._read());
  }

  get(value) {
    const key = workspaceKey(value);
    const entry = key ? this._read().find((item) => item.key === key) : null;
    return entry ? clone(entry) : null;
  }

  /** Persist module-owned presentation state without changing source identity. */
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

  clear() {
    safeRemove(this.storage, this.storageKey);
  }

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

  _write(entries) {
    safeSet(this.storage, this.storageKey, JSON.stringify(entries));
  }
}

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

function normalizePersistentType(value) {
  const aliases = {
    filter: 'filter', recordtype: 'recordtype', rectype: 'recordtype', source: 'source',
    dataset: 'source', mapsource: 'source', querysource: 'source', 'query-source': 'source'
  };
  const type = aliases[String(value ?? '').trim().toLowerCase().replaceAll('_', '-')];
  return PERSISTENT_TYPES.has(type) ? type : null;
}

function workspaceKey(value) {
  if (typeof value === 'string') return value.trim() || null;
  if (value?.key) return String(value.key);
  return normalizeWorkspaceValue(value?.dataSource ?? value?.reference ?? value)?.reference?.key ?? null;
}

function defaultTitle(reference, dataSource) {
  if (dataSource) {
    const q = dataSource?.request?.q;
    return dataSourceTitle(dataSource, typeof q === 'string' ? q : 'Untitled search');
  }
  const label = { filter: 'Filter', recordtype: 'Record type', source: 'Source' }[reference.type] || 'Workspace item';
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

function merge(base, override) {
  const result = clone(base || {});
  for (const [key, value] of Object.entries(override || {})) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? merge(result[key] && typeof result[key] === 'object' ? result[key] : {}, value)
      : clone(value);
  }
  return result;
}
