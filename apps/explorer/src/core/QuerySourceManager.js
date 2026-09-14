import { normalizeDataSource } from './DataSource.js';

/** Loads RT_QUERY_SOURCE records and resolves their presentation definition. */
export class QuerySourceManager {
  constructor({ apiClient, dbDefsProvider } = {}) {
    if (!apiClient) throw new TypeError('QuerySourceManager requires apiClient');
    if (typeof dbDefsProvider !== 'function') {
      throw new TypeError('QuerySourceManager requires dbDefsProvider');
    }
    this.apiClient = apiClient;
    this.dbDefsProvider = dbDefsProvider;
    this.sources = [];
    this.recordTypeId = null;
    this._loadController = null;
  }

  async load() {
    this._loadController?.abort();
    this._loadController = new AbortController();
    const dbDefs = await this.dbDefsProvider();
    this.recordTypeId = positiveId(dbDefs?.dbconst?.('RT_QUERY_SOURCE'));

    if (!this.recordTypeId) {
      this.sources = [];
      return [];
    }
    const payload = await this.apiClient.get('/records/', {
      query: { q: `t:${this.recordTypeId}`, limit: 100000 },
      signal: this._loadController.signal
    });
    const rows = Array.isArray(payload) ? payload : payload?.items || payload?.records || [];
    this.sources = rows.map(normalizeListItem).filter(Boolean);
    return this.list();
  }

  list({ text = '' } = {}) {
    const search = String(text || '').trim().toLowerCase();
    const values = search
      ? this.sources.filter((item) => item.title.toLowerCase().includes(search))
      : this.sources;
    return clone(values).sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  }

  get(id) {
    const sourceId = positiveId(id);
    const item = this.sources.find((value) => value.id === sourceId);
    return item ? clone(item) : null;
  }

  async resolveDataSource(id, { origin = 'source' } = {}) {
    const sourceId = positiveId(id);
    if (!sourceId) return null;
    const payload = await this.apiClient.get(`/records/dataset/${sourceId}`);
    if (!payload || positiveId(payload.id) !== sourceId) return null;
    const query = payload?.source?.query;
    if (query == null || query === '') return null;
    const request = { q: clone(query) };
    if (Array.isArray(payload.rules) && payload.rules.length) request.rules = clone(payload.rules);
    const map = payload.map && typeof payload.map === 'object' ? payload.map : {};
    const dataSource = normalizeDataSource({
      reference: { type: 'source', id: sourceId },
      title: payload.title || payload?.source?.title || this.get(sourceId)?.title,
      request,
      presentation: {
        data: { fields: clone(payload.fields || []) },
        map: {
          geoFields: fieldPaths(map.geoFields ?? payload.geofields),
          dynamicRequests: map.dynamicRequests === true,
          minZoom: finiteNumberOrNull(map.minZoom),
          maxZoom: finiteNumberOrNull(map.maxZoom)
        },
        timeline: { fields: fieldPaths(payload.timefields) },
        graph: null,
        filterForm: null
      },
      meta: { origin }
    });
    const item = { id: sourceId, title: dataSource.title || `Source ${sourceId}` };
    const index = this.sources.findIndex((value) => value.id === sourceId);
    if (index < 0) this.sources.push(item);
    else this.sources[index] = { ...this.sources[index], ...item };
    return dataSource;
  }

  destroy() { this._loadController?.abort(); }
}

function normalizeListItem(value) {
  const id = positiveId(value?.rec_ID ?? value?.id);
  if (!id) return null;
  return { id, title: String(value?.rec_Title ?? value?.title ?? `Source ${id}`) };
}
function fieldPaths(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => typeof value === 'object' ? value.field ?? value.code : value)
    .map((value) => String(value || '').trim()).filter(Boolean);
}
function positiveId(value) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }
function finiteNumberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function clone(value) { return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
