/**
 * @file WebsiteClient.js
 * @brief Client of the website API (`/api/{db}/website`, plans 27a / 27b): setup status, create,
 *        summary, validate, menu, delete, and publishing a module as a standalone page.
 *
 * The Website manager (apps/website) and the module *Publish* (HostAdapter) use it.
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

/** Calls of `/api/{db}/website`. */
export class WebsiteClient {
  /**
   * @param {{apiClient: object}} options HeuristApiClient (needs `request`).
   */
  constructor({ apiClient } = {}) {
    if (typeof apiClient?.request !== 'function') throw new TypeError('WebsiteClient requires an API client');
    this.apiClient = apiClient;
  }

  /** @returns {Promise<{installed: boolean, missing: string[], canSetup: boolean}>} Definitions of the format. */
  status() {
    return this._call('GET', '/website/setup');
  }

  /** @returns {Promise<{report: string[], installed: boolean}>} Install the definitions (database managers). */
  setup() {
    return this._call('POST', '/website/setup', {});
  }

  /**
   * Create a v4 website with one page.
   *
   * @param {{title: string, languages?: string[]}} values Title and 3-letter language codes (first = default).
   * @returns {Promise<{id: number, pageIds: number[], url: string}>}
   */
  create(values) {
    return this._call('POST', '/website', values || {});
  }

  /**
   * Website or page for the manager.
   *
   * @param {number} id Record id.
   * @returns {Promise<{id: number, kind: 'website'|'standalone'|'page', version: string, v4: boolean, title: string,
   *          languages: string[], url: string, canEdit: boolean, pages: Array<{id: number, title: string, children: Array}>}>}
   */
  summary(id) {
    return this._call('GET', `/website/${positiveId(id)}`);
  }

  /**
   * Problems of the format of a website or page.
   *
   * @param {number} id Website or standalone page.
   * @param {{page?: number}} [options] A page of the website.
   * @returns {Promise<{issues: Array<{level: string, code: string, message: string, node: ?string}>}>}
   */
  validate(id, { page = 0 } = {}) {
    return this._call('GET', `/website/${positiveId(id)}/validate`, undefined, page > 0 ? { page } : null);
  }

  /**
   * Publish a module as a standalone page (a new one, or update `pageId`).
   *
   * @param {{type: string, settings: object, state?: object|null, title?: string, pageId?: number}} values
   * @returns {Promise<{id: number, url: string, title: string, created: boolean}>}
   */
  publish(values) {
    return this._call('POST', '/website/publish', values || {});
  }

  /**
   * The standalone v4 pages of a module the user may update (plan 29), newest first.
   *
   * @param {string} module Module type.
   * @returns {Promise<Array<{id: number, title: string, url: string, modified: string}>>}
   */
  async pages(module) {
    const result = await this._call('GET', '/website/pages', undefined, { standalone: 1, module: String(module || '') });
    return Array.isArray(result?.pages) ? result.pages : [];
  }

  /**
   * Put a page into the menu of a website.
   *
   * @param {number} siteId Website.
   * @param {number} pageId Page.
   * @param {number} [parentId=0] Parent page; 0 = top menu.
   * @returns {Promise<object>} Summary of the website.
   */
  addToMenu(siteId, pageId, parentId = 0) {
    return this._call('POST', `/website/${positiveId(siteId)}/menu`, { pageId: positiveId(pageId), parentId: Number(parentId) || 0 });
  }

  /**
   * Take a page out of the menu of a website (the page stays, standalone).
   *
   * @returns {Promise<object>} Summary of the website.
   */
  removeFromMenu(siteId, pageId) {
    return this._call('DELETE', `/website/${positiveId(siteId)}/menu/${positiveId(pageId)}`);
  }

  /**
   * Delete a standalone page, or a website (with `pages`: its menu pages no other record uses).
   *
   * @returns {Promise<{deleted: number[], kept: number[]}>}
   */
  remove(id, { pages = false } = {}) {
    return this._call('DELETE', `/website/${positiveId(id)}`, undefined, pages ? { pages: 1 } : null);
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
