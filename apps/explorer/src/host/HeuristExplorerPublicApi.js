/**
 * @file HeuristExplorerPublicApi.js
 * @brief Exposes the embeddable public API for the Explorer application.
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

/** Public API facade that exposes Explorer operations to callers and host applications. */
export class HeuristExplorerPublicApi {
  /**
   * @param {import('../core/ExplorerApplication.js').ExplorerApplication} application Explorer application controller.
   */
  constructor(application) {
    this.application = application;
    this.readyPromise = null;
  }

  /**
   * Registers the promise that resolves once Explorer is ready.
   *
   * @param {Promise<HeuristExplorerPublicApi>} promise Ready promise.
   * @returns {void}
   */
  setReadyPromise(promise) { this.readyPromise = promise; }

  /**
   * Resolves when the application is ready.
   *
   * @returns {Promise<HeuristExplorerPublicApi>} Pending ready promise or this API instance.
   */
  ready() { return this.readyPromise || Promise.resolve(this); }

  /**
   * Sets the active Explorer datasource, synchronizing it to every mounted module.
   *
   * @param {object} source Datasource definition.
   * @returns {Promise<*>} Updated application state.
   */
  setDataSource(source) { return this.application.setDataSource(source); }

  /**
   * Sets the shared record selection, synchronizing it to every mounted module.
   *
   * @param {Array<number>} ids Selected record IDs.
   * @returns {Promise<Array<number>>} Updated selection.
   */
  setSelection(ids) { return this.application.setSelection(ids); }

  /**
   * Applies a workspace layout.
   *
   * @param {object} layout Layout definition.
   * @returns {Promise<*>} Updated application state.
   */
  applyLayout(layout) { return this.application.applyLayout(layout); }

  /**
   * New settings of the modules of one type, without mounting Explorer again (the CMS designer, review 2026-11-15).
   *
   * @param {string} type Module type.
   * @param {object} settings Settings envelope of the module.
   * @returns {Promise<boolean>} Whether a mounted module took them.
   */
  setModuleSettings(type, settings) { return this.application.setModuleSettings(type, settings); }

  /**
   * New settings of a published Explorer (a website page) without mounting it again: modules, layout and filters
   * (the CMS designer, review 2026-11-15).
   *
   * @param {object} settings heurist-explorer-settings.
   * @returns {Promise<boolean>} False: it must be mounted again (another language, not a published Explorer).
   */
  applySettings(settings) { return this.application.applySettings(settings); }

  /**
   * Returns the current serialized Explorer application state.
   *
   * @returns {object} Current application state.
   */
  getState() { return this.application.getState(); }

  /**
   * Add a record of a type (the action Add record of a website action menu, plan 27f §6): the record editor of
   * Explorer for system types, the host editor for others.
   *
   * @param {number|string} recordType Record type id or code name.
   * @returns {Promise<{saved: boolean, recordId: number}|*>}
   */
  addRecord(recordType) { return this.application.addRecord(recordType); }

  /**
   * Resizes Explorer and its mounted modules.
   *
   * @returns {Promise<void>|void} Resize result.
   */
  resize() { return this.application.resize(); }

  /**
   * Tears down Explorer and releases hosted resources.
   *
   * @returns {Promise<void>} Destroy operation result.
   */
  destroy() { return this.application.destroy(); }
}
