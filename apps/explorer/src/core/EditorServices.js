/**
 * @file EditorServices.js
 * @brief Services of the record editor that need more than shared code (plan 21
 *        Phase 6): the map drawing of geo fields and filter extents (a dedicated Map
 *        module in a dialog), the query editor (HFilterBuilder) and the query in
 *        words. Moved out of ExplorerApplication, so the Explorer workspace and the
 *        editor mode (`editor/RecordEditorShell.js`) give the same services to
 *        RecordEditorHost.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-explorer
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HMsg, $HR } from '#shared/ui';
import { extentFromGeoJson, extentToGeoJson } from '#shared/utils';
import { IframeModuleAdapter } from '../modules/IframeModuleAdapter.js';
import queryVocabulary from '../utils/queryVocabulary.json';
import { queryDescribe } from '../utils/queryDescribe.js';
import { HFilterBuilder } from '../widgets/filter-builder/HFilterBuilder.js';

/** Map drawing, query editor and query description for the record editor and Explorer. */
export class EditorServices {
  /**
   * @param {object} options
   * @param {object} options.config Explorer configuration (database, URLs, language, `moduleUrls.map`).
   * @param {object|Function} options.apiClient HeuristApiClient, or a function returning it (created later).
   * @param {Function} options.ensureDbDefs Resolves with HDbDefs.
   * @param {Function} options.getDbDefs Returns the loaded HDbDefs or null (sync).
   * @param {Function} [options.hostActions] Host actions given to the drawing Map module.
   */
  constructor({ config, apiClient, ensureDbDefs, getDbDefs, hostActions = () => ({}) }) {
    this.config = config;
    this._apiClient = apiClient;
    this.ensureDbDefs = ensureDbDefs;
    this.getDbDefs = getDbDefs;
    this.hostActions = hostActions;
    this._drawDialog = null;
    this._drawModule = null;
  }

  /** @returns {object|null} The HeuristApiClient. */
  get apiClient() {
    return typeof this._apiClient === 'function' ? this._apiClient() : this._apiClient;
  }

  /** @returns {boolean} Whether a Map module URL is known (map drawing possible). */
  canDraw() {
    return Boolean(this.config.moduleUrls?.map);
  }

  /**
   * A query in words for titles, e.g. 'Find Persons where Gender is not "Male"';
   * `''` when it cannot be described.
   *
   * @param {*} q Query (array, object or text).
   * @returns {string}
   */
  describeQuery(q) {
    try {
      return queryDescribe(q, { dbdefs: this.getDbDefs() || null, vocabulary: queryVocabulary, lang: this.config.language }) || '';
    } catch {
      return '';
    }
  }

  /**
   * Open HFilterBuilder as a value editor and resolve with its JSON query, or null on cancel.
   *
   * @param {*} query Query.
   * @param {object|null} [filterForm] Filter form of the query.
   * @param {Function} [selectExtent] Extent picker of the builder; default: the map drawing.
   * @returns {Promise<{query: *, filterForm: object|null}|null>}
   */
  async editQuery(query, filterForm = null, selectExtent = (current) => this.selectFilterExtent(current)) {
    let dbdefs;
    try { dbdefs = await this.ensureDbDefs(); }
    catch (error) {
      HMsg.showMsgFlash?.($HR('Unable to load database structure') + ': ' + (error?.message || error));
      return null;
    }
    const host = document.createElement('div');
    const builder = new HFilterBuilder({
      dbdefs, vocabulary: queryVocabulary, lang: this.config.language, selectExtent, apiClient: this.apiClient
    });
    builder.attach(host).render();
    builder.setQuery({ query: query || [], filterForm });
    // its own dialog: flash messages use the shared message dialog, and opening
    // one there would replace the builder
    const dialogId = 'h-filter-builder-dialog';
    return new Promise((resolve) => {
      let settled = false;
      let dlg = null;
      const finish = async (value) => {
        if (settled) return;
        settled = true;
        dlg?.removeEventListener('close', onDialogClose);
        HMsg.closeMsgDlg?.(dialogId);
        await builder.destroy();
        resolve(value);
      };
      // the browser may close the dialog on Escape despite preventClose (it only
      // honours one cancel per user activation) - treat that as Cancel
      const onDialogClose = () => void finish(null);
      dlg = HMsg.showMsgDlg(host, {
        dialogId, title: 'Filter builder', preventClose: true,
        buttons: [
          { label: 'Apply', class: 'h-btn h-btn-primary', onClick: () => {
            try {
              void finish(builder.getDefinition());
            } catch (error) {
              HMsg.showMsgFlash?.(error.message);
            }
          } },
          { label: 'Cancel', class: 'h-btn', onClick: () => void finish(null) }
        ]
      });
      dlg?.addEventListener('close', onDialogClose);
    });
  }

  /**
   * Draw a filter extent with a dedicated Map instance hosted in a modal dialog.
   * The instance is kept for the page lifetime so reopening the extent editor does
   * not reload the Map module or discard its draw-mode state.
   *
   * @param {object|null} current Existing bounds, used to seed the drawn rectangle.
   * @returns {Promise<object|null>} West/south/east/north bounds, or null on cancel.
   */
  async selectFilterExtent(current = null) {
    const result = await this.drawOnMap({ mode: 'filter', geojson: extentToGeoJson(current) }, $HR('Define map extent'));
    return result ? extentFromGeoJson(result.geojson) : null;
  }

  /**
   * Draw a geometry (points, lines, polygons; WKT or GeoJSON can be pasted with "Add
   * Geometry") in the same Map dialog as the filter extent: geo fields of the edit
   * forms (plan 14a).
   *
   * @param {string|object|null} current Existing WKT or GeoJSON, drawn first.
   * @param {{allowMultiple?: boolean}} [options] Several objects in one value.
   * @returns {Promise<{type: string, wkt: string, geojson: object}|null>} The drawing, or null on cancel.
   */
  async selectGeometry(current = null, { allowMultiple = false } = {}) {
    const seed = typeof current === 'string' ? { wkt: current || null } : { geojson: current || null };
    return this.drawOnMap({ mode: 'full', allowMultiple, ...seed }, $HR('Define geometry'));
  }

  /**
   * Run one drawing session of the dedicated Map instance in a modal dialog.
   *
   * @param {object} drawOptions Map `beginDrawing` options (`mode`, `wkt`, `geojson`...).
   * @param {string} title Dialog title.
   * @returns {Promise<object|null>} The drawing result `{type, wkt, geojson}`, or null on cancel.
   */
  async drawOnMap(drawOptions, title) {
    const url = this.config.moduleUrls?.map;
    if (!url) throw new Error('Map drawing is not available');

    if (!this._drawModule) {
      const dlg = HMsg.getMsgDlg('dialog-filter-extent');
      dlg.classList.add('h-dialog-fullscreen');
      dlg.dataset.preventClose = 'false';
      dlg.querySelector('.h-dialog-footer').hidden = true;
      const body = dlg.querySelector('.h-dialog-body');
      body.classList.add('h-dialog-body-flush');
      body.replaceChildren();
      const container = document.createElement('div');
      container.style.cssText = 'flex:1 1 auto;min-height:0;';
      body.append(container);

      this._drawDialog = dlg;
      this._drawModule = new IframeModuleAdapter({
        id: 'filter-extent-map',
        type: 'map',
        container,
        url,
        runtime: {
          database: this.config.database,
          apiBaseUrl: this.config.apiBaseUrl,
          baseUrl: this.config.baseUrl,
          accessToken: this.config.accessToken,
          requestHeaders: this.config.requestHeaders,
          language: this.config.language,
          viewerMode: 'draw'
        },
        settings: {
          options: {
            ui: {
              initiallyExpanded: false,
              showCurrentDocument: false,
              showMapDocuments: true,
              showOptions: false,
              showPublish: false,
              showSourceHeader: false
            }
          }
        },
        hostActions: this.hostActions()
      });
      dlg.showModal();
      try {
        await this._drawModule.mount();
      } catch (error) {
        await this._drawModule.destroy();
        this._drawModule = null;
        dlg.close();
        throw error;
      }
    } else {
      this._drawDialog.showModal();
    }

    const dlg = this._drawDialog;
    const module = this._drawModule;
    dlg.querySelector('.h-dialog-title').textContent = title;
    try {
      await module.api.beginDrawing(drawOptions);
    } catch (error) {
      dlg.close();
      throw error;
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value, cancelDrawing = false) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (cancelDrawing) void module.api.cancelDrawing?.();
        dlg.close();
        resolve(value);
      };
      const onFinished = (event) => finish(event.detail?.result || null);
      const onCancelled = () => finish(null);
      const onDialogClose = () => finish(null, true);
      const cleanup = () => {
        module.api.removeEventListener('heurist-map-drawing-finished', onFinished);
        module.api.removeEventListener('heurist-map-drawing-cancelled', onCancelled);
        dlg.removeEventListener('close', onDialogClose);
      };
      module.api.addEventListener('heurist-map-drawing-finished', onFinished);
      module.api.addEventListener('heurist-map-drawing-cancelled', onCancelled);
      dlg.addEventListener('close', onDialogClose);
    });
  }

  /** @returns {Promise<void>} Completion after the drawing Map instance is removed. */
  async destroy() {
    await this._drawModule?.destroy?.();
    this._drawDialog?.remove?.();
    this._drawModule = null;
    this._drawDialog = null;
  }
}
