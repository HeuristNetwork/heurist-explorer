/**
 * @file WebsiteClient.js
 * @brief Client of the entities website and page (`/api/{db}/website/...`, `/api/{db}/page/...`,
 *        plans 27b / 27d): setup status, create, summary, validate, menu, delete, build, and importing a
 *        module configuration into a standalone page.
 *
 * The server serves them with the generic record controller (plan 28): a record is read with
 * `GET /{entity}/{id}` (the manager summary is its `meta.website`), written with POST / PATCH / DELETE,
 * and the specific actions are `/{entity}/{id}/{action}` (`assign`, `import`, `execute`, `validate`,
 * `setup`). Searches go through `/records?q=t:...`.
 * The Website manager (apps/website), the module *Publish* (HostAdapter) and Explorer use it.
 * Failures are HeuristApiError with the server message.
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

/** Job type of a website build (srv `Website/Build/WebsiteBuildJob`). */
export const WEBSITE_BUILD_JOB = 'website-build';

/** Module types that can be published as a page (srv `CmsValidator::TYPES`). */
export const PUBLISHABLE_MODULES = Object.freeze(['explorer', 'data', 'map', 'timeline', 'graph', 'recordview']);

/** Calls of the website and page entities. */
export class WebsiteClient {
  /**
   * @param {{apiClient: object}} options HeuristApiClient (needs `request`).
   */
  constructor({ apiClient } = {}) {
    if (typeof apiClient?.request !== 'function') throw new TypeError('WebsiteClient requires an API client');
    this.apiClient = apiClient;
    this._codes = null;
  }

  /**
   * Definitions of the format and their local ids.
   *
   * @returns {Promise<{installed: boolean, missing: string[], canSetup: boolean, codes: Object<string, number>}>}
   */
  async status() {
    const result = await this._call('GET', '/website/setup');
    if (result?.codes) this._codes = Promise.resolve(result.codes);
    return result;
  }

  /** @returns {Promise<{report: string[], installed: boolean}>} Install the definitions (database managers). */
  async setup() {
    const result = await this._call('POST', '/website/setup', {});
    if (result?.codes) this._codes = Promise.resolve(result.codes);
    return result;
  }

  /**
   * Local ids of the website record types, fields and terms (srv `WebsiteRepository::CONCEPTS` names).
   *
   * @returns {Promise<Object<string, number>>}
   */
  codes() {
    if (!this._codes) {
      this._codes = this._call('GET', '/website/setup').then((result) => result?.codes || {});
      this._codes.catch(() => { this._codes = null; });
    }
    return this._codes;
  }

  /**
   * Create a v4 website (the server adds the starter content and an "About" page).
   *
   * @param {{title: string, languages?: string[]}} values Title and 3-letter language codes (first = default).
   * @returns {Promise<{id: number, record: object}>}
   */
  async create(values = {}) {
    const codes = await this.codes();
    const details = { [codes.name]: String(values.title || '') };
    if (Array.isArray(values.languages) && values.languages.length) details[codes.languages] = values.languages;
    const result = await this._call('POST', '/website/0', { rec_ID: 0, details });
    const record = result?.records?.[0] || null;
    return { id: Number(record?.rec_ID) || 0, record };
  }

  /**
   * Website or page for the manager (`meta.website` of `GET /{entity}/{id}`).
   *
   * @param {number} id Record id.
   * @param {{entity?: 'website'|'page'}} [options] Entity; without it a website is tried first, then a page.
   * @returns {Promise<{id: number, kind: 'website'|'standalone'|'page', version: string, v4: boolean, title: string,
   *          languages: string[], url: string, canEdit: boolean, pages: Array<{id: number, title: string, children: Array}>}>}
   */
  summary(id, { entity = null } = {}) {
    return this._withEntity(id, entity, async (name, recordId) => {
      const response = await this._call('GET', `/${name}/${recordId}`, undefined, { fields: 'rec_ID' });
      const meta = response?.meta || {};
      return { ...(meta.website || { id: recordId }), canEdit: meta.canEdit ?? meta.website?.canEdit ?? false };
    });
  }

  /**
   * Problems of the format of a website or page.
   *
   * @param {number} id Website or standalone page.
   * @param {{page?: number, entity?: 'website'|'page'}} [options] A page of the website.
   * @returns {Promise<{valid: boolean, issues: Array<{level: string, code: string, message: string, node: ?string}>}>}
   */
  validate(id, { page = 0, entity = null } = {}) {
    return this._withEntity(id, entity, (name, recordId) =>
      this._call('GET', `/${name}/${recordId}/validate`, undefined, page > 0 ? { page } : null));
  }

  /**
   * Import a module configuration into a standalone page (a new one, or update `pageId`).
   *
   * @param {{type: string, settings: object, state?: object|null, title?: string, pageId?: number}} values
   * @returns {Promise<{id: number, url: string, title: string, created: boolean}>}
   */
  publish(values = {}) {
    const { pageId = 0, ...input } = values || {};
    const id = Number(pageId) > 0 ? Number(pageId) : 0;
    return this._call('POST', `/page/${id}/import`, input);
  }

  /**
   * The standalone v4 pages of a module (plan 29: *Update the page*), newest first. A record search
   * (`t:` page, version 4, page type standalone); the module is found in the page configuration.
   *
   * @param {string} module Module type.
   * @returns {Promise<Array<{id: number, title: string, modified: string}>>}
   */
  async pages(module) {
    const type = String(module || '');
    const codes = await this.codes();
    if (!codes.page || !codes.version || !codes.configuration) return [];
    const filter = [{ t: String(codes.page) }, { [`f:${codes.version}`]: '4' }];
    if (codes.pageType && codes.standalonePage) filter.push({ [`f:${codes.pageType}`]: String(codes.standalonePage) });
    const response = await this._call('GET', '/records', undefined, {
      q: JSON.stringify(filter),
      fields: ['rec_ID', 'rec_Title', 'rec_Modified', codes.name, codes.configuration].filter(Boolean).join(','),
      limit: 500
    });
    const pages = [];
    for (const record of response?.records || []) {
      if (!holdsModule(firstValue(record.details?.[codes.configuration]), type)) continue;
      pages.push({
        id: Number(record.rec_ID),
        title: plainText(firstValue(record.details?.[codes.name])) || plainText(record.rec_Title),
        modified: String(record.rec_Modified || '')
      });
    }
    return pages.sort((a, b) => b.modified.localeCompare(a.modified) || b.id - a.id);
  }

  /**
   * Put a page into the menu of a website, or move it inside the menu.
   *
   * @param {number} siteId Website.
   * @param {number} pageId Page.
   * @param {{parent?: number, index?: number|null}} [options] Parent page (0 = top menu) and position.
   * @returns {Promise<object>} Summary of the website.
   */
  assign(siteId, pageId, { parent = 0, index = null } = {}) {
    const body = { page: positiveId(pageId), parent: Number(parent) || 0 };
    if (Number.isInteger(index) && index >= 0) body.index = index;
    return this._call('POST', `/website/${positiveId(siteId)}/assign`, body);
  }

  /**
   * Put a page at the end of the top menu or of a page's sub menu.
   *
   * @param {number} [parentId=0] Parent page; 0 = top menu.
   * @returns {Promise<object>} Summary of the website.
   */
  addToMenu(siteId, pageId, parentId = 0) {
    return this.assign(siteId, pageId, { parent: parentId });
  }

  /**
   * Take a page out of the menu of a website (the page stays, standalone).
   *
   * @returns {Promise<object>} Summary of the website.
   */
  removeFromMenu(siteId, pageId) {
    return this._call('DELETE', `/website/${positiveId(siteId)}/assign`, undefined, { page: positiveId(pageId) });
  }

  /**
   * Delete a standalone page, or a website (with `pages`: its menu pages no other record uses).
   *
   * @param {{pages?: boolean, entity?: 'website'|'page'}} [options]
   * @returns {Promise<{deleted: string[], kept?: string[]}>}
   */
  remove(id, { pages = false, entity = null } = {}) {
    return this._withEntity(id, entity, (name, recordId) =>
      this._call('DELETE', `/${name}/${recordId}`, undefined, pages && name === 'website' ? { pages: 1 } : null));
  }

  /**
   * Start a build of a v4 website or standalone page (job `website-build`).
   *
   * @param {{entity?: 'website'|'page'}} [options]
   * @returns {Promise<object>} The queued job.
   */
  build(id, { entity = null } = {}) {
    return this._withEntity(id, entity, (name, recordId) => this._call('POST', `/${name}/${recordId}/execute`, {}));
  }

  /** Run a call for an entity; without one, a website first and a page after a 404. */
  async _withEntity(id, entity, call) {
    const recordId = positiveId(id);
    const names = entity ? [entity] : ['website', 'page'];
    for (let index = 0; index < names.length; index++) {
      try {
        return await call(names[index], recordId);
      } catch (error) {
        if (error?.status !== 404 || index === names.length - 1) throw error;
      }
    }
    return null;
  }

  /** One request; the answer without an envelope. */
  async _call(method, path, body = undefined, query = null) {
    const response = await this.apiClient.request(path, { method, body, query });
    return response?.data ?? response;
  }
}

/** A positive record id or a TypeError. */
function positiveId(value) {
  const id = Number(value);
  if (!(Number.isInteger(id) && id > 0)) throw new TypeError(`Invalid record id: ${value}`);
  return id;
}

/** First value of a record detail (array of values, or one value). */
function firstValue(values) {
  const value = Array.isArray(values) ? values[0] : values;
  return value && typeof value === 'object' ? (value.value ?? '') : (value ?? '');
}

/** Text without tags. */
function plainText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Whether a page configuration (JSON) has an instance of a module. */
function holdsModule(configuration, type) {
  try {
    const instances = JSON.parse(String(configuration || '{}'))?.instances || {};
    return Object.values(instances).some((instance) => instance?.kind === 'module' && instance?.type === type);
  } catch {
    return false;
  }
}
