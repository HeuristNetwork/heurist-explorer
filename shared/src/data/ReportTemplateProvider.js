/**
 * @file ReportTemplateProvider.js
 * @brief Smarty report templates offered for record popups, cards and Record view.
 *
 * Lists the single-record (card) reports of `/api/{db}/report`: every Custom Report record
 * with "Is card view" = Yes that the user can see. Values are record ids; `file` is the
 * template name older module configurations stored (plan 30). When the report
 * record types are not installed in the database, or the API is not available,
 * all template files of the legacy ReportController are listed instead.
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

/** Lists report templates as `{value, label}` options. */
export class ReportTemplateProvider {
  /**
   * @param {object} [options] Provider configuration.
   * @param {string} [options.baseUrl] Heurist base URL (the API is `<baseUrl>api/<db>/`); normalized to end in `/`.
   * @param {string|number} [options.database] Target Heurist database name.
   * @param {Function|null} [options.fetchImpl] Fetch implementation to use instead of the global `fetch`.
   */
  constructor({ baseUrl, database, fetchImpl = null } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.database = database == null ? null : String(database);
    this.fetchImpl = typeof fetchImpl === 'function' ? fetchImpl : (...args) => globalThis.fetch(...args);
  }

  /** Whether the provider has both a base URL and a database. */
  isConfigured() {
    return Boolean(this.baseUrl && this.database);
  }

  /**
   * Card report templates, or all legacy template files when report records are not installed.
   *
   * @param {{signal?: AbortSignal}} [options] Request options.
   * @returns {Promise<Array<{value: string, label: string}>>}
   */
  async list({ signal } = {}) {
    if (!this.isConfigured()) return [];
    let payload = null;
    try {
      payload = await this._json(this._apiUrl('report', { fields: 'rec_ID,rec_Title', limit: '5000' }), signal);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      payload = null; // report records are not installed: legacy list below
    }
    if (Array.isArray(payload?.records)) return reportOptions(payload.meta?.items);
    return this._legacyList(signal);
  }

  /** All template files from the legacy ReportController. */
  async _legacyList(signal) {
    const url = new URL(this.baseUrl, globalThis.location?.href || 'http://localhost/');
    url.searchParams.set('db', this.database);
    url.searchParams.set('action', 'list');
    url.searchParams.set('controller', 'ReportController');
    const payload = await this._json(url, signal);
    return normalizeTemplates(payload?.data ?? payload);
  }

  /** Fetch JSON or throw. */
  async _json(url, signal) {
    const response = await this.fetchImpl(url, {
      credentials: 'same-origin',
      signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Report template list request failed (${response.status})`);
    return response.json();
  }

  /** URL below `<baseUrl>api/<db>/`. */
  _apiUrl(path, query = {}) {
    const url = new URL(`api/${encodeURIComponent(this.database)}/${path}`,
      new URL(this.baseUrl, globalThis.location?.href || 'http://localhost/'));
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    return url;
  }
}

/**
 * Options of the card reports: value = record id (the API runs a report by its id, plan 30), label = title,
 * `file` = template name without ".tpl", the form stored in older module configurations.
 */
function reportOptions(items) {
  return Object.values(items || {})
    .filter((report) => report?.isCardView && report?.file)
    .sort((a, b) => String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' }))
    .map((report) => ({
      value: String(report.id),
      label: String(report.title || report.file),
      file: String(report.file).replace(/\.tpl$/i, '')
    }));
}

/** Normalize a legacy ReportController list payload (array, object, or map) into `{value, label}` entries. */
export function normalizeTemplates(value) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(value?.items)
      ? value.items
      : value && typeof value === 'object'
        ? Object.entries(value).map(([key, item]) => (item && typeof item === 'object' ? { key, ...item } : { value: key, label: item }))
        : [];
  return source
    .map((item) => {
      if (typeof item === 'string') return { value: item, label: item };
      const optionValue = item?.value ?? item?.name ?? item?.filename ?? item?.file ?? item?.id ?? item?.key;
      return optionValue == null || optionValue === ''
        ? null
        : { value: String(optionValue), label: String(item.label ?? item.title ?? item.name ?? item.filename ?? optionValue) };
    })
    .filter(Boolean);
}

/** Normalize a base URL to end in `/`, or `null` when blank. */
function normalizeBaseUrl(value) {
  const text = String(value || '').trim();
  return text ? (text.endsWith('/') ? text : `${text}/`) : null;
}
