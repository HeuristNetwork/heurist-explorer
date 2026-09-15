/**
 * @file ReportTemplateProvider.js
 * @brief Report template list loader for map configuration.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-map
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Provides configured report templates for popup configuration. */
export class ReportTemplateProvider {
  /**
   * @param {object} options Provider configuration.
   * @param {string} options.baseUrl Legacy Heurist base URL the ReportController endpoint is relative to.
   * @param {string} options.database Target Heurist database name.
   * @param {Function|null} [options.fetchImpl] Fetch implementation to use instead of the global `fetch`.
   */
  constructor({ baseUrl, database, fetchImpl = null } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.database = database == null ? null : String(database);
    this.fetchImpl = typeof fetchImpl === 'function' ? fetchImpl : (...args) => globalThis.fetch(...args);
  }

  /** Whether the provider has both a base URL and a database, and can list templates. */
  isConfigured() { return Boolean(this.baseUrl && this.database); }

  /**
   * List configured report templates.
   *
   * @param {{signal?: AbortSignal}} [options] Request options.
   * @returns {Promise<Array<{value: string, label: string}>>} Templates, or `[]` when unconfigured.
   * @throws {Error} When the list request fails.
   */
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

/** Normalize the ReportController's template list payload (array or key-value map) to `{value, label}` entries. */
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

/** Ensure a base URL has exactly one trailing slash, or return `null` when empty. */
function normalizeBaseUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.endsWith('/') ? text : `${text}/`;
}
