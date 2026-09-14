/**
 * PopupProvider.js - Lazy Heurist map popup HTML loader
 *
 * Builds the legacy-compatible Heurist popup URLs and fetches popup HTML only
 * when a rendered feature is clicked.
 *
 * @project     Heurist mapping application
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 */

export class PopupProvider {
  constructor({ baseUrl, database, fetchImpl = null } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.database = database == null ? null : String(database);
    this.fetchImpl = typeof fetchImpl === 'function' ? fetchImpl : (...args) => globalThis.fetch(...args);
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.database && typeof this.fetchImpl === 'function');
  }

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

function normalizeBaseUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.endsWith('/') ? text : `${text}/`;
}

function nullableString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}


export function normalizePopupMode(value) {
  const text = nullableString(value);
  if (!text) return 'standard';
  const lower = text.toLowerCase();
  if (lower === 'none' || lower === 'minimal' || lower === 'standard') return lower;
  return text;
}

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


function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\"', '&quot;')
    .replaceAll("'", '&#39;');
}
