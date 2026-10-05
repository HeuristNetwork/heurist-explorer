/**
 * @file HeuristReportsPublicApi.js
 * @brief Public API of heurist-reports (browser global `heuristReports` when standalone).
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-reports
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

/** Public surface of the reports manager. */
export class HeuristReportsPublicApi extends EventTarget {
  /** @param {import('../core/ReportsApplication.js').ReportsApplication} application */
  constructor(application) {
    super();
    this._application = application;
    this._ready = Promise.resolve(this);
  }

  /** @param {Promise<*>} promise Resolves when the manager is shown. */
  setReadyPromise(promise) {
    this._ready = promise.then(() => this);
  }

  /** Resolves when the manager is ready. */
  ready() {
    return this._ready;
  }

  /** Reload the reports list. */
  refresh() {
    return this._application.refresh();
  }

  /**
   * Select a report.
   *
   * @param {number|string} reference Record id or template file name.
   */
  openReport(reference) {
    return this._application.selectReport(String(reference));
  }

  /**
   * Open the template editor of a report.
   *
   * @param {number|string} reference Record id or template file name.
   */
  openEditor(reference) {
    return this._application.openEditor(String(reference));
  }

  /** Whether an editor has unsaved changes. */
  hasUnsavedChanges() {
    return this._application.hasUnsavedChanges();
  }

  /** Remove the manager (running jobs continue on the server). */
  destroy() {
    return this._application.destroy();
  }
}
