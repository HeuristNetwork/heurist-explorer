import { normalizeDataSource } from './DataSource.js';

const RECORD_TYPE_ICON_TOKEN = Date.now();

/** Loads record-type usage counts and joins them to the definition snapshot. */
export class RecordTypeManager {
  constructor({ apiClient, dbDefsProvider, baseUrl = '', database = '' } = {}) {
    if (!apiClient) throw new TypeError('RecordTypeManager requires apiClient');
    if (typeof dbDefsProvider !== 'function') {
      throw new TypeError('RecordTypeManager requires dbDefsProvider');
    }
    this.apiClient = apiClient;
    this.dbDefsProvider = dbDefsProvider;
    this.baseUrl = String(baseUrl || '');
    this.database = String(database || '');
    this.recordTypes = [];
    this.dbDefs = null;
    this._loadController = null;
  }

  async load() {
    this._loadController?.abort();
    this._loadController = new AbortController();
    const [payload, dbDefs] = await Promise.all([
      this.apiClient.get('/records/', {
        query: { detail: 'rectypes' },
        signal: this._loadController.signal
      }),
      this.dbDefsProvider()
    ]);
    this.dbDefs = dbDefs;
    const definitions = new Map(dbDefs.rectypes().map((item) => [item.id, item]));
    const groups = new Map(dbDefs.rectypeGroups().map((item, index) => [item.id, { ...item, index }]));
    this.recordTypes = normalizeCounts(payload?.rectypes).map(({ id, count }) => {
      const definition = definitions.get(id);
      const groupId = definition?.group ?? null;
      const group = groups.get(groupId);
      return {
        id,
        title: String(definition?.name || `Record type ${id}`),
        plural: String(definition?.plural || definition?.name || `Record type ${id}`),
        count,
        groupId,
        groupName: String(group?.name || 'Ungrouped'),
        groupOrder: Number(group?.order ?? group?.index ?? Number.MAX_SAFE_INTEGER),
        iconUrl: this.iconUrl(id)
      };
    });
    return this.list();
  }

  /** Return record types sorted by descending usage or localized name. */
  list({ sort = 'usage' } = {}) {
    const byName = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    const items = [...this.recordTypes];
    items.sort(sort === 'name'
      ? byName
      : (a, b) => b.count - a.count || byName(a, b));
    return clone(items);
  }

  get(id) {
    const recordTypeId = positiveId(id);
    const item = this.recordTypes.find((value) => value.id === recordTypeId);
    return item ? clone(item) : null;
  }

  groups() {
    const found = new Map();
    for (const item of this.recordTypes) {
      const key = item.groupId == null ? 'ungrouped' : String(item.groupId);
      if (!found.has(key)) {
        found.set(key, {
          id: item.groupId,
          name: item.groupName,
          order: item.groupOrder
        });
      }
    }
    return [...found.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  resolveDataSource(id, { origin = 'recordtype' } = {}) {
    const item = this.get(id);
    if (!item) return null;
    return normalizeDataSource({
      reference: { type: 'recordtype', id: item.id },
      title: item.title,
      request: { q: `t:${item.id}` },
      presentation: {},
      meta: { origin, count: item.count }
    });
  }

  iconUrl(id) {
    const recordTypeId = positiveId(id);
    if (!recordTypeId || !this.baseUrl) return '';
    const root = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    return `${root}?db=${encodeURIComponent(this.database)}&icon=${recordTypeId}`
      + `&t=${RECORD_TYPE_ICON_TOKEN}`;
  }

  destroy() {
    this._loadController?.abort();
  }
}

function normalizeCounts(value) {
  const rows = Array.isArray(value)
    ? value
    : Object.entries(value && typeof value === 'object' ? value : {}).map(([id, count]) => (
      count && typeof count === 'object' ? { ...count, rec_RecTypeID: count.rec_RecTypeID ?? id } : { rec_RecTypeID: id, count }
    ));
  const result = [];
  const seen = new Set();
  for (const row of rows) {
    const id = positiveId(row?.rec_RecTypeID ?? row?.id ?? row?.rty_ID);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, count: Math.max(0, Number(row?.count) || 0) });
  }
  return result;
}

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
