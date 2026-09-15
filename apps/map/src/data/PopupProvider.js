/**
 * @file PopupProvider.js
 * @brief Lazy Heurist map popup HTML loader.
 *
 * Builds the legacy-compatible Heurist popup URLs and fetches popup HTML only
 * when a rendered feature is clicked.
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

/** Lazily loads Heurist record-popup HTML for a clicked map feature. */
export class PopupProvider {
  /**
   * @param {object} options Provider configuration.
   * @param {string} options.baseUrl Legacy Heurist base URL popup endpoints are relative to.
   * @param {string} options.database Target Heurist database name.
   * @param {Function|null} [options.fetchImpl] Fetch implementation to use instead of the global `fetch`.
   */
  constructor({ baseUrl, database, fetchImpl = null } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.database = database == null ? null : String(database);
    this.fetchImpl = typeof fetchImpl === 'function' ? fetchImpl : (...args) => globalThis.fetch(...args);
  }

  /** Whether the provider has a base URL, database, and fetch implementation configured. */
  isConfigured() {
    return Boolean(this.baseUrl && this.database && typeof this.fetchImpl === 'function');
  }

  /**
   * Build the popup content URL for a record and template, or `null` for a mode needing no fetch.
   *
   * @param {number|string} recordId Heurist record ID.
   * @param {string|null} [template] Popup mode/template; see `normalizePopupMode`.
   * @returns {string|null} Popup URL, or `null` for `'none'`/`'minimal'` modes.
   * @throws {Error} When the provider is unconfigured, or `recordId` is invalid.
   */
  buildUrl(recordId, template = null) {
    if (!this.isConfigured()) throw new Error('Heurist popup provider is not configured');
    const id = Number(recordId);
    if (!(id > 0)) throw new Error('A valid Heurist record ID is required for a map popup');

    const mode = normalizePopupMode(template);
    if (mode === 'none' || mode === 'minimal') return null;
    const templateName = mode === 'standard' ? null : mode;
    if (templateName) {
      const url = new URL(this.baseUrl, globalThis.location?.href || 'http://localhost/');
      url.searchParams.set('snippet', '1');
      url.searchParams.set('publish', '1');
      url.searchParams.set('debug', '0');
      url.searchParams.set('q', `ids:${id}`);
      url.searchParams.set('db', this.database);
      url.searchParams.set('template', templateName);
      return url.toString();
    }

    const url = new URL('viewers/record/renderRecordData.php', this.baseUrl);
    url.searchParams.set('mapPopup', '1');
    url.searchParams.set('recID', String(id));
    url.searchParams.set('db', this.database);
    return url.toString();
  }

  /**
   * Load popup content for a record: fetched HTML for a template, a built-in minimal card, or `null` when disabled.
   *
   * @param {number|string} recordId Heurist record ID.
   * @param {{template?: string|null, signal?: AbortSignal, properties?: object|null}} [options] Load options; `properties` seeds the minimal popup.
   * @returns {Promise<string|null>} Popup HTML, or `null` when popups are disabled for this mode.
   * @throws {Error} When the popup request fails.
   */
  async load(recordId, { template = null, signal, properties = null } = {}) {
    const mode = normalizePopupMode(template);
    if (mode === 'none') return null;
    if (mode === 'minimal') return buildMinimalPopup(properties);

    const url = this.buildUrl(recordId, mode);
    const response = await this.fetchImpl(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'text/html, */*;q=0.8' },
      signal
    });
    if (!response.ok) throw new Error(`Map popup request failed (${response.status})`);
    return response.text();
  }
}

/** Ensure a base URL has exactly one trailing slash, or return `null` when empty. */
function normalizeBaseUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.endsWith('/') ? text : `${text}/`;
}

/** Trim a value to text, returning `null` for `null`/`undefined`/empty. */
function nullableString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

/**
 * Normalize a popup mode/template value to `'standard'`, `'none'`, `'minimal'`, or a report template name.
 *
 * @param {*} value Raw popup mode/template value.
 * @returns {string} Normalized mode.
 */
export function normalizePopupMode(value) {
  const text = nullableString(value);
  if (!text) return 'standard';
  const lower = text.toLowerCase();
  if (lower === 'none' || lower === 'minimal' || lower === 'standard') return lower;
  return text;
}

/**
 * Build the built-in minimal popup card HTML from a feature's properties.
 *
 * @param {object|null} [properties] Feature properties (record id/title, or arbitrary key/value pairs).
 * @returns {string} Popup HTML.
 */
export function buildMinimalPopup(properties = null) {
  const props = properties && typeof properties === 'object' ? properties : {};

  if (props.rec_ID !== null && props.rec_ID !== undefined
      && String(props.rec_ID).trim() !== ''
      && props.rec_Title !== null && props.rec_Title !== undefined
      && String(props.rec_Title).trim() !== '') {
    return `<div class="heurist-map-popup-minimal"><div><strong>${escapeHtml(props.rec_Title)}</strong></div><div>ID: ${escapeHtml(props.rec_ID)}</div></div>`;
  }

  const propertiesHtml = buildPropertiesHtml(props);
  return `<div class="heurist-map-popup-minimal">${propertiesHtml}</div>`;
}

/** Build an HTML block listing up to 10 non-internal properties, or `''` when there are none. */
function buildPropertiesHtml(properties) {
  if (!properties || typeof properties !== 'object') return '';
  const rows = [];
  for (const [key, value] of Object.entries(properties)) {
    if (key === 'heurist' || key === 'thematic') continue;
    rows.push([key, value]);
    if (rows.length >= 10) break;
  }
  if (!rows.length) return '';
  const html = rows.map(([key, value]) =>
    `<div class="heurist-map-popup-property"><strong>${escapeHtml(key)}</strong> ${escapeHtml(formatPropertyValue(value))}</div>`
  ).join('');
  return `<div class="heurist-map-popup-properties">${html}</div>`;
}

/** Format a property value for display: strings as-is, primitives stringified, objects JSON-stringified. */
function formatPropertyValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Escape HTML-significant characters in a string for safe interpolation into markup. */
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\"', '&quot;')
    .replaceAll("'", '&#39;');
}
