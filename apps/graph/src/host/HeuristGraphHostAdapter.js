/**
 * @file HeuristGraphHostAdapter.js
 * @brief Host bridge for embedded heurist-graph operation.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HostAdapter } from "#shared/host";

/** Host adapter for heurist-graph embedded in a legacy Heurist host. */
export class HeuristGraphHostAdapter extends HostAdapter {
  /**
   * @param {object} [options] Host adapter configuration.
   * @param {object|null} [options.bridge] Same-origin host bridge, when embedded in an iframe.
   * @param {string|null} [options.baseUrl] Base URL of the Heurist FrontController.
   * @param {string|null} [options.database] Target Heurist database name.
   * @param {Function|null} [options.fetchImpl] Fetch implementation to use instead of the global `fetch`.
   */
  constructor({ bridge = null, baseUrl = null, database = null, fetchImpl = null } = {}) {
    super({ bridge, baseUrl, database, fetchImpl, moduleType: "graph" });
  }

  /** Perform any asynchronous setup the host adapter requires. No-op for this host. */
  async initialize() {}

  /**
   * Ask the host to open its expansion-rule editor.
   *
   * @param {Array<object>} value Current expansion rule definitions.
   * @returns {*} Result of the host's rule editor.
   * @throws {Error} When the host does not support editing expansion rules.
   */
  editRules(value) {
    if (!this.bridge?.editRules) throw new Error('Expansion rule editor is not available in this host.');
    return this.bridge.editRules(value);
  }

  /**
   * Ask the host to resolve human-readable descriptions for expansion rules.
   *
   * @param {Array<object>} rules Expansion rule definitions.
   * @returns {*} Described rules, or `rules` unchanged when the host doesn't support description.
   */
  describeRules(rules) { return this.bridge?.describeRules?.(rules) || rules; }

  /**
   * Return optional capabilities: editing support, and whether graph preferences/publishing are configured.
   *
   * @returns {{editing: boolean, graphPreferences: boolean, graphPublishing: boolean}}
   */
  getCapabilities() {
    return {
      editing: this.supportsEditing(),
      graphPreferences: Boolean(this.baseUrl && this.database),
      graphPublishing: Boolean(this.baseUrl && this.database),
    };
  }

  /**
   * Publish the current selection to the host's global selection channel.
   *
   * @param {Array<number>} recordIds Selected record IDs.
   * @returns {*} Result of the host's selection callback.
   */
  publishSelection(recordIds) {
    return this.bridge?.onSelection?.([...recordIds]);
  }

  /** Release any resources held by the adapter. No-op for this host. */
  async destroy() {}
}
