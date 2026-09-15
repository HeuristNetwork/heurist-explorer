/**
 * @file HeuristDataHostAdapter.js
 * @brief Host adapter for Heurist Data integrations.
 *
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 *
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HostAdapter } from "#shared/host";
import { HCollection } from "#shared/utils";

/** Bridges application operations to the embedding Heurist host. */
export class HeuristDataHostAdapter extends HostAdapter {
  /**
   * @param {object} [options] Host adapter configuration.
   * @param {object|null} [options.bridge] Same-origin host bridge, when embedded in an iframe.
   * @param {string|null} [options.baseUrl] Base URL of the Heurist FrontController.
   * @param {string|null} [options.database] Target Heurist database name; also namespaces the persistent collection.
   * @param {Function|null} [options.fetchImpl] Fetch implementation to use instead of the global `fetch`.
   */
  constructor({
    bridge = null,
    baseUrl = null,
    database = null,
    fetchImpl = null,
  } = {}) {
    super({ bridge, baseUrl, database, fetchImpl, moduleType: "data" });
    this.collection = database ? new HCollection({ database }) : null;
  }

  /** Whether the host can open a record viewer (delegates to the bridge's `viewRecord`). */
  supportsViewing() {
    return typeof this.bridge?.viewRecord === "function";
  }

  /**
   * Ask the host to open its record viewer for a record.
   *
   * @param {number|string} recordId Record ID to view.
   * @returns {*} Result of the host's view action.
   * @throws {Error} When the host cannot view records.
   */
  viewRecord(recordId) {
    if (!this.supportsViewing())
      throw new Error("Record viewer is unavailable");
    return this.bridge.viewRecord(Number(recordId));
  }

  /** Whether a persistent (browser-local) record collection is available. */
  supportsCollection() {
    return Boolean(this.collection);
  }

  /**
   * Read the current persistent collection.
   *
   * @returns {Promise<Array<number>>} Current collection record IDs, or `[]` when unavailable.
   */
  getCollection() {
    return Promise.resolve(this.collection?.get() || []);
  }

  /**
   * Add record IDs to the persistent collection.
   *
   * @param {number|string|Array<number|string>} recordIds Record ID(s) to add.
   * @returns {Promise<Array<number>>} Updated collection.
   * @throws {Error} When no persistent collection is available.
   */
  addToCollection(recordIds) {
    if (!this.collection)
      throw new Error("Persistent collection is unavailable");
    return Promise.resolve(this.collection.add(normalizeIds(recordIds)));
  }

  /**
   * Remove record IDs from the persistent collection.
   *
   * @param {number|string|Array<number|string>} recordIds Record ID(s) to remove.
   * @returns {Promise<Array<number>>} Updated collection.
   * @throws {Error} When no persistent collection is available.
   */
  removeFromCollection(recordIds) {
    if (!this.collection)
      throw new Error("Persistent collection is unavailable");
    return Promise.resolve(this.collection.remove(normalizeIds(recordIds)));
  }

  /**
   * Subscribe to persistent-collection changes, whether made locally or by another same-origin module.
   *
   * @param {function(Array<number>): void} handler Called with the new collection.
   * @returns {function(): void|null} Unsubscribe function, or `null` when no persistent collection is available.
   */
  subscribeCollection(handler) {
    if (!this.collection) return null;
    return this.collection.subscribe((ids) => handler(normalizeIds(ids)));
  }

  /**
   * Return the host's capability flags.
   *
   * @returns {{editing: boolean, dataPreferences: boolean, dataPublishing: boolean, hostedPreferencesDialog: boolean, hostedPublishDialog: boolean, explorerDataSources: boolean}} Capability flags.
   */
  getCapabilities() {
    return {
      editing:
        this.supportsEditing() && typeof this.bridge?.addRecord === "function",
      dataPreferences: Boolean(this.baseUrl),
      dataPublishing: Boolean(this.baseUrl),
      hostedPreferencesDialog: this.supportsHostedPreferencesDialog(),
      hostedPublishDialog: this.supportsHostedPublishDialog(),
      explorerDataSources: this.supportsExplorerDataSources(),
    };
  }

  /**
   * Return the embedding host's identity, preferring the bridge's own context when available.
   *
   * @returns {{name: string}} Host context.
   */
  getHostContext() {
    if (typeof this.bridge?.getHostContext === "function")
      return this.bridge.getHostContext();
    return this.supportsExplorerDataSources()
      ? { name: "heurist-explorer" }
      : { name: "heurist" };
  }

  /** Whether the host can open its own preferences dialog (delegates to the bridge's `openPreferencesDialog`). */
  supportsHostedPreferencesDialog() {
    return typeof this.bridge?.openPreferencesDialog === "function";
  }

  /**
   * Ask the host to open its own preferences dialog.
   *
   * @param {object} options Dialog options forwarded to the host.
   * @returns {*} Result of the host's dialog action.
   * @throws {Error} When the host has no preferences dialog.
   */
  openPreferencesDialog(options) {
    if (!this.supportsHostedPreferencesDialog())
      throw new Error("Host preferences dialog is unavailable");
    return this.bridge.openPreferencesDialog(options);
  }

  /** Whether the host can open its own publication dialog (delegates to the bridge's `openPublishDialog`). */
  supportsHostedPublishDialog() {
    return typeof this.bridge?.openPublishDialog === "function";
  }

  /**
   * Ask the host to open its own publication dialog.
   *
   * @param {object} options Dialog options forwarded to the host.
   * @returns {*} Result of the host's dialog action.
   * @throws {Error} When the host has no publication dialog.
   */
  openPublishDialog(options) {
    if (!this.supportsHostedPublishDialog())
      throw new Error("Host publication dialog is unavailable");
    return this.bridge.openPublishDialog(options);
  }

  /** Whether the host exposes the full Explorer DataSource/workspace bridge surface. */
  supportsExplorerDataSources() {
    return (
      typeof this.bridge?.addDataSourceToWorkspace === "function" &&
      typeof this.bridge?.removeDataSourceFromWorkspace === "function" &&
      typeof this.bridge?.isDataSourceInWorkspace === "function" &&
      typeof this.bridge?.saveDatasourceAsFilter === "function" &&
      typeof this.bridge?.saveDatasourceAsSource === "function"
    );
  }

  /**
   * Add a datasource to the Explorer workspace.
   *
   * @param {object} source Datasource to add.
   * @param {object} options Options forwarded to the host.
   * @returns {*} Result of the host's workspace action.
   */
  addDataSourceToWorkspace(source, options) {
    return this.bridge.addDataSourceToWorkspace(source, options);
  }

  /**
   * Remove a datasource from the Explorer workspace.
   *
   * @param {object} source Datasource to remove.
   * @returns {*} Result of the host's workspace action.
   */
  removeDataSourceFromWorkspace(source) {
    return this.bridge.removeDataSourceFromWorkspace(source);
  }

  /**
   * Check whether a datasource is in the Explorer workspace.
   *
   * @param {object} source Datasource to check.
   * @returns {*} Result of the host's workspace query.
   */
  isDataSourceInWorkspace(source) {
    return this.bridge.isDataSourceInWorkspace(source);
  }

  /**
   * Ask Explorer to activate and display a datasource.
   *
   * @param {object} source Datasource to show.
   * @returns {*} Result of the host action, or `undefined` when unsupported.
   */
  showDatasource(source) {
    return this.bridge.showDatasource?.(source);
  }

  /**
   * Ask Explorer to save a datasource as a saved filter.
   *
   * @param {object} source Datasource to save.
   * @returns {*} Result of the host action, or `undefined` when unsupported.
   */
  saveDatasourceAsFilter(source) {
    return this.bridge.saveDatasourceAsFilter?.(source);
  }

  /**
   * Ask Explorer to save a datasource as an RT_QUERY_SOURCE record.
   *
   * @param {object} source Datasource to save.
   * @param {object} options Options forwarded to the host.
   * @returns {*} Result of the host action, or `undefined` when unsupported.
   */
  saveDatasourceAsSource(source, options) {
    return this.bridge.saveDatasourceAsSource?.(source, options);
  }

  /**
   * Destroy the persistent collection and release base adapter resources.
   *
   * @returns {Promise<void>}
   */
  async destroy() {
    this.collection?.destroy();
    this.collection = null;
    return super.destroy();
  }

  /**
   * Ask the host to open its field-selection editor.
   *
   * @param {object} context Field-editor context (e.g. the current dataset).
   * @returns {*} Result of the host's editor action.
   * @throws {Error} When the host has no fieldset editor.
   */
  editFieldset(context) {
    if (typeof this.bridge?.editFieldset !== "function")
      throw new Error("Fieldset editor is unavailable from this host");
    return this.bridge.editFieldset(context);
  }
}

/** Normalize a value into a de-duplicated array of positive integer record IDs. */
function normalizeIds(value) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : value == null ? [] : [value])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}
