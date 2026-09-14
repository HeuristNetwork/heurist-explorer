import { normalizeDataSource } from './DataSource.js';

/** Loads saved-filter definitions and resolves them into runtime DataSources. */
export class SavedFilterManager {
  constructor({ apiClient, filterIds = null, classifyFilter = null } = {}) {
    if (!apiClient) throw new TypeError('SavedFilterManager requires apiClient');
    this.apiClient = apiClient;
    this.filterIds = normalizeIds(filterIds);
    this.classifyFilter = typeof classifyFilter === 'function' ? classifyFilter : null;
    this.filters = [];
    this._loadController = null;
  }

  async load() {
    this._loadController?.abort();
    this._loadController = new AbortController();
    const q = { t: 'filter', filterType: 'filter' };
    if (this.filterIds.length) q.ids = this.filterIds.join(',');
    const payload = await this.apiClient.get('/sys', {
      query: { q, fields: 'query,filterType' },
      signal: this._loadController.signal
    });
    const source = Array.isArray(payload) ? payload : payload?.items || payload?.filters || payload?.records || [];
    this.filters = source.map((value) => this._normalize(value)).filter(Boolean);
    return this.list();
  }

  list({ text = '', group = null, type = '' } = {}) {
    const search = String(text || '').trim().toLowerCase();
    const groupId = positiveId(group);
    const kind = String(type || '');
    return clone(this.filters.filter((filter) => {
      if (search && !filter.title.toLowerCase().includes(search)) return false;
      if (groupId && filter.ownerGroupId !== groupId) return false;
      return !kind || filter.kind === kind;
    }));
  }

  groups() {
    return [...new Set(this.filters.map((filter) => filter.ownerGroupId).filter(Boolean))].sort((a, b) => a - b);
  }

  async resolveDataSource(id, { origin = 'filter' } = {}) {
    const filter = await this._loadOne(id);
    if (!filter) return null;
    const request = executableRequest(filter.definition);
    if (isEmptySearchRequest(request)) return null;
    return normalizeDataSource({
      reference: { type: 'filter', id: filter.id },
      title: filter.title,
      request,
      presentation: {},
      meta: { origin }
    });
  }

  async _loadOne(id) {
    const filterId = positiveId(id);
    if (!filterId) return null;
    const value = await this.apiClient.get(`/sys/filter/${filterId}`);
    const fresh = this._normalize(value?.record ?? value);
    if (!fresh) return null;
    const index = this.filters.findIndex((item) => item.id === fresh.id);
    if (index >= 0) this.filters[index] = fresh;
    else this.filters.push(fresh);
    return clone(fresh);
  }

  _normalize(value) {
    const id = positiveId(value?.rec_ID ?? value?.id ?? value?.svs_ID);
    if (!id) return null;
    const details = value?.details || {};
    const query = detailValue(details, 'query') ?? value?.query ?? null;
    const storedType = detailValue(details, 'filterType') ?? value?.filterType ?? null;
    const definition = parseSavedFilterDefinition(query);
    const kind = this.classifyFilter
      ? this.classifyFilter(value, definition)
      : inferFilterKind(value, definition);
    return {
      id,
      title: String(value?.rec_Title ?? value?.title ?? `Filter ${id}`),
      ownerGroupId: positiveId(value?.rec_OwnerUGrpID ?? value?.ownerGroupId ?? value?.svs_UGrpID),
      query,
      definition,
      storedType,
      kind,
      raw: value
    };
  }

  destroy() {
    this._loadController?.abort();
  }
}

/** Normalize persisted saved-filter JSON. */
export function parseSavedFilterDefinition(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return clone(value);
  const text = String(value ?? '').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { q: text };
  } catch {
    return { q: text };
  }
}

export function executableRequest(definition) {
  const value = definition || {};
  const request = {};
  if (value.q !== undefined) request.q = value.q;
  if (value.query !== undefined && request.q === undefined) request.q = value.query;
  if (value.rules !== undefined && value.rules !== null) request.rules = value.rules;
  if (value.rulesonly !== undefined && value.rulesonly !== null) request.rulesonly = value.rulesonly;
  if (value.w !== undefined && value.w !== null && value.w !== '') request.w = value.w;
  if (value.filter !== undefined && value.filter !== null && value.filter !== '') request.filter = value.filter;
  if (value.sort !== undefined && value.sort !== null && value.sort !== '') request.sort = value.sort;
  return request;
}

export function isEmptySearchRequest(request) {
  const q = request?.q;
  const qEmpty = q == null || q === '' || (typeof q === 'object' && !Array.isArray(q) && Object.keys(q).length === 0);
  const rulesEmpty = request?.rules == null || request.rules === '' || (Array.isArray(request.rules) && request.rules.length === 0);
  return qEmpty && rulesEmpty;
}

function inferFilterKind(value, definition) {
  const explicit = value?.kind ?? value?.parameterized ?? value?.parametrized
    ?? definition?.filterKind ?? definition?.parameterized ?? definition?.parametrized;
  return explicit === true || ['parametrized', 'parameterized'].includes(String(explicit).toLowerCase())
    ? 'parametrized' : 'simple';
}
function detailValue(details, field) {
  const values = details?.[field];
  return Array.isArray(values) && values.length ? values[0]?.value ?? null : null;
}
function positiveId(value) { const id = Number(value); return Number.isInteger(id) && id > 0 ? id : null; }
function normalizeIds(value) {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(items.map(positiveId).filter(Boolean))];
}
function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
