/**
 * @file HeuristDataHostAdapter.js
 * @brief Host adapter for Heurist Data integrations.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HostAdapter } from "#shared/host";
import { HCollection } from "#shared/utils";
import { getAssetBaseUrl } from "#shared/ui";

/** Bridges application operations to the embedding Heurist host. */
export class HeuristDataHostAdapter extends HostAdapter {
  constructor({
    bridge = null,
    baseUrl = null,
    database = null,
    fetchImpl = null,
  } = {}) {
    super({ bridge, baseUrl, database, fetchImpl, moduleType: "data" });
    this.collection = database ? new HCollection({ database }) : null;
  }
  supportsViewing() {
    return typeof this.bridge?.viewRecord === "function";
  }
  viewRecord(recordId) {
    if (!this.supportsViewing())
      throw new Error("Record viewer is unavailable");
    return this.bridge.viewRecord(Number(recordId));
  }
  supportsCollection() {
    return Boolean(this.collection);
  }
  getCollection() {
    return Promise.resolve(this.collection?.get() || []);
  }
  addToCollection(recordIds) {
    if (!this.collection)
      throw new Error("Persistent collection is unavailable");
    return Promise.resolve(this.collection.add(normalizeIds(recordIds)));
  }
  removeFromCollection(recordIds) {
    if (!this.collection)
      throw new Error("Persistent collection is unavailable");
    return Promise.resolve(this.collection.remove(normalizeIds(recordIds)));
  }
  subscribeCollection(handler) {
    if (!this.collection) return null;
    return this.collection.subscribe((ids) => handler(normalizeIds(ids)));
  }
  getCapabilities() {
    return {
      editing:
        this.supportsEditing() && typeof this.bridge?.addRecord === "function",
      dataPreferences: Boolean(this.baseUrl),
      dataPublishing: Boolean(this.baseUrl),
      hostedPreferencesDialog: this.supportsHostedPreferencesDialog(),
      hostedPublishDialog: this.supportsHostedPublishDialog(),
      hostedHelp: this.supportsHostedHelp(),
      explorerDataSources: this.supportsExplorerDataSources(),
    };
  }

  getHostContext() {
    if (typeof this.bridge?.getHostContext === "function")
      return this.bridge.getHostContext();
    return this.supportsExplorerDataSources()
      ? { name: "heurist-explorer" }
      : { name: "heurist" };
  }

  supportsHostedPreferencesDialog() {
    return typeof this.bridge?.openPreferencesDialog === "function";
  }
  openPreferencesDialog(options) {
    if (!this.supportsHostedPreferencesDialog())
      throw new Error("Host preferences dialog is unavailable");
    return this.bridge.openPreferencesDialog(options);
  }
  supportsHostedPublishDialog() {
    return typeof this.bridge?.openPublishDialog === "function";
  }
  openPublishDialog(options) {
    if (!this.supportsHostedPublishDialog())
      throw new Error("Host publication dialog is unavailable");
    return this.bridge.openPublishDialog(options);
  }
  supportsHostedHelp() {
    return typeof this.bridge?.openHelp === "function";
  }
  openHelp(options = {}) {
    if (!this.supportsHostedHelp()) throw new Error("Host help is unavailable");
    // The manual lives beside this module's own bundle, a different origin/path
    // than whatever hosts it (e.g. heurist-explorer's own asset base), so the
    // host needs this module's base explicitly rather than resolving its own.
    return this.bridge.openHelp({ moduleName: "data", baseUrl: getAssetBaseUrl(), ...options });
  }
  supportsExplorerDataSources() {
    return (
      typeof this.bridge?.addDataSourceToWorkspace === "function" &&
      typeof this.bridge?.removeDataSourceFromWorkspace === "function" &&
      typeof this.bridge?.isDataSourceInWorkspace === "function" &&
      typeof this.bridge?.saveDatasourceAsFilter === "function" &&
      typeof this.bridge?.saveDatasourceAsSource === "function"
    );
  }

  addDataSourceToWorkspace(source, options) {
    return this.bridge.addDataSourceToWorkspace(source, options);
  }
  removeDataSourceFromWorkspace(source) {
    return this.bridge.removeDataSourceFromWorkspace(source);
  }
  isDataSourceInWorkspace(source) {
    return this.bridge.isDataSourceInWorkspace(source);
  }
  showDatasource(source) {
    return this.bridge.showDatasource?.(source);
  }
  saveDatasourceAsFilter(source) {
    return this.bridge.saveDatasourceAsFilter?.(source);
  }
  saveDatasourceAsSource(source, options) {
    return this.bridge.saveDatasourceAsSource?.(source, options);
  }
  async destroy() {
    this.collection?.destroy();
    this.collection = null;
    return super.destroy();
  }
  editFieldset(context) {
    if (typeof this.bridge?.editFieldset !== "function")
      throw new Error("Fieldset editor is unavailable from this host");
    return this.bridge.editFieldset(context);
  }
}

function normalizeIds(value) {
  return [
    ...new Set(
      (Array.isArray(value) ? value : value == null ? [] : [value])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}
