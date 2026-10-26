/**
 * @file WebsiteApplication.js
 * @brief Controller of the Website manager (plan 27b): API clients, definitions, the selected
 *        website or page and its summary, setup, create, menu, delete, build jobs and
 *        "Publish this view" (Explorer).
 *
 * Events: `selectionchange` (a record was selected or its summary loaded), `listchange`
 * (records were added, changed or deleted), `buildchange` (a build of the selected record
 * started or ended).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-website
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HeuristApiClient, JobClient, WebsiteClient, WEBSITE_BUILD_JOB } from '#shared/api';
import { HDbDefs } from '#shared/data/HDbDefs.js';
import { publishModulePage } from '#shared/site/modulePublisher.js';

/** Concept codes of the website records and fields (srv `WebsiteRepository::CONCEPTS`). */
export const WEBSITE_CODES = Object.freeze({
  home: ['rty', '99-51'],
  page: ['rty', '99-52'],
  version: ['dty', '2-49'],
  pageType: ['dty', '2-928'],
  standalonePage: ['trm', '2-6254']
});

/** Website manager state and operations. */
export class WebsiteApplication extends EventTarget {
  /**
   * @param {object} options
   * @param {object} options.config Normalized configuration (`createWebsiteManagerConfig`).
   * @param {object|null} [options.bridge] Host bridge: `editRecord`, `viewRecord`, `canEditRecords`, `getDbDefs`,
   *        `isLoggedIn`, `captureView` (Explorer).
   * @param {object} [options.apiClient] HeuristApiClient (tests).
   */
  constructor({ config, bridge = null, apiClient = null }) {
    super();
    this.config = config;
    this.bridge = bridge || null;
    this.apiClient = apiClient || new HeuristApiClient({
      apiBaseUrl: config.apiBaseUrl,
      database: config.database,
      accessToken: config.accessToken,
      headers: config.requestHeaders
    });
    this.websites = new WebsiteClient({ apiClient: this.apiClient });
    this.jobs = new JobClient({ apiClient: this.apiClient });
    this.dbdefs = null;
    this.codes = {};
    this.status = null;
    this.selectedId = null;
    this.summary = null;
    this.summaryError = null;
    this.builds = [];
  }

  /**
   * Load definitions and the setup status.
   *
   * @returns {Promise<WebsiteApplication>}
   */
  async initialize() {
    this.dbdefs = await (typeof this.bridge?.getDbDefs === 'function'
      ? this.bridge.getDbDefs()
      : HDbDefs.load(this.apiClient.buildUrl('/def/snapshot'), { lang: this.config.language }));
    this.codes = Object.fromEntries(Object.entries(WEBSITE_CODES)
      .map(([name, [kind, code]]) => [name, this.dbdefs?.localId?.(kind, code) || 0]));
    try {
      this.status = await this.websites.status();
    } catch (error) {
      // a guest: no manager actions
      this.status = { installed: false, missing: [], canSetup: false, error: error?.message || String(error) };
    }
    return this;
  }

  /** @returns {boolean} The record types exist in this database. */
  hasRecordTypes() {
    return this.codes.home > 0 && this.codes.page > 0;
  }

  /** @returns {boolean} The host can open its record editor. */
  canEditRecords() {
    try {
      return typeof this.bridge?.editRecord === 'function' && this.bridge.canEditRecords?.() !== false;
    } catch {
      return false;
    }
  }

  /** @returns {boolean} The host is Explorer with a view to publish. */
  canPublishView() {
    return typeof this.bridge?.captureView === 'function';
  }

  /**
   * Select a record and load its summary and builds.
   *
   * @param {number|null} id Record id.
   * @returns {Promise<void>}
   */
  async select(id) {
    const recordId = Number(id) > 0 ? Number(id) : null;
    if (recordId === this.selectedId && this.summary) return;
    this.selectedId = recordId;
    this.summary = null;
    this.summaryError = null;
    this.builds = [];
    this._emit('selectionchange');
    if (!recordId) return;
    await this.reloadSummary();
  }

  /** Load the summary of the selected record again. */
  async reloadSummary() {
    const id = this.selectedId;
    if (!id) return;
    try {
      const summary = await this.websites.summary(id);
      if (this.selectedId !== id) return;
      this.summary = summary;
      this.summaryError = null;
    } catch (error) {
      if (this.selectedId !== id) return;
      this.summary = null;
      this.summaryError = error?.message || String(error);
    }
    await this.loadBuilds();
    this._emit('selectionchange');
  }

  /**
   * Install the definitions of the format (database managers).
   *
   * @returns {Promise<string[]>} Report lines.
   */
  async setup() {
    const result = await this.websites.setup();
    this.status = { installed: result.installed !== false, missing: result.missing || [], canSetup: result.canSetup !== false };
    return result.report || [];
  }

  /**
   * Create a website and select it.
   *
   * @param {{title: string, languages: string[]}} values
   * @returns {Promise<object>} `{id, url, pageIds}`.
   */
  async createWebsite(values) {
    const result = await this.websites.create(values);
    this._emit('listchange');
    await this.select(result.id);
    return result;
  }

  /**
   * Problems of the format of the selected record.
   *
   * @returns {Promise<Array<object>>}
   */
  async validate() {
    if (!this.selectedId) return [];
    const result = await this.websites.validate(this.selectedId);
    return result?.issues || [];
  }

  /**
   * Put the selected standalone page into a website menu.
   *
   * @param {number} siteId Website.
   * @param {number} [parentId=0] Parent page; 0 = top menu.
   * @returns {Promise<object>} Summary of the website.
   */
  async addToMenu(siteId, parentId = 0) {
    const pageId = this.selectedId;
    const site = await this.websites.addToMenu(siteId, pageId, parentId);
    this._emit('listchange');
    await this.select(siteId);
    return site;
  }

  /**
   * Take a page out of the menu of the selected website.
   *
   * @param {number} pageId Page.
   * @returns {Promise<void>}
   */
  async removeFromMenu(pageId) {
    await this.websites.removeFromMenu(this.selectedId, pageId);
    this._emit('listchange');
    await this.reloadSummary();
  }

  /**
   * Delete the selected website (with its menu pages when `pages`) or standalone page.
   *
   * @param {{pages?: boolean}} [options]
   * @returns {Promise<{deleted: number[], kept: number[]}>}
   */
  async deleteSelected({ pages = false } = {}) {
    const result = await this.websites.remove(this.selectedId, { pages });
    this.selectedId = null;
    this.summary = null;
    this.builds = [];
    this._emit('listchange');
    this._emit('selectionchange');
    return result;
  }

  /**
   * v4 websites the user may edit, for "Add to menu".
   *
   * @returns {Promise<Array<{id: number, title: string}>>}
   */
  async editableWebsites() {
    if (!this.codes.home || !this.codes.version) return [];
    const response = await this.apiClient.request('/records', {
      query: { q: JSON.stringify([{ t: String(this.codes.home) }, { [`f:${this.codes.version}`]: '4' }]), fields: 'rec_ID', limit: 200 }
    });
    const ids = (response?.records || []).map((record) => Number(record.rec_ID)).filter((id) => id > 0);
    const summaries = await Promise.all(ids.map((id) => this.websites.summary(id).catch(() => null)));
    return summaries.filter((summary) => summary?.canEdit && summary.v4).map((summary) => ({ id: summary.id, title: summary.title, pages: summary.pages }));
  }

  /**
   * Start a build of the selected record.
   *
   * @returns {Promise<object>} The queued job.
   */
  async startBuild() {
    const job = await this.jobs.start(WEBSITE_BUILD_JOB, { id: this.selectedId });
    this.builds = [job, ...this.builds.filter((item) => item.id !== job.id)];
    this._emit('buildchange');
    return job;
  }

  /** The user's builds of the selected record, newest first. */
  async loadBuilds() {
    const id = this.selectedId;
    if (!id || !this.summary?.v4 || this.summary.kind === 'page') {
      this.builds = [];
      return;
    }
    try {
      const jobs = await this.jobs.list({ type: WEBSITE_BUILD_JOB });
      if (this.selectedId === id) this.builds = (jobs || []).filter((job) => Number(job.params?.id) === id).slice(0, 5);
    } catch {
      this.builds = [];
    }
  }

  /**
   * Publish Explorer's current view as a standalone page (asks for the title and the page).
   *
   * @returns {Promise<object|null>} The page `{id, url, embed}`, null when cancelled.
   */
  async publishView() {
    const view = this.bridge.captureView();
    const result = await publishModulePage({
      client: this.websites,
      database: this.config.database,
      type: 'explorer',
      settings: view.settings,
      state: view.state
    });
    if (!result) return null;
    this._emit('listchange');
    await this.select(result.id);
    return result;
  }

  /** Open the host's record editor; the list and summary are reloaded after a save. */
  async editRecord(id) {
    const result = await this.bridge.editRecord(Number(id));
    if (result?.saved !== false) {
      this._emit('listchange');
      await this.reloadSummary();
    }
    return result;
  }

  _emit(type) {
    this.dispatchEvent(new Event(type));
  }
}
