/**
 * ReportTemplateProvider.js - Report template list loader for map configuration
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 */

export class ReportTemplateProvider {
  constructor({ baseUrl, database, fetchImpl = null } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.database = database == null ? null : String(database);
    this.fetchImpl = typeof fetchImpl === 'function' ? fetchImpl : (...args) => globalThis.fetch(...args);
  }

  isConfigured() { return Boolean(this.baseUrl && this.database); }

  async list({ signal } = {}) {
    if (!this.isConfigured()) return [];
    const url = new URL(this.baseUrl, globalThis.location?.href || 'http://localhost/');
    url.searchParams.set('db', this.database);
    url.searchParams.set('action', 'list');
    url.searchParams.set('controller', 'ReportController');
    const response = await this.fetchImpl(url, { credentials: 'same-origin', signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Report template list request failed (${response.status})`);
    const payload = await response.json();
    return normalizeTemplates(payload?.data ?? payload);
  }
}

function normalizeTemplates(value) {
  const source = Array.isArray(value) ? value
    : Array.isArray(value?.items) ? value.items
      : value && typeof value === 'object' ? Object.entries(value).map(([key, item]) =>
        item && typeof item === 'object' ? { key, ...item } : { value: key, label: item })
        : [];
  return source.map((item) => {
    if (typeof item === 'string') return { value: item, label: item };
    if (!item || typeof item !== 'object') return null;
    const value = item.value ?? item.name ?? item.filename ?? item.file ?? item.id ?? item.key;
    if (value == null || value === '') return null;
    const label = item.label ?? item.title ?? item.name ?? item.filename ?? String(value);
    return { value: String(value), label: String(label) };
  }).filter(Boolean);
}

function normalizeBaseUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.endsWith('/') ? text : `${text}/`;
}
