/**
 * @file HeuristRecordViewHostAdapter.js
 * @brief Host bridge for embedded heurist-recordview operation.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-recordview
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HostAdapter } from "#shared/host";

/** Host adapter for heurist-recordview embedded in a legacy Heurist host. */
export class HeuristRecordViewHostAdapter extends HostAdapter {
  /**
   * @param {object} [options] Host adapter configuration.
   * @param {object|null} [options.bridge] Same-origin host bridge, when embedded in an iframe.
   * @param {string|null} [options.baseUrl] Base URL of the Heurist FrontController.
   * @param {string|null} [options.database] Target Heurist database name.
   * @param {Function|null} [options.fetchImpl] Fetch implementation to use instead of the global `fetch`.
   */
  constructor({ bridge = null, baseUrl = null, database = null, fetchImpl = null } = {}) {
    super({ bridge, baseUrl, database, fetchImpl, moduleType: "recordview" });
  }

  /** Perform any asynchronous setup the host adapter requires. No-op for this host. */
  async initialize() {}

  /**
   * Return optional capabilities: editing support, and whether Record View preferences/publishing are configured.
   *
   * @returns {{editing: boolean, recordViewPreferences: boolean, recordViewPublishing: boolean}}
   */
  getCapabilities() {
    return {
      editing: this.supportsEditing(),
      recordViewPreferences: Boolean(this.baseUrl && this.database),
      recordViewPublishing: Boolean(this.baseUrl && this.database),
      mapZoom: typeof this.bridge?.zoomToExtent === "function",
    };
  }

  /**
   * Publish the current selection to the host's global selection channel.
   *
   * Called only from `RecordViewApplication#navigateToRecord` — the passive
   * `setSelection()` path never calls this, per one-way selection sync.
   *
   * @param {Array<number>} recordIds Selected record IDs.
   * @returns {*} Result of the host's selection callback.
   */
  publishSelection(recordIds) {
    return this.bridge?.onSelection?.([...recordIds]);
  }

  /**
   * Ask the host to zoom its active map module to a WKT geometry's extent.
   *
   * @param {string} wkt WKT geometry text.
   * @returns {*} Result of the host's zoom action, or `null` when unsupported.
   */
  zoomToExtent(wkt) {
    return this.bridge?.zoomToExtent?.(wkt) ?? null;
  }

  /**
   * Whether the host currently has an active map module to zoom to. A live
   * check (unlike `getCapabilities().mapZoom`, which only reflects whether
   * the host bridge supports the action at all) — layout membership can
   * change while a record stays displayed.
   *
   * @returns {Promise<boolean>}
   */
  async hasMapModule() {
    if (typeof this.bridge?.zoomToExtent !== "function") return false;
    const context = await this.bridge?.getHostContext?.();
    return Boolean(context?.hasMapModule);
  }

  /** Release any resources held by the adapter. No-op for this host. */
  async destroy() {}
}
